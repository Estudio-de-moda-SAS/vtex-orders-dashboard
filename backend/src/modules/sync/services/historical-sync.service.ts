import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';

import {
  dayBucketEndIso,
  dayBucketStartIso,
  enumerateDayBuckets,
  subtractDaysUtc,
  todayColombia,
} from '../../../common/utils/date-range.util';
import { StoreConfig } from '../../../config/stores.config';
import { VtexOrder } from '../../orders/interfaces/vtex-order.interface';
import { VtexOrdersService } from '../../orders/services/vtex-orders.service';
import { OrderSourceRef, OrdersCacheRepository } from '../../storage/repositories/orders-cache.repository';
import { SyncJob, SyncJobsRepository } from '../../storage/repositories/sync-jobs.repository';
import { SyncWatermarkRepository } from '../../storage/repositories/sync-watermark.repository';
import { ResolveRangeResult, ResolvedSourceData, SourceDefinition } from '../interfaces/sync.types';
import { LiveQueryDedupeCache } from './live-query-dedupe.cache';
import { OrderCityEnrichmentService } from './order-city-enrichment.service';

function sourceLabel(ref: OrderSourceRef): string {
  return ref.sourceKey ? `${ref.storeId}:${ref.sourceType}:${ref.sourceKey}` : `${ref.storeId}:${ref.sourceType}`;
}

/**
 * Orquesta la estrategia de caché histórico: para un rango de fechas y un
 * conjunto de "fuentes" (la tienda en general, y sus segmentos de
 * vendedores/marketplaces si los tiene), decide qué se puede leer del
 * caché local (SQLite), qué se debe consultar en vivo, y qué requiere un
 * backfill en segundo plano.
 *
 * Reglas:
 * - Un día se considera "cerrado" si es anterior a
 *   `hoy - immutabilityWindowDays` (default 40 días). Una vez cerrado y
 *   sincronizado exitosamente, nunca se vuelve a pedir a VTEX. Para estos
 *   días la exactitud es estricta: cualquier discrepancia es un error real.
 * - Un día dentro de la ventana de inmutabilidad (incluyendo hoy) siempre
 *   se consulta en vivo, porque todavía podría cambiar. Aquí se distingue
 *   explícitamente entre dos cosas que NO son lo mismo:
 *     (a) una página que de verdad no se pudo descargar (falla real,
 *         `pagesFailed > 0` en el resultado de VTEX), y
 *     (b) que el conteo final no coincida exactamente con lo que VTEX
 *         reportó al iniciar (`missingOrders > 0` pero `pagesFailed === 0`)
 *         — esto es esperado en una tienda con mucho movimiento: es una
 *         "foto" de un momento, tomada mientras el dato seguía cambiando,
 *         no una falla de nuestro sistema. Solo (a) marca la fuente como
 *         incompleta; (b) se expone igual (nunca se oculta el número
 *         real), pero no dispara la alerta de "revisar datos".
 * - Si hay pocos días cerrados sin sincronizar (<= `inlineBackfillMaxDays`),
 *   se traen en línea, como parte de la misma petición HTTP.
 * - Si hay muchos (ej. "todo 2025" la primera vez), se lanza un job de
 *   fondo que no bloquea la petición: el dashboard responde de inmediato
 *   con lo que ya haya en caché, y el frontend puede consultar el progreso
 *   del job y refrescar cuando termine.
 */
@Injectable()
export class HistoricalSyncService {
  private readonly logger = new Logger(HistoricalSyncService.name);
  private readonly immutabilityWindowDays: number;
  private readonly inlineBackfillMaxDays: number;
  private readonly backfillDayConcurrency: number;
  private readonly liveQueryDedupeTtlMs: number;

  constructor(
    private readonly vtexOrdersService: VtexOrdersService,
    private readonly ordersCacheRepository: OrdersCacheRepository,
    private readonly syncWatermarkRepository: SyncWatermarkRepository,
    private readonly syncJobsRepository: SyncJobsRepository,
    private readonly liveQueryDedupeCache: LiveQueryDedupeCache,
    private readonly orderCityEnrichmentService: OrderCityEnrichmentService,
    private readonly configService: ConfigService,
  ) {
    this.immutabilityWindowDays = this.configService.get<number>('app.storage.immutabilityWindowDays', 40);
    this.inlineBackfillMaxDays = this.configService.get<number>('app.storage.inlineBackfillMaxDays', 3);
    this.liveQueryDedupeTtlMs = this.configService.get<number>('app.storage.liveQueryDedupeTtlMs', 30000);
    const pageConcurrency = this.configService.get<number>('app.vtex.pageConcurrency', 3);
    this.backfillDayConcurrency = pageConcurrency >= 3 ? 2 : 1;
  }

  /**
   * Punto de entrada principal. Para cada fuente dada, resuelve el rango
   * pedido combinando caché + consulta en vivo, y decide si hace falta un
   * backfill en segundo plano.
   */
  async resolveRange(
    store: StoreConfig,
    sources: SourceDefinition[],
    startDateIso: string,
    endDateIso: string,
    forceRefresh: boolean,
  ): Promise<ResolveRangeResult> {
    const allDays = enumerateDayBuckets(startDateIso, endDateIso);
    const cutoffDay = subtractDaysUtc(todayColombia(), this.immutabilityWindowDays);
    const closedDays = allDays.filter((d) => d <= cutoffDay);
    const mutableDays = allDays.filter((d) => d > cutoffDay);

    // Si se pide forzar actualización, se trata todo como "no sincronizado"
    // para esta resolución (se ignora el caché de días cerrados).
    const missingBySource = new Map<string, string[]>();
    let totalMissingClosedDays = 0;

    for (const source of sources) {
      const syncedDays = forceRefresh
        ? new Set<string>()
        : this.syncWatermarkRepository.getSyncedDays(source.ref, closedDays);
      const missing = closedDays.filter((d) => !syncedDays.has(d));
      missingBySource.set(sourceLabel(source.ref), missing);
      totalMissingClosedDays += missing.length;
    }

    let backgroundJobId: string | undefined;
    let backgroundSyncInProgress = false;

    if (totalMissingClosedDays > 0) {
      if (totalMissingClosedDays <= this.inlineBackfillMaxDays) {
        // Pocos días pendientes: se traen en línea, bloqueando esta
        // petición un poco, pero de forma acotada.
        for (const source of sources) {
          const missing = missingBySource.get(sourceLabel(source.ref)) ?? [];
          await this.syncDays(store, source, missing);
        }
      } else {
        // Backfill grande: se lanza (o reutiliza) un job de fondo.
        const label = `backfill:${store.id}:${startDateIso}:${endDateIso}`;
        let job = this.syncJobsRepository.findRunningByLabel(label);
        if (!job) {
          job = this.startBackgroundBackfill(label, store, sources, missingBySource, totalMissingClosedDays);
        }
        backgroundJobId = job.id;
        backgroundSyncInProgress = true;
      }
    }

    // Vuelve a calcular qué falta DESPUÉS del backfill en línea (si aplicó),
    // para saber qué leer de caché vs. qué quedó pendiente para el job de
    // fondo.
    const resolvedSources: ResolvedSourceData[] = [];
    for (const source of sources) {
      const cachedClosedOrders = closedDays.length
        ? this.ordersCacheRepository.getOrdersInRange(
            source.ref,
            closedDays[0],
            closedDays[closedDays.length - 1],
          )
        : [];

      let mutableOrders: VtexOrder[] = [];
      let mutableIsComplete = true;
      if (mutableDays.length > 0) {
        const mutableStartIso = dayBucketStartIso(mutableDays[0]);
        const mutableEndIso = dayBucketEndIso(mutableDays[mutableDays.length - 1]);
        // Deduplicación de consultas en vivo: si otra petición (de esta
        // misma persona refrescando, o de otra persona abriendo el
        // dashboard casi al mismo tiempo) ya pidió exactamente esta misma
        // ventana hace pocos segundos, se reutiliza ese resultado en vez
        // de generar otra ráfaga de peticiones a VTEX.
        const dedupeKey = `${sourceLabel(source.ref)}:${mutableStartIso}:${mutableEndIso}`;
        try {
          const liveResult = await this.liveQueryDedupeCache.dedupe(dedupeKey, this.liveQueryDedupeTtlMs, () =>
            this.vtexOrdersService.fetchAllOrders(store, mutableStartIso, mutableEndIso, source.extraParams),
          );
          mutableOrders = liveResult.orders;
          // IMPORTANTE: para la ventana mutable, "incompleto" significa
          // específicamente "una página no se pudo descargar" — NO que el
          // conteo final no coincida exactamente con el `paging.total` que
          // VTEX reportó al iniciar. Esa pequeña discrepancia es esperada
          // en una tienda con movimiento activo (una orden nueva pudo
          // entrar mientras terminábamos de paginar) y no es un error de
          // nuestro sistema; por eso no se usa `liveResult.isComplete`
          // (que exige coincidencia exacta) sino solo `pagesFailed`.
          mutableIsComplete = liveResult.pagesFailed === 0;
          // Se cachea de forma oportunista (útil si esta misma ventana se
          // vuelve a pedir hoy), pero NO se marca watermark: sigue siendo
          // mutable y debe volver a consultarse la próxima vez.
          this.ordersCacheRepository.upsertOrders(source.ref, mutableOrders);
          // Fire-and-forget, baja prioridad: no bloquea esta respuesta ni
          // compite por prioridad con la sincronización normal (ver
          // `OrderCityEnrichmentService`). Es un no-op si ya hay un job
          // corriendo o si no hay nada pendiente.
          this.orderCityEnrichmentService.triggerEnrichment();
          // El fetch EN VIVO recién hecho nunca trae `city` (VTEX no la
          // expone en el listado; solo se agrega en segundo plano sobre la
          // copia cacheada — ver `OrderCityEnrichmentService`). Sin este
          // re-lectura, cualquier orden dentro de la ventana mutable (los
          // últimos `immutabilityWindowDays` días — en la práctica, TODO
          // rango "reciente" que alguien consulte) mostraría "Sin ciudad"
          // para siempre sin importar cuánto avance el backfill, porque la
          // versión "fresca" sin ciudad siempre pisaría a la cacheada ya
          // enriquecida. Como el upsert de arriba ya es síncrono (mismo
          // proceso, misma conexión SQLite), esta relectura ve exactamente
          // lo que se acaba de escribir, más `city` si alguna de estas
          // órdenes ya se había enriquecido en una pasada anterior.
          mutableOrders = this.ordersCacheRepository.getOrdersInRange(
            source.ref,
            mutableDays[0],
            mutableDays[mutableDays.length - 1],
          );
        } catch (error) {
          mutableIsComplete = false;
          this.logger.warn(
            `[${sourceLabel(source.ref)}] Falló la consulta en vivo de la ventana mutable: ${
              error instanceof Error ? error.message : 'error desconocido'
            }`,
          );
        }
      }

      const stillMissing = missingBySource.get(sourceLabel(source.ref)) ?? [];
      // Se re-consulta el watermark (sin importar `forceRefresh`): si el
      // backfill en línea de arriba ya sincronizó estos días, ahora deben
      // aparecer como sincronizados.
      const syncedNow = this.syncWatermarkRepository.getSyncedDays(source.ref, stillMissing);
      const remainingAfterInline = stillMissing.filter((d) => !syncedNow.has(d));

      const dedupedById = new Map<string, VtexOrder>();
      for (const order of cachedClosedOrders) dedupedById.set(order.orderId, order);
      for (const order of mutableOrders) dedupedById.set(order.orderId, order);

      resolvedSources.push({
        ref: source.ref,
        label: source.label,
        orders: Array.from(dedupedById.values()),
        isComplete: mutableIsComplete && remainingAfterInline.length === 0,
      });
    }

    return {
      sources: resolvedSources,
      backgroundSyncInProgress,
      backgroundJobId,
      pendingClosedDays: totalMissingClosedDays <= this.inlineBackfillMaxDays ? 0 : totalMissingClosedDays,
    };
  }

  getJobStatus(jobId: string): SyncJob | undefined {
    return this.syncJobsRepository.findById(jobId);
  }

  /**
   * Sincroniza (trae de VTEX y cachea) una lista de días para UNA fuente,
   * día por día. Estos SIEMPRE son días "cerrados" (históricos, ya fuera
   * de la ventana de inmutabilidad), así que aquí SÍ se exige exactitud
   * estricta: `result.isComplete` (que incluye el chequeo de conteo total,
   * no solo páginas fallidas) determina si el día queda marcado como
   * sincronizado — un día histórico con discrepancia de conteo NO debería
   * pasar, porque a diferencia de la ventana mutable, este dato ya no
   * debería estar cambiando.
   */
  private async syncDays(
    store: StoreConfig,
    source: SourceDefinition,
    days: string[],
    onDaySynced?: () => void,
  ): Promise<void> {
    if (days.length === 0) return;
    const limit = pLimit(this.backfillDayConcurrency);

    await Promise.all(
      days.map((day) =>
        limit(async () => {
          try {
            const dayStartIso = dayBucketStartIso(day);
            const dayEndIso = dayBucketEndIso(day);
            const result = await this.vtexOrdersService.fetchAllOrders(
              store,
              dayStartIso,
              dayEndIso,
              source.extraParams,
            );
            this.ordersCacheRepository.upsertOrders(source.ref, result.orders);
            this.syncWatermarkRepository.markDaySynced(source.ref, day, result.isComplete);
            this.orderCityEnrichmentService.triggerEnrichment();
          } catch (error) {
            this.logger.error(
              `[${sourceLabel(source.ref)}] Falló la sincronización del día ${day}: ${
                error instanceof Error ? error.message : 'error desconocido'
              }`,
            );
            // No se marca watermark: el día queda pendiente para el próximo intento.
          } finally {
            onDaySynced?.();
          }
        }),
      ),
    );
  }

  /**
   * Lanza un job de fondo que sincroniza todos los días pendientes de
   * todas las fuentes dadas. NO se espera (no se hace `await` desde el
   * llamador) — corre en segundo plano mientras la petición HTTP ya
   * respondió. El estado se persiste en `sync_jobs` para poder consultarlo
   * después (y para sobrevivir un reinicio del backend a medio camino).
   */
  private startBackgroundBackfill(
    label: string,
    store: StoreConfig,
    sources: SourceDefinition[],
    missingBySource: Map<string, string[]>,
    totalDays: number,
  ): SyncJob {
    const job = this.syncJobsRepository.create(label, totalDays);
    this.logger.log(`[${store.id}] Iniciando backfill en segundo plano (job ${job.id}): ${totalDays} días pendientes.`);

    // Fire-and-forget: se ejecuta en el mismo proceso Node (una sola
    // instancia, según la arquitectura acordada), sin bloquear la
    // respuesta HTTP actual.
    void this.runBackgroundBackfill(job.id, store, sources, missingBySource);

    return job;
  }

  private async runBackgroundBackfill(
    jobId: string,
    store: StoreConfig,
    sources: SourceDefinition[],
    missingBySource: Map<string, string[]>,
  ): Promise<void> {
    this.syncJobsRepository.update(jobId, { status: 'running' });
    let completed = 0;

    try {
      for (const source of sources) {
        const missing = missingBySource.get(sourceLabel(source.ref)) ?? [];
        await this.syncDays(store, source, missing, () => {
          completed += 1;
          this.syncJobsRepository.update(jobId, { completedDays: completed });
        });
      }
      this.syncJobsRepository.update(jobId, { status: 'completed' });
      this.logger.log(`[${store.id}] Backfill en segundo plano completado (job ${jobId}).`);
    } catch (error) {
      this.syncJobsRepository.update(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'error desconocido',
      });
      this.logger.error(`[${store.id}] Backfill en segundo plano falló (job ${jobId}).`);
    }
  }
}
