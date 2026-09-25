import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import pLimit from 'p-limit';

import { aggregateDailyRows } from '../../../common/aggregation/daily-aggregator';
import { DailyAggregationResult, EnrichedOrder, EnrichedOrderItem } from '../../../common/aggregation/types';
import { enumerateDayBuckets, subtractDaysUtc, todayColombia, toDayBucketColombia } from '../../../common/utils/date-range.util';
import { extractOrderDetail } from '../../../common/utils/order-item-extract.util';
import { getStoresConfig, StoreConfig } from '../../../config/stores.config';
import { ReferenceRepository } from '../../database/repositories/reference.repository';
import { SalesAggregatesRepository, TouchedDay } from '../../database/repositories/sales-aggregates.repository';
import { StoresRepository } from '../../database/repositories/stores.repository';
import { SyncLogsRepository } from '../../database/repositories/sync-logs.repository';
import { VtexOrder } from '../../orders/interfaces/vtex-order.interface';
import { VtexOrdersService } from '../../orders/services/vtex-orders.service';
import { buildSourceDefinitions } from '../utils/source-definitions.util';

const UNKNOWN_COLLECTION = 'Sin colección';

/** Rango explícito de fechas (ISO) a sincronizar — usado por el backfill manual (ver `runBackfillForRange`). */
export interface SyncRange {
  startIso: string;
  endIso: string;
}

/**
 * Única pieza del sistema que le habla a VTEX en vivo. Corre cada
 * `SYNC_CRON_INTERVAL_HOURS` (+ una corrida al boot) y, para cada tienda,
 * recalcula por completo los agregados diarios de los últimos
 * `SYNC_RECALC_WINDOW_DAYS` — nunca toca días fuera de esa ventana en su
 * modo normal (ver `common/aggregation/daily-aggregator.ts` para las
 * reglas de negocio y `sales-aggregates.repository.ts` para el
 * borrado+reinserción por día).
 *
 * `runBackfillForRange` reutiliza EXACTAMENTE la misma lógica para un
 * rango de fechas explícito (no la ventana rodante) — es el mecanismo
 * correcto para cerrar un hueco entre el histórico importado de Excel y
 * la ventana del cron (ej. si el cron empezó a correr semanas después de
 * que terminaba el Excel), sin que el DASHBOARD tenga que hablarle a
 * VTEX en ningún momento — eso sigue estando prohibido; el backfill es
 * una corrida MANUAL de esta misma pieza, no una excepción a la regla.
 */
@Injectable()
export class VtexSyncCronService implements OnModuleInit {
  private readonly logger = new Logger(VtexSyncCronService.name);
  private readonly storeConcurrency: number;
  private readonly recalcWindowDays: number;
  private readonly orderEnrichConcurrency: number;

  constructor(
    private readonly vtexOrdersService: VtexOrdersService,
    private readonly referenceRepository: ReferenceRepository,
    private readonly salesAggregatesRepository: SalesAggregatesRepository,
    private readonly storesRepository: StoresRepository,
    private readonly syncLogsRepository: SyncLogsRepository,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
  ) {
    this.storeConcurrency = this.configService.get<number>('app.vtex.storeConcurrency', 3);
    this.recalcWindowDays = this.configService.get<number>('app.sync.recalcWindowDays', 3);
    this.orderEnrichConcurrency = this.configService.get<number>('app.vtex.orderEnrichConcurrency', 20);
  }

  async onModuleInit(): Promise<void> {
    await this.storesRepository.upsertAll(getStoresConfig());

    // `cli/backfill-range.ts` bootstrapea este mismo módulo para correr un
    // backfill manual de un rango explícito — sin este flag, la corrida
    // automática de la ventana reciente (todas las tiendas) competiría por
    // las mismas conexiones globales con el backfill que se pidió,
    // haciéndolo más lento sin ninguna necesidad real.
    if (process.env.SKIP_AUTO_SYNC === 'true') {
      this.logger.log('SKIP_AUTO_SYNC activo — no se dispara la corrida automática ni el intervalo (modo backfill manual).');
      return;
    }

    const hours = this.configService.get<number>('app.sync.cronIntervalHours', 4);
    const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;

    // `.catch()` explícito acá: esto se dispara "fire-and-forget" (al boot
    // y en cada tick del interval) sin que nadie más esté esperando esta
    // promesa — sin este catch, un error de red o de conexión a Supabase
    // (ej. el pool descartando un cliente inactivo) sería una rejection
    // no manejada que tumba TODO el proceso, no solo esta corrida.
    const runAndLogErrors = (): void => {
      this.runSyncAllStores().catch((error) => {
        const message = error instanceof Error ? error.message : 'error desconocido';
        this.logger.error(`Falló la corrida del cron: ${message}`);
      });
    };

    runAndLogErrors();
    const interval = setInterval(runAndLogErrors, intervalMs);
    this.schedulerRegistry.addInterval('vtex-sync-cron', interval);
    this.logger.log(`Cron de sincronización VTEX programado cada ${hours}h (+ corrida inicial al boot).`);
  }

  /** Cada cuántas horas corre el cron — expuesto para que el dashboard pueda mostrar una estimación de la próxima sincronización junto a `lastSyncedAt`. */
  getCronIntervalHours(): number {
    return this.configService.get<number>('app.sync.cronIntervalHours', 4);
  }

  async runSyncAllStores(): Promise<void> {
    const todayDay = todayColombia();
    const startDay = subtractDaysUtc(todayDay, this.recalcWindowDays);
    const range: SyncRange = {
      startIso: new Date(`${startDay}T00:00:00.000-05:00`).toISOString(),
      endIso: new Date().toISOString(),
    };
    await this.runForAllStores(range);
  }

  /**
   * Backfill manual para un rango de fechas explícito (ej. cerrar el
   * hueco entre el histórico de Excel y el arranque del cron). Recalcula
   * por completo esos días para las tiendas indicadas (o todas, si se
   * omite `storeIds`) — mismo comportamiento de "sobrescribe, no
   * incrementa" que la corrida normal del cron.
   */
  async runBackfillForRange(startDay: string, endDay: string, storeIds?: string[]): Promise<void> {
    const range: SyncRange = {
      startIso: new Date(`${startDay}T00:00:00.000-05:00`).toISOString(),
      endIso: new Date(`${endDay}T23:59:59.999-05:00`).toISOString(),
    };
    await this.runForAllStores(range, storeIds);
  }

  private async runForAllStores(range: SyncRange, storeIds?: string[]): Promise<void> {
    const stores = getStoresConfig().filter(
      (store) => store.appKey && store.appToken && (!storeIds || storeIds.includes(store.id)),
    );

    // `collection_reference` se precarga UNA sola vez para toda la
    // corrida (todas las tiendas) — sin esto, resolver la colección de
    // cada ítem sería una consulta de red por ítem, impracticable para
    // un backfill de varios meses (ver la misma lección aprendida en
    // `cli/import-historical-orders.ts`).
    const collectionsBySkuAndStore = await this.referenceRepository.getAllCollections();

    const limit = pLimit(this.storeConcurrency);
    await Promise.all(
      stores.map((store) => limit(() => this.runSyncForStore(store, range, collectionsBySkuAndStore))),
    );
  }

  private async runSyncForStore(
    store: StoreConfig,
    range: SyncRange,
    collectionsBySkuAndStore: Map<string, string>,
  ): Promise<void> {
    const syncLogId = await this.syncLogsRepository.start(store.id, 'vtex_api');
    let recordsRead = 0;

    try {
      const { aggregation, recordsRead: read, isComplete, missingOrders } = await this.fetchAndAggregate(
        store,
        range,
        collectionsBySkuAndStore,
      );
      recordsRead = read;

      const touchedDays: TouchedDay[] = enumerateDayBuckets(range.startIso, range.endIso).map((date) => ({
        date,
        storeId: store.id,
      }));

      await this.salesAggregatesRepository.replaceAggregates(aggregation, touchedDays, isComplete);

      await this.syncLogsRepository.finish(syncLogId, isComplete ? 'success' : 'partial', {
        recordsRead,
        recordsInserted: aggregation.salesDaily.length,
        recordsUpdated: 0,
        recordsFailed: missingOrders,
      });
      if (isComplete) {
        this.logger.log(`[${store.id}] Sincronización completa: ${recordsRead} órdenes, ${touchedDays.length} día(s) recalculado(s).`);
      } else {
        // VTEX reportó más órdenes de las que efectivamente se lograron traer
        // (ver `FetchStoreOrdersResult.isComplete` — típicamente inestabilidad
        // de paginación en el offset de un límite entre páginas, no un error
        // de red) — se guarda igual (es mejor dato parcial que ninguno), pero
        // marcado como 'partial' para que quede visible en vez de asumirse
        // silenciosamente completo.
        this.logger.warn(
          `[${store.id}] Sincronización PARCIAL: ${recordsRead} órdenes obtenidas, ~${missingOrders} posiblemente faltantes (${touchedDays.length} día(s) recalculado(s)).`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';
      await this.syncLogsRepository.finish(
        syncLogId,
        'error',
        { recordsRead, recordsInserted: 0, recordsUpdated: 0, recordsFailed: recordsRead },
        message,
      );
      this.logger.error(`[${store.id}] Falló la sincronización: ${message}`);
    }
  }

  /**
   * Consulta EN VIVO (fuera del ciclo normal del cron) un rango de días
   * puntual para UNA tienda — usado por `OrdersService` cuando el
   * dashboard pide un rango que todavía no existe en Supabase (ver
   * `DashboardQueryRepository.findMissingDays`). Devuelve el agregado
   * calculado de inmediato (para que la respuesta HTTP lo use sin
   * demora) y dispara el guardado en Supabase EN SEGUNDO PLANO (sin
   * esperarlo) — la próxima consulta del mismo rango ya lo encuentra
   * cacheado. `null` si la tienda no tiene credenciales configuradas.
   */
  async fetchOnDemand(storeId: string, startDay: string, endDay: string): Promise<DailyAggregationResult | null> {
    const store = getStoresConfig().find((s) => s.id === storeId);
    if (!store || !store.appKey || !store.appToken) return null;

    const range: SyncRange = {
      startIso: new Date(`${startDay}T00:00:00.000-05:00`).toISOString(),
      endIso: new Date(`${endDay}T23:59:59.999-05:00`).toISOString(),
    };

    const collectionsBySkuAndStore = await this.referenceRepository.getAllCollections();
    const { aggregation, recordsRead, isComplete, missingOrders } = await this.fetchAndAggregate(
      store,
      range,
      collectionsBySkuAndStore,
    );

    // Fire-and-forget: la respuesta al dashboard no espera a que esto
    // termine de guardarse en Supabase — solo a que VTEX responda.
    void this.persistOnDemandResult(store.id, range, aggregation, recordsRead, isComplete, missingOrders);

    return aggregation;
  }

  private async persistOnDemandResult(
    storeId: string,
    range: SyncRange,
    aggregation: DailyAggregationResult,
    recordsRead: number,
    isComplete: boolean,
    missingOrders: number,
  ): Promise<void> {
    const syncLogId = await this.syncLogsRepository.start(storeId, 'vtex_api');
    try {
      const touchedDays: TouchedDay[] = enumerateDayBuckets(range.startIso, range.endIso).map((date) => ({
        date,
        storeId,
      }));
      await this.salesAggregatesRepository.replaceAggregates(aggregation, touchedDays, isComplete);
      await this.syncLogsRepository.finish(syncLogId, isComplete ? 'success' : 'partial', {
        recordsRead,
        recordsInserted: aggregation.salesDaily.length,
        recordsUpdated: 0,
        recordsFailed: missingOrders,
      });
      if (isComplete) {
        this.logger.log(`[${storeId}] Guardado en segundo plano completo (consulta on-demand): ${recordsRead} órdenes.`);
      } else {
        this.logger.warn(
          `[${storeId}] Guardado en segundo plano PARCIAL (consulta on-demand): ${recordsRead} órdenes, ~${missingOrders} posiblemente faltantes.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';
      await this.syncLogsRepository.finish(
        syncLogId,
        'error',
        { recordsRead, recordsInserted: 0, recordsUpdated: 0, recordsFailed: recordsRead },
        message,
      );
      this.logger.error(`[${storeId}] Falló el guardado en segundo plano (consulta on-demand): ${message}`);
    }
  }

  /**
   * Fetch + enriquecimiento + agregación para UNA tienda y un rango —
   * SIN persistir nada. Compartido por la corrida normal del cron
   * (`runSyncForStore`, que sí persiste de inmediato) y por
   * `fetchOnDemand` (que persiste en segundo plano).
   */
  private async fetchAndAggregate(
    store: StoreConfig,
    range: SyncRange,
    collectionsBySkuAndStore: Map<string, string>,
  ): Promise<{ aggregation: DailyAggregationResult; recordsRead: number; isComplete: boolean; missingOrders: number }> {
    const { startIso, endIso } = range;

    // Cada fuente es una consulta de listado independiente: 'main' (sin
    // filtro), una por cada seller (`f_sellerNames`) y una por cada
    // marketplace (`salesChannelId`) — ver `buildSourceDefinitions`. La
    // clasificación de una orden en un segmento es simplemente "de qué
    // fuente(s) filtrada(s) vino", sin inspeccionar el detalle.
    const sources = buildSourceDefinitions(store);
    const sourceResults = await Promise.all(
      sources.map((source) => this.vtexOrdersService.fetchAllOrders(store, startIso, endIso, source.extraParams)),
    );

    // VTEX (backend basado en Elasticsearch) puede ser inestable justo en
    // el límite entre dos páginas cuando varias órdenes comparten un
    // `creationDate` muy cercano — se confirmó en producción un caso real
    // donde el total reportado por VTEX (`paging.total`) no coincidía con
    // la cantidad de órdenes únicas efectivamente recibidas, incluso para
    // una ventana de fechas ya cerrada (no explicable por "llegaron
    // órdenes nuevas mientras paginábamos"). Si CUALQUIER fuente quedó
    // incompleta, toda la corrida se marca como tal (`isComplete: false`)
    // en vez de asumir éxito silenciosamente — ver `runSyncForStore`/
    // `persistOnDemandResult`, que la reflejan como `sync_logs.status =
    // 'partial'`.
    const isComplete = sourceResults.every((r) => r.isComplete);
    const missingOrders = sourceResults.reduce((sum, r) => sum + r.missingOrders, 0);

    const combinedOrdersById = new Map<string, VtexOrder>();
    const sellerLabelByOrderId = new Map<string, string>();
    const marketplaceLabelByOrderId = new Map<string, string>();

    for (const order of sourceResults[0].orders) combinedOrdersById.set(order.orderId, order);

    for (let i = 1; i < sources.length; i += 1) {
      const source = sources[i];
      const result = sourceResults[i];
      if (!result) continue;
      for (const order of result.orders) {
        combinedOrdersById.set(order.orderId, order);
        if (source.ref.sourceType === 'seller') {
          const seller = store.extraSegments?.sellers?.find((s) => s.sellerName === source.ref.sourceKey);
          if (seller) sellerLabelByOrderId.set(order.orderId, seller.label);
        } else if (source.ref.sourceType === 'marketplace') {
          const marketplace = store.extraSegments?.marketplaces?.find((m) => m.salesChannelId === source.ref.sourceKey);
          if (marketplace) marketplaceLabelByOrderId.set(order.orderId, marketplace.label);
        }
      }
    }

    const combinedOrders = Array.from(combinedOrdersById.values());
    const recordsRead = combinedOrders.length;
    this.logger.log(`[${store.id}] ${recordsRead} orden(es) a enriquecer (detalle por orden)...`);

    const newBrandsBySkuId = new Map<string, string>();
    let detailsCompleted = 0;
    const logEvery = Math.max(50, Math.floor(combinedOrders.length / 10));
    // `pLimit` acá (no solo el `globalLimit` de `VtexOrdersService`) evita
    // que un día pesado (Pilatos ha llegado a 900+ órdenes en una sola
    // ventana) dispare TODAS sus promesas de enriquecimiento de una vez —
    // `globalLimit` acota cuántas peticiones HTTP van en vuelo, pero no
    // cuántos resultados YA completos (orden + items + descuentos) quedan
    // acumulados en memoria mientras las demás siguen esperando turno.
    // Confirmado como uno de los dos factores detrás de un
    // `heap out of memory` en producción (ver `orderEnrichConcurrency`).
    const enrichLimit = pLimit(this.orderEnrichConcurrency);
    const enrichedOrders = await Promise.all(
      combinedOrders.map((order) =>
        enrichLimit(() =>
          this.enrichOrder(
            store,
            order,
            sellerLabelByOrderId.get(order.orderId) ?? null,
            marketplaceLabelByOrderId.get(order.orderId) ?? null,
            collectionsBySkuAndStore,
            newBrandsBySkuId,
          ).then((result) => {
            detailsCompleted += 1;
            if (detailsCompleted % logEvery === 0 || detailsCompleted === combinedOrders.length) {
              this.logger.log(`[${store.id}] ${detailsCompleted}/${combinedOrders.length} detalles procesados.`);
            }
            return result;
          }),
        ),
      ),
    );

    // Un solo INSERT por lotes para todas las marcas nuevas descubiertas
    // en esta corrida, en vez de una consulta por ítem.
    await this.referenceRepository.upsertBrands(
      Array.from(newBrandsBySkuId.entries()).map(([skuId, brandName]) => ({ skuId, brandName })),
    );

    const aggregation = aggregateDailyRows(enrichedOrders, Boolean(store.isMultiBrand));
    return { aggregation, recordsRead, isComplete, missingOrders };
  }

  /**
   * Consulta el detalle de UNA orden y arma el `EnrichedOrder` completo
   * para el agregador: normaliza precios, resuelve colección por SKU
   * (en memoria, `collectionsBySkuAndStore`) y acumula las marcas nuevas
   * descubiertas en `newBrandsBySkuId` (se escriben todas juntas al final
   * de `runSyncForStore`, no una por una aquí).
   */
  private async enrichOrder(
    store: StoreConfig,
    order: VtexOrder,
    sellerLabel: string | null,
    marketplaceLabel: string | null,
    collectionsBySkuAndStore: Map<string, string>,
    newBrandsBySkuId: Map<string, string>,
  ): Promise<EnrichedOrder> {
    const detail = await this.vtexOrdersService.fetchOrderDetail(store, order.orderId);
    const extracted = extractOrderDetail(detail);

    const items: EnrichedOrderItem[] = extracted.items.map((item) => {
      const listPrice = this.vtexOrdersService.normalizeMoney(item.listPrice);
      const sellingPrice = this.vtexOrdersService.normalizeMoney(item.sellingPrice);

      if (item.skuId && item.brand !== 'Sin marca') {
        newBrandsBySkuId.set(item.skuId, item.brand);
      }
      const collectionName = item.skuId
        ? collectionsBySkuAndStore.get(`${item.skuId}::${store.id}`) ?? UNKNOWN_COLLECTION
        : UNKNOWN_COLLECTION;

      return {
        skuId: item.skuId,
        ean: item.ean,
        category: item.category,
        brand: item.brand,
        collectionName,
        quantity: item.quantity,
        listPrice,
        sellingPrice,
        discountPercentage: item.discountPercentage,
      };
    });

    return {
      orderId: order.orderId,
      storeId: store.id,
      dayBucket: toDayBucketColombia(order.creationDate),
      status: order.status,
      statusDescription: order.statusDescription,
      totalValue: order.totalValue,
      paymentNames: order.paymentNames,
      city: extracted.city,
      items,
      discountCampaignNames: extracted.discountCampaignNames,
      sellerLabel,
      marketplaceLabel,
      utmiCampaign: extracted.utmiCampaign,
    };
  }
}
