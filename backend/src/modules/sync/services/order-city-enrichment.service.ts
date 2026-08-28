import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { normalizeCityName } from '../../../common/utils/city-normalize.util';
import { normalizeEndDate, normalizeStartDate, toDayBucketColombia } from '../../../common/utils/date-range.util';
import { computeDiscountPercentage } from '../../../common/utils/discount.util';
import { getStoresConfig, StoreConfig } from '../../../config/stores.config';
import { EnrichmentStatus } from '../../orders/interfaces/product-analytics.interface';
import { VtexOrderDetailItem } from '../../orders/interfaces/vtex-order.interface';
import { VtexOrdersService } from '../../orders/services/vtex-orders.service';
import { OrderItemToStore, OrderItemsRepository } from '../../storage/repositories/order-items.repository';
import { OrderNeedingEnrichment, OrdersCacheRepository } from '../../storage/repositories/orders-cache.repository';
import { SyncJob, SyncJobsRepository } from '../../storage/repositories/sync-jobs.repository';

const JOB_LABEL = 'city-enrichment';
const UNKNOWN_CATEGORY = 'Sin categoría';
const UNKNOWN_BRAND = 'Sin marca';

/**
 * "Sin ciudad": la orden ya se revisó contra VTEX pero no tenía
 * `shippingData.address.city` (ej. retiro en tienda, ciertas órdenes de
 * marketplace). Se guarda como string vacío — NUNCA como NULL — porque
 * NULL sigue significando "todavía no revisada" en toda esta clase y en
 * `OrdersCacheRepository.findOrdersNeedingEnrichment`. Si se guardara NULL
 * aquí, el backfill nunca terminaría: volvería a seleccionar y a
 * re-consultar estas mismas órdenes en cada pasada, sin que su estado
 * cambiara nunca.
 */
const NO_CITY_SENTINEL = '';

/**
 * Enriquece las órdenes ya cacheadas con datos que el listado de VTEX no
 * trae y que solo se pueden obtener consultando el detalle de cada orden
 * individualmente: ciudad de envío (`shippingData.address.city`) y, en la
 * MISMA llamada (sin duplicar peticiones), el detalle a nivel de producto
 * de cada ítem — descuento, categoría y marca — que se guarda en
 * `order_items` (ver `OrderItemsRepository`) para `ProductAnalyticsService`.
 * Ninguno de estos datos cambia una vez creada la orden (a diferencia del
 * `status`), así que esto se trata como un enriquecimiento "una sola vez,
 * para siempre": ninguna orden completamente resuelta vuelve a
 * consultarse contra VTEX. Hay DOS señales independientes de progreso —
 * `city` (ciudad) e `items_enriched_at` (productos) — a propósito, NO
 * una sola: cuando se agregó `order_items` a este proyecto, decenas de
 * miles de órdenes ya tenían `city` resuelta de una versión anterior que
 * solo sacaba ciudad. Si "ya se procesó" dependiera únicamente de `city`,
 * esas órdenes nunca se hubieran vuelto a seleccionar para sacarles sus
 * productos. `findOrdersNeedingEnrichment` selecciona una orden si
 * CUALQUIERA de las dos sigue pendiente (`city IS NULL OR
 * items_enriched_at IS NULL`), así que este backlog se retoma solo, sin
 * necesitar una migración de datos manual.
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
/** Cuántas fallas consecutivas (dentro de UNA corrida del job) se toleran antes de saltarse una orden temporalmente — ver `runEnrichment`. */
const MAX_CONSECUTIVE_FAILURES = 3;
/**
 * Cuántas órdenes candidatas se piden de más por vuelta (por encima de
 * `batchSize`) para tener margen de saltarse las que ya vienen fallando
 * repetidamente en esta corrida, sin dejar de avanzar con las demás.
 */
const CANDIDATE_LOOKAHEAD = 20;

@Injectable()
export class OrderCityEnrichmentService implements OnModuleInit {
  private readonly logger = new Logger(OrderCityEnrichmentService.name);
  private readonly batchSize: number;
  private readonly batchPauseMs: number;
  private readonly storesById: Map<string, StoreConfig>;
  /**
   * Fallas consecutivas por orden DENTRO DE ESTA CORRIDA (en memoria, se
   * reinicia con cada `runEnrichment` nuevo — nunca se persiste). Existe
   * para que UNA orden problemática (ej. un caso no previsto, similar al
   * de EAN/SKU duplicados que ya motivó `mergeDuplicateItems`) no bloquee
   * el progreso de todas las demás: si `findOrdersNeedingEnrichment`
   * siempre devuelve la MISMA orden más reciente pendiente y esa orden
   * siempre falla, sin este mecanismo el job quedaría reintentándola para
   * siempre sin avanzar — se confirmó en producción. La orden sigue
   * `NULL` (nunca se marca como resuelta) y se reintenta normalmente en
   * la PRÓXIMA corrida del job.
   */
  private readonly consecutiveFailuresByOrder = new Map<string, number>();

  constructor(
    private readonly vtexOrdersService: VtexOrdersService,
    private readonly ordersCacheRepository: OrdersCacheRepository,
    private readonly orderItemsRepository: OrderItemsRepository,
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
   * todavía quedan órdenes pendientes (ciudad o productos), se dispara un
   * job nuevo. Esto NO pierde progreso: al reiniciar simplemente se
   * vuelve a consultar `findOrdersNeedingEnrichment`, que ya excluye todo
   * lo enriquecido antes de reiniciar.
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

    const pending = this.ordersCacheRepository.countOrdersNeedingEnrichment();
    if (pending === 0) return undefined;

    const job = this.syncJobsRepository.create(JOB_LABEL, pending);
    this.logger.log(
      `Iniciando enriquecimiento de ciudad en segundo plano (job ${job.id}): ${pending} orden(es) pendientes.`,
    );
    void this.runEnrichment(job.id);
    return job;
  }

  /**
   * Estado ACTUAL del enriquecimiento para una tienda, calculado al
   * vuelo (no vía `sync_jobs`) — ver la nota de diseño en el comentario
   * de clase sobre por qué. Si se pasan `startDate`/`endDate`, el % es
   * sobre las órdenes de ESE rango (lo que la persona está mirando en el
   * dashboard en ese momento); si se omiten, es sobre todo el histórico
   * cacheado de la tienda.
   *
   * NOTA DE DISEÑO — por qué esto NO usa `sync_jobs`: el backfill
   * histórico tiene un final claro (termina cuando ya no quedan días
   * pendientes), así que un modelo pending→running→completed le calza
   * bien. El enriquecimiento de ciudad/producto es continuo — llegan
   * órdenes nuevas todo el tiempo, nunca "termina" de verdad — forzarlo a
   * ese mismo modelo significaría o bien crear jobs nuevos sin parar, o
   * reutilizar uno "siempre corriendo" que nunca refleja un % real. Un
   * cálculo al vuelo contra `orders` (`city IS NULL` vs. total) siempre
   * refleja la realidad actual, sin mantener estado de job artificial.
   */
  getEnrichmentStatus(storeId: string, startDate?: string, endDate?: string): EnrichmentStatus {
    let startDay: string | undefined;
    let endDay: string | undefined;
    if (startDate && endDate) {
      startDay = toDayBucketColombia(normalizeStartDate(startDate));
      endDay = toDayBucketColombia(normalizeEndDate(endDate));
    }

    const { total, enriched } = this.ordersCacheRepository.getEnrichmentStatus(storeId, startDay, endDay);
    return {
      storeId,
      totalOrders: total,
      enrichedOrders: enriched,
      percentage: total > 0 ? Number(((enriched / total) * 100).toFixed(1)) : 100,
      isComplete: total === enriched,
    };
  }

  private async runEnrichment(jobId: string): Promise<void> {
    this.syncJobsRepository.update(jobId, { status: 'running' });
    this.consecutiveFailuresByOrder.clear();
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

        // Se piden más candidatas de las que realmente se van a procesar
        // (`CANDIDATE_LOOKAHEAD`) para poder saltarse, sin quedar
        // atascado, las que ya vienen fallando repetidamente en esta
        // corrida — ver comentario de `consecutiveFailuresByOrder`.
        const candidates = this.ordersCacheRepository.findOrdersNeedingEnrichment(
          Math.max(this.batchSize, CANDIDATE_LOOKAHEAD),
        );
        if (candidates.length === 0) break;

        const batch = candidates
          .filter((c) => (this.consecutiveFailuresByOrder.get(this.failureKey(c)) ?? 0) < MAX_CONSECUTIVE_FAILURES)
          .slice(0, this.batchSize);

        if (batch.length === 0) {
          // Todo lo que queda en este "vistazo" viene fallando repetido
          // en esta corrida — no tiene caso seguir insistiendo AHORA. Se
          // reintenta normalmente en la próxima corrida del job (nunca
          // se marca como resuelto), sin bloquear el resto del backlog.
          this.logger.warn(
            `[${jobId}] ${candidates.length} orden(es) siguen fallando repetidamente en esta corrida; se pausa aquí y se reintentan en la próxima.`,
          );
          break;
        }

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

  private failureKey(pending: { storeId: string; orderId: string }): string {
    return `${pending.storeId}:${pending.orderId}`;
  }

  private async enrichOne(pending: OrderNeedingEnrichment): Promise<void> {
    const store = this.storesById.get(pending.storeId);
    if (!store || !store.appKey || !store.appToken) {
      // Sin credenciales no hay forma de consultar el detalle; se marcan
      // AMBAS señales (ciudad con el sentinel, productos como
      // "revisados") para no reintentar esta orden en cada pasada — sin
      // credenciales, reintentar nunca va a funcionar.
      this.ordersCacheRepository.updateCity(pending.storeId, pending.orderId, NO_CITY_SENTINEL);
      this.ordersCacheRepository.markItemsEnriched(pending.storeId, pending.orderId);
      return;
    }

    try {
      const { city, items } = await this.enrichOrder(store, pending.orderId);
      const ref = { storeId: pending.storeId, sourceType: pending.sourceType, sourceKey: pending.sourceKey };
      if (items.length > 0) {
        this.orderItemsRepository.upsertItems(ref, pending.orderId, pending.dayBucket, items);
      }
      // Se marcan AMBAS señales de progreso al final, después de guardar
      // los productos: si `upsertItems` hubiera fallado, ni `city` ni
      // `items_enriched_at` quedarían escritos (el `catch` de abajo lo
      // captura), y la orden se reintenta completa en la próxima pasada
      // en vez de quedar "a medias" (marcada como resuelta sin tener sus
      // productos guardados).
      this.ordersCacheRepository.markItemsEnriched(pending.storeId, pending.orderId);
      this.ordersCacheRepository.updateCity(pending.storeId, pending.orderId, city ?? NO_CITY_SENTINEL);
      this.consecutiveFailuresByOrder.delete(this.failureKey(pending));
    } catch (error) {
      // No se escribe ninguna señal: la orden sigue necesitando
      // enriquecimiento y se reintentará en la próxima pasada del job (o
      // en el próximo boot), en vez de marcarse como resuelta por una
      // falla que podría ser transitoria. Se cuenta la falla para que,
      // si se repite varias veces seguidas en esta misma corrida, deje
      // de bloquear al resto del backlog (ver `runEnrichment`).
      const key = this.failureKey(pending);
      const failureCount = (this.consecutiveFailuresByOrder.get(key) ?? 0) + 1;
      this.consecutiveFailuresByOrder.set(key, failureCount);
      const message = `[${pending.storeId}] No se pudo enriquecer la orden ${pending.orderId} (intento ${failureCount}/${MAX_CONSECUTIVE_FAILURES} en esta corrida): ${
        error instanceof Error ? error.message : 'error desconocido'
      }`;
      if (failureCount >= MAX_CONSECUTIVE_FAILURES) {
        this.logger.error(`${message} — se deja de reintentar en esta corrida, se retomará en la próxima.`);
      } else {
        this.logger.warn(message);
      }
    }
  }

  /**
   * Consulta el detalle de UNA orden en VTEX y extrae: (1) su ciudad de
   * envío, ya normalizada, y (2) el detalle de cada producto (descuento,
   * categoría, marca) para `order_items`. El resto de la respuesta —
   * datos personales del cliente en `clientProfileData`, el resto de
   * `shippingData.address` (calle, destinatario, teléfono) — se descarta
   * de inmediato al retornar: nunca se guarda ni se loguea completa en
   * ningún lado.
   */
  async enrichOrder(store: StoreConfig, orderId: string): Promise<{ city: string | null; items: OrderItemToStore[] }> {
    const detail = await this.vtexOrdersService.fetchOrderDetail(store, orderId);
    const city = normalizeCityName(detail.shippingData?.address?.city);
    const items = this.mergeDuplicateItems((detail.items ?? []).map((item) => this.toStorableItem(item)));
    return { city, items };
  }

  /**
   * VTEX puede reportar el MISMO producto (mismo `ean`+`skuId`) en más de
   * una línea dentro de `items[]` de una misma orden — el caso real que
   * motivó esto: productos sin EAN/SKU real, donde varias líneas caen en
   * la misma key vacía `''`/`''`. Sin este merge, dos líneas con la misma
   * llave chocan contra la PRIMARY KEY de `order_items` y hacen fallar el
   * guardado de TODA la orden (y, peor, si esa orden queda como la más
   * reciente pendiente, el job la reintenta en cada vuelta sin nunca
   * avanzar a las demás — ver `runEnrichment`).
   *
   * Se combinan sumando cantidad y valor total, y recalculando un
   * precio/descuento PROMEDIO PONDERADO por esa cantidad — preserva el
   * valor monetario real agregado aunque se pierda el detalle de que
   * eran líneas separadas (aceptable: la analítica solo necesita el
   * total por categoría/marca, no la línea individual).
   */
  private mergeDuplicateItems(items: OrderItemToStore[]): OrderItemToStore[] {
    interface Accumulator extends OrderItemToStore {
      totalListValue: number;
      totalSellingValue: number;
    }
    const merged = new Map<string, Accumulator>();

    for (const item of items) {
      const key = `${item.ean}::${item.skuId}`;
      const listValue = item.listPrice * item.quantity;
      const sellingValue = item.sellingPrice * item.quantity;

      const current = merged.get(key);
      if (!current) {
        merged.set(key, { ...item, totalListValue: listValue, totalSellingValue: sellingValue });
        continue;
      }
      current.quantity += item.quantity;
      current.totalListValue += listValue;
      current.totalSellingValue += sellingValue;
    }

    return Array.from(merged.values()).map((entry) => {
      const listPrice = entry.quantity > 0 ? entry.totalListValue / entry.quantity : entry.listPrice;
      const sellingPrice = entry.quantity > 0 ? entry.totalSellingValue / entry.quantity : entry.sellingPrice;
      return {
        ean: entry.ean,
        skuId: entry.skuId,
        productName: entry.productName,
        category: entry.category,
        brand: entry.brand,
        quantity: entry.quantity,
        listPrice,
        sellingPrice,
        discountPercentage: computeDiscountPercentage(listPrice, sellingPrice),
      };
    });
  }

  /**
   * Convierte un ítem crudo del detalle de VTEX al formato que se guarda
   * en `order_items`: precios ya normalizados con el mismo divisor que
   * `totalValue` (`VtexOrdersService.normalizeMoney`), descuento ya
   * calculado y redondeado, categoría = la de más bajo nivel (primer
   * elemento de `additionalInfo.categories`).
   */
  private toStorableItem(item: VtexOrderDetailItem): OrderItemToStore {
    const listPrice = this.vtexOrdersService.normalizeMoney(item.price);
    const sellingPrice = this.vtexOrdersService.normalizeMoney(item.sellingPrice);
    const category = item.additionalInfo?.categories?.[0]?.name?.trim() || UNKNOWN_CATEGORY;
    const brand = item.additionalInfo?.brandName?.trim() || UNKNOWN_BRAND;

    return {
      ean: item.ean?.trim() ?? '',
      skuId: item.id?.trim() ?? '',
      productName: item.name ?? '',
      category,
      brand,
      quantity: item.quantity ?? 1,
      listPrice,
      sellingPrice,
      discountPercentage: computeDiscountPercentage(listPrice, sellingPrice),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
