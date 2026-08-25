import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { normalizeCityName } from '../../../common/utils/city-normalize.util';
import { getStoresConfig, StoreConfig } from '../../../config/stores.config';
import { VtexOrdersService } from '../../orders/services/vtex-orders.service';
import { OrdersCacheRepository } from '../../storage/repositories/orders-cache.repository';
import { SyncJob, SyncJobsRepository } from '../../storage/repositories/sync-jobs.repository';

const JOB_LABEL = 'city-enrichment';

/**
 * "Sin ciudad": la orden ya se revisó contra VTEX pero no tenía
 * `shippingData.address.city` (ej. retiro en tienda, ciertas órdenes de
 * marketplace). Se guarda como string vacío — NUNCA como NULL — porque
 * NULL sigue significando "todavía no revisada" en toda esta clase y en
 * `OrdersCacheRepository.findOrdersMissingCity`. Si se guardara NULL aquí,
 * el backfill nunca terminaría: volvería a seleccionar y a re-consultar
 * estas mismas órdenes en cada pasada, sin que su estado cambiara nunca.
 */
const NO_CITY_SENTINEL = '';

/**
 * Enriquece las órdenes ya cacheadas con su ciudad de envío
 * (`shippingData.address.city`), un dato que el listado de VTEX no trae y
 * que solo se puede obtener consultando el detalle de cada orden
 * individualmente. La ciudad de una orden nunca cambia una vez creada (a
 * diferencia del `status`), así que esto se trata como un enriquecimiento
 * "una sola vez, para siempre": ninguna orden con `city` ya resuelta
 * (`IS NOT NULL`) vuelve a consultarse contra VTEX.
 *
 * Corre exclusivamente en segundo plano, con baja prioridad REAL, no solo
 * aproximada: antes de encolar cada lote nuevo, espera a que
 * `VtexOrdersService.isListingBusy()` sea `false` (ver ese método) — es
 * decir, mientras haya AUNQUE SEA UNA consulta de listado en curso
 * (dashboard on-demand, backfill histórico o sync nocturna, de cualquier
 * tienda), este job simplemente no encola nada nuevo. Esto es necesario
 * porque `VtexOrdersService.fetchOrderDetail` pasa por el MISMO
 * `globalLimit` compartido, que es estrictamente FIFO (sin noción de
 * prioridad): encolar un lote de detalle justo antes de que llegue una
 * consulta real puede demorarla lo suficiente como para que la ventana
 * "en vivo" (que sigue mutando en tiempo real) alcance a "correrse" entre
 * página y página de su propia paginación — se confirmó en producción que
 * esto podía hacerle perder una orden a Pilatos (la tienda con más
 * fuentes simultáneas: `main` + 10 segmentos por consulta), especialmente
 * cuando el enriquecimiento encolaba lotes grandes. `cityEnrichmentBatchSize`/
 * `cityEnrichmentBatchPauseMs` siguen existiendo como segunda capa (evitan
 * un spin-loop pegado a la base de datos en momentos sin tráfico), pero
 * la garantía real de no interferir es la espera activa de arriba, no el
 * tamaño del lote.
 *
 * El job se dispara desde tres lugares (todos idempotentes gracias a
 * `findRunningByLabel`, así que nunca corren dos a la vez):
 *   1. Automáticamente al arrancar el backend (`onModuleInit`), si quedan
 *      órdenes pendientes.
 *   2. Automáticamente después de cada lote de órdenes cacheado (ver
 *      `HistoricalSyncService`), sin bloquear esa respuesta.
 *   3. Manualmente, vía `POST /api/sync/enrich-cities`.
 */
@Injectable()
export class OrderCityEnrichmentService implements OnModuleInit {
  private readonly logger = new Logger(OrderCityEnrichmentService.name);
  private readonly batchSize: number;
  private readonly batchPauseMs: number;
  private readonly storesById: Map<string, StoreConfig>;

  constructor(
    private readonly vtexOrdersService: VtexOrdersService,
    private readonly ordersCacheRepository: OrdersCacheRepository,
    private readonly syncJobsRepository: SyncJobsRepository,
    private readonly configService: ConfigService,
  ) {
    this.batchSize = this.configService.get<number>('app.vtex.cityEnrichmentBatchSize', 5);
    this.batchPauseMs = this.configService.get<number>('app.vtex.cityEnrichmentBatchPauseMs', 500);
    this.storesById = new Map(getStoresConfig().map((store) => [store.id, store]));
  }

  /**
   * Al arrancar el backend: cualquier job de enriquecimiento que haya
   * quedado `pending`/`running` de un proceso anterior interrumpido a
   * medio camino se marca como fallido (ya no hay forma de que ese job
   * siga corriendo — el proceso Node que lo ejecutaba ya no existe), y si
   * todavía quedan órdenes sin ciudad, se dispara un job nuevo. Esto NO
   * pierde progreso: al reiniciar simplemente se vuelve a consultar
   * `city IS NULL`, que ya excluye todo lo enriquecido antes de reiniciar.
   *
   * El disparo real se retrasa unos segundos para no competir con el
   * arranque del resto de la aplicación (conexión a la base, primeras
   * peticiones del frontend, etc.).
   */
  onModuleInit(): void {
    this.syncJobsRepository.failStaleRunningJobs(JOB_LABEL, 'Interrumpido por reinicio del backend');
    setTimeout(() => this.triggerEnrichment(), 5000);
  }

  /**
   * Dispara (o reutiliza, si ya hay uno corriendo) el job de
   * enriquecimiento. Fire-and-forget: nunca bloquea a quien lo llama — ni
   * una respuesta HTTP del dashboard, ni el flujo normal de
   * sincronización. Retorna `undefined` si no había nada pendiente.
   */
  triggerEnrichment(): SyncJob | undefined {
    const existing = this.syncJobsRepository.findRunningByLabel(JOB_LABEL);
    if (existing) return existing;

    const pending = this.ordersCacheRepository.countOrdersMissingCity();
    if (pending === 0) return undefined;

    const job = this.syncJobsRepository.create(JOB_LABEL, pending);
    this.logger.log(
      `Iniciando enriquecimiento de ciudad en segundo plano (job ${job.id}): ${pending} orden(es) pendientes.`,
    );
    void this.runEnrichment(job.id);
    return job;
  }

  private async runEnrichment(jobId: string): Promise<void> {
    this.syncJobsRepository.update(jobId, { status: 'running' });
    let completed = 0;

    try {
      for (;;) {
        // Ceder el paso de verdad: mientras haya una consulta de listado
        // en curso (dashboard on-demand, backfill histórico o sync
        // nocturna — cualquiera que use `fetchAllOrders`), NO se encola
        // un lote nuevo. `globalLimit` es FIFO sin prioridad, así que
        // "no encolar nada" es la única forma real de garantizar que el
        // enriquecimiento nunca demore una ventana "en vivo" que sigue
        // mutando (ver comentario de `isListingBusy`) — depender solo de
        // lotes chicos + pausa no bastaba: se demostró en producción que
        // podía "correr" la paginación de Pilatos (11 fuentes por
        // consulta) el tiempo suficiente para perder una orden.
        while (this.vtexOrdersService.isListingBusy()) {
          await this.sleep(this.batchPauseMs);
        }

        const batch = this.ordersCacheRepository.findOrdersMissingCity(this.batchSize);
        if (batch.length === 0) break;

        await Promise.all(batch.map((pending) => this.enrichOne(pending)));
        completed += batch.length;
        this.syncJobsRepository.update(jobId, { completedDays: completed });

        // Pausa entre lotes (además de la espera de arriba): evita que,
        // en un momento sin tráfico de listado, el loop se convierta en
        // un spin loop pegado a la base de datos/CPU.
        await this.sleep(this.batchPauseMs);
      }
      this.syncJobsRepository.update(jobId, { status: 'completed' });
      this.logger.log(`Enriquecimiento de ciudad completado (job ${jobId}): ${completed} orden(es) procesada(s).`);
    } catch (error) {
      this.syncJobsRepository.update(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'error desconocido',
      });
      this.logger.error(`Enriquecimiento de ciudad falló (job ${jobId}).`);
    }
  }

  private async enrichOne(pending: { storeId: string; orderId: string }): Promise<void> {
    const store = this.storesById.get(pending.storeId);
    if (!store || !store.appKey || !store.appToken) {
      // Sin credenciales no hay forma de consultar el detalle; se marca
      // con el sentinel para no reintentarla en cada pasada del backfill.
      this.ordersCacheRepository.updateCity(pending.storeId, pending.orderId, NO_CITY_SENTINEL);
      return;
    }

    try {
      const city = await this.enrichOrder(store, pending.orderId);
      this.ordersCacheRepository.updateCity(pending.storeId, pending.orderId, city ?? NO_CITY_SENTINEL);
    } catch (error) {
      // No se escribe ninguna ciudad: la orden sigue con `city IS NULL` y
      // se reintentará en la próxima pasada del job (o en el próximo
      // boot), en vez de marcarse como "sin ciudad" por una falla que
      // podría ser transitoria.
      this.logger.warn(
        `[${pending.storeId}] No se pudo enriquecer la ciudad de la orden ${pending.orderId}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  /**
   * Consulta el detalle de UNA orden en VTEX y extrae ÚNICAMENTE su
   * ciudad de envío, ya normalizada. El resto de la respuesta — que
   * incluye datos personales del cliente en `clientProfileData` y en
   * `shippingData.address` (calle, destinatario, teléfono) — se descarta
   * de inmediato al retornar: nunca se guarda ni se loguea completa en
   * ningún lado.
   */
  async enrichOrder(store: StoreConfig, orderId: string): Promise<string | null> {
    const detail = await this.vtexOrdersService.fetchOrderDetail(store, orderId);
    return normalizeCityName(detail.shippingData?.address?.city);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
