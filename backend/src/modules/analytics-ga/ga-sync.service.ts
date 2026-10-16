import { Injectable, Logger } from '@nestjs/common';

import { enumerateDayBuckets } from '../../common/utils/date-range.util';
import { StoreConfig, getStoresConfig } from '../../config/stores.config';
import { GaAggregatesRepository, GaDailyByProductRow } from '../database/repositories/ga-aggregates.repository';
import { GaProductLink, GaProductLinksRepository } from '../database/repositories/ga-product-links.repository';
import { SyncLogsRepository } from '../database/repositories/sync-logs.repository';
import { GaClientService } from './ga-client.service';
import {
  fillMissingDays,
  rowsToByCampaign,
  rowsToByChannel,
  rowsToByCity,
  rowsToByDevice,
  rowsToByLandingPage,
  rowsToByProduct,
  rowsToByUserType,
  rowsToGaDaily,
} from './ga-report.util';
import { VtexCatalogLinkService } from './vtex-catalog-link.service';

/** Orden EXACTO en que se piden las métricas del reporte A — debe coincidir con `rowsToGaDaily`. */
const DAILY_METRICS = ['sessions', 'totalUsers', 'newUsers', 'engagedSessions', 'itemViewEvents', 'addToCarts', 'checkouts', 'ecommercePurchases', 'purchaseRevenue'];
/** Reporte B — debe coincidir con `rowsToByChannel`. */
const CHANNEL_DIMENSIONS = ['date', 'sessionDefaultChannelGroup'];
const CHANNEL_METRICS = ['sessions', 'totalUsers', 'ecommercePurchases', 'purchaseRevenue'];
/** Reporte C — debe coincidir con `rowsToByDevice`. */
const DEVICE_DIMENSIONS = ['date', 'deviceCategory'];
const DEVICE_METRICS = ['sessions', 'totalUsers', 'ecommercePurchases', 'purchaseRevenue'];
/** Reporte D — debe coincidir con `rowsToByLandingPage`. */
const LANDING_PAGE_DIMENSIONS = ['date', 'landingPage'];
const LANDING_PAGE_METRICS = ['sessions', 'totalUsers', 'engagedSessions', 'ecommercePurchases', 'purchaseRevenue'];
/** Reporte E — debe coincidir con `rowsToByUserType`. */
const USER_TYPE_DIMENSIONS = ['date', 'newVsReturning'];
const USER_TYPE_METRICS = ['sessions', 'totalUsers', 'ecommercePurchases', 'purchaseRevenue'];
/** Reporte F — debe coincidir con `rowsToByCity`. */
const CITY_DIMENSIONS = ['date', 'city'];
const CITY_METRICS = ['sessions', 'totalUsers', 'ecommercePurchases', 'purchaseRevenue'];
/** Reporte G — debe coincidir con `rowsToByProduct`. Métricas de ÍTEM, no de sesión. */
const PRODUCT_DIMENSIONS = ['date', 'itemId', 'itemName', 'itemCategory'];
const PRODUCT_METRICS = ['itemsViewed', 'itemsAddedToCart', 'itemsPurchased', 'itemRevenue'];
/** Reporte H — debe coincidir con `rowsToByCampaign`. Métricas de EMBUDO (no solo sessions/totalUsers/purchases), sin tope Top 20. */
const CAMPAIGN_DIMENSIONS = ['date', 'sessionCampaignName', 'sessionSourceMedium'];
const CAMPAIGN_METRICS = ['sessions', 'addToCarts', 'checkouts', 'ecommercePurchases', 'purchaseRevenue'];
/** Etiquetas que no son un producto real — nunca se les intenta resolver un link (ver `GaReportUtil.rowsToByProduct`). */
const NON_PRODUCT_ITEM_IDS = new Set(['(otros)', '(not set)']);
/** Tope de SKUs nuevos a resolver POR LLAMADA a `syncStore` — un backfill largo puede traer cientos de SKUs distintos en el Top 20 de días distintos; se resuelven de a poco, nunca todos de una vez. */
const MAX_NEW_PRODUCT_LINKS_PER_SYNC = 50;

/** Resultado de sincronizar una tienda — usado por `cli/ga-backfill.ts` para reportar cuánto histórico entrega realmente la propiedad (sin asumir un límite de antemano). */
export interface GaSyncResult {
  totalDays: number;
  /** Días dentro del rango con `sessions > 0` reportado por GA4 — un día en 0 puede ser tráfico real cero O que la propiedad no tenga historial tan atrás; no se puede distinguir desde acá, solo contar. */
  daysWithData: number;
}

/**
 * Sincroniza GA4 → Supabase para una o todas las tiendas, tienda por
 * tienda SIEMPRE EN SECUENCIA (nunca `Promise.all`/`pLimit`, a diferencia
 * del cron de VTEX) — restricción explícita de memoria del encargo: un
 * dyno de Render gratuito (~256MB) ya tuvo un `heap out of memory` real
 * este año, y los reportes de GA, aunque chicos, no vale la pena
 * arriesgar acumulándolos en paralelo.
 */
@Injectable()
export class GaSyncService {
  private readonly logger = new Logger(GaSyncService.name);

  constructor(
    private readonly gaClient: GaClientService,
    private readonly gaAggregatesRepository: GaAggregatesRepository,
    private readonly gaProductLinksRepository: GaProductLinksRepository,
    private readonly vtexCatalogLinkService: VtexCatalogLinkService,
    private readonly syncLogsRepository: SyncLogsRepository,
  ) {}

  /** Tiendas con `gaPropertyId` configurado, EN SECUENCIA — una tienda que falla no detiene las demás (try/catch propio en `syncStore`). */
  async syncAllStores(startDay: string, endDay: string): Promise<void> {
    if (!this.gaClient.isConfigured()) {
      this.logger.warn('GA4 no está configurado (falta GA_SERVICE_ACCOUNT_JSON) — se omite la sincronización.');
      return;
    }

    const stores = getStoresConfig().filter((store) => store.gaPropertyId);
    if (stores.length === 0) {
      this.logger.warn('Ninguna tienda tiene GA_PROPERTY_ID_* configurado — se omite la sincronización de GA4.');
      return;
    }

    for (const store of stores) {
      await this.syncStore(store, startDay, endDay);
    }
  }

  /**
   * Sincroniza UNA tienda — atrapa sus propios errores (los deja en
   * `sync_logs` como `'error'`, nunca relanza) para no tumbar
   * `syncAllStores`. Devuelve `{ totalDays, daysWithData }` — usado por
   * `cli/ga-backfill.ts` para reportar cuánto histórico entrega
   * realmente la propiedad; `null` si la tienda no tiene `gaPropertyId`
   * o la sincronización falló.
   */
  async syncStore(store: StoreConfig, startDay: string, endDay: string): Promise<GaSyncResult | null> {
    if (!store.gaPropertyId) {
      this.logger.warn(`[${store.id}] Sin GA_PROPERTY_ID configurado — se omite.`);
      return null;
    }

    const syncLogId = await this.syncLogsRepository.start(store.id, 'ga4_api');
    try {
      await this.assertCompatibility(store.gaPropertyId, ['date'], DAILY_METRICS);
      await this.assertCompatibility(store.gaPropertyId, CHANNEL_DIMENSIONS, CHANNEL_METRICS);
      await this.assertCompatibility(store.gaPropertyId, DEVICE_DIMENSIONS, DEVICE_METRICS);
      await this.assertCompatibility(store.gaPropertyId, LANDING_PAGE_DIMENSIONS, LANDING_PAGE_METRICS);
      await this.assertCompatibility(store.gaPropertyId, USER_TYPE_DIMENSIONS, USER_TYPE_METRICS);
      await this.assertCompatibility(store.gaPropertyId, CITY_DIMENSIONS, CITY_METRICS);
      await this.assertCompatibility(store.gaPropertyId, PRODUCT_DIMENSIONS, PRODUCT_METRICS);
      await this.assertCompatibility(store.gaPropertyId, CAMPAIGN_DIMENSIONS, CAMPAIGN_METRICS);

      const dateRanges = [{ startDate: startDay, endDate: endDay }];
      const property = `properties/${store.gaPropertyId}`;

      const [dailyRows, channelRows, deviceRows, landingPageRows, userTypeRows, cityRows, productRows, campaignRows] = await Promise.all([
        this.gaClient.runReportAllRows({ property, dateRanges, dimensions: [{ name: 'date' }], metrics: DAILY_METRICS.map((name) => ({ name })) }),
        this.gaClient.runReportAllRows({
          property,
          dateRanges,
          dimensions: CHANNEL_DIMENSIONS.map((name) => ({ name })),
          metrics: CHANNEL_METRICS.map((name) => ({ name })),
        }),
        this.gaClient.runReportAllRows({
          property,
          dateRanges,
          dimensions: DEVICE_DIMENSIONS.map((name) => ({ name })),
          metrics: DEVICE_METRICS.map((name) => ({ name })),
        }),
        this.gaClient.runReportAllRows({
          property,
          dateRanges,
          dimensions: LANDING_PAGE_DIMENSIONS.map((name) => ({ name })),
          metrics: LANDING_PAGE_METRICS.map((name) => ({ name })),
        }),
        this.gaClient.runReportAllRows({
          property,
          dateRanges,
          dimensions: USER_TYPE_DIMENSIONS.map((name) => ({ name })),
          metrics: USER_TYPE_METRICS.map((name) => ({ name })),
        }),
        this.gaClient.runReportAllRows({
          property,
          dateRanges,
          dimensions: CITY_DIMENSIONS.map((name) => ({ name })),
          metrics: CITY_METRICS.map((name) => ({ name })),
        }),
        this.gaClient.runReportAllRows({
          property,
          dateRanges,
          dimensions: PRODUCT_DIMENSIONS.map((name) => ({ name })),
          metrics: PRODUCT_METRICS.map((name) => ({ name })),
        }),
        this.gaClient.runReportAllRows({
          property,
          dateRanges,
          dimensions: CAMPAIGN_DIMENSIONS.map((name) => ({ name })),
          metrics: CAMPAIGN_METRICS.map((name) => ({ name })),
        }),
      ]);

      const gaDailyRaw = rowsToGaDaily(dailyRows ?? [], store.id);
      const gaDaily = fillMissingDays(startDay, endDay, store.id, gaDailyRaw);
      const byChannel = rowsToByChannel(channelRows ?? [], store.id);
      const byDevice = rowsToByDevice(deviceRows ?? [], store.id);
      const byLandingPage = rowsToByLandingPage(landingPageRows ?? [], store.id);
      const byUserType = rowsToByUserType(userTypeRows ?? [], store.id);
      const byCity = rowsToByCity(cityRows ?? [], store.id);
      const byProduct = rowsToByProduct(productRows ?? [], store.id);
      const byCampaign = rowsToByCampaign(campaignRows ?? [], store.id);

      const allDays = enumerateDayBuckets(`${startDay}T00:00:00-05:00`, `${endDay}T23:59:59-05:00`);
      await this.gaAggregatesRepository.replaceStoreRange(
        store.id,
        allDays,
        gaDaily,
        byChannel,
        byDevice,
        byLandingPage,
        byUserType,
        byCity,
        byProduct,
        byCampaign,
      );

      await this.syncLogsRepository.finish(syncLogId, 'success', {
        recordsRead: gaDaily.length,
        recordsInserted:
          gaDaily.length +
          byChannel.length +
          byDevice.length +
          byLandingPage.length +
          byUserType.length +
          byCity.length +
          byProduct.length +
          byCampaign.length,
        recordsUpdated: 0,
        recordsFailed: 0,
      });
      this.logger.log(`[${store.id}] Sincronización GA4 completa: ${allDays.length} día(s), ${gaDaily.reduce((a, r) => a + r.sessions, 0)} sesiones.`);

      // Mejor esfuerzo, fuera del resultado del sync: un fallo acá NUNCA debe
      // marcar la sincronización de GA4 como error (ya se guardó todo lo
      // importante arriba) — ver `resolveMissingProductLinks`.
      try {
        await this.resolveMissingProductLinks(store, byProduct);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'error desconocido';
        this.logger.warn(`[${store.id}] No se pudieron resolver links de producto: ${message}`);
      }

      return { totalDays: allDays.length, daysWithData: gaDaily.filter((r) => r.sessions > 0).length };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';
      await this.syncLogsRepository.finish(syncLogId, 'error', { recordsRead: 0, recordsInserted: 0, recordsUpdated: 0, recordsFailed: 0 }, message);
      this.logger.error(`[${store.id}] Falló la sincronización de GA4: ${message}`);
      return null;
    }
  }

  /**
   * Resuelve contra la API PÚBLICA de catálogo de VTEX el link real de cada
   * producto del Top 20 que TODAVÍA no esté en la caché `ga_product_links`
   * — nunca re-resuelve uno ya cacheado, y nunca más de
   * `MAX_NEW_PRODUCT_LINKS_PER_SYNC` por llamada (un backfill largo puede
   * traer cientos de SKUs distintos entre el Top 20 de días distintos; se
   * van resolviendo de a poco, sync tras sync, en vez de todos de una vez).
   * Secuencial (no `Promise.all`), mismo criterio de memoria que el resto
   * del sync. Omite la tienda si no tiene `storefrontDomain` configurado.
   */
  private async resolveMissingProductLinks(store: StoreConfig, byProduct: GaDailyByProductRow[]): Promise<void> {
    if (!store.storefrontDomain) return;

    const uniqueItemIds = Array.from(new Set(byProduct.map((r) => r.itemId).filter((id) => !NON_PRODUCT_ITEM_IDS.has(id))));
    if (uniqueItemIds.length === 0) return;

    const existing = await this.gaProductLinksRepository.getExistingItemIds(store.id, uniqueItemIds);
    const missing = uniqueItemIds.filter((id) => !existing.has(id)).slice(0, MAX_NEW_PRODUCT_LINKS_PER_SYNC);
    if (missing.length === 0) return;

    const resolved: GaProductLink[] = [];
    for (const itemId of missing) {
      const link = await this.vtexCatalogLinkService.resolveLink(store.storefrontDomain, itemId);
      if (link) resolved.push({ itemId, productUrl: link.productUrl, productReference: link.productReference });
    }

    if (resolved.length > 0) {
      await this.gaProductLinksRepository.upsertMany(store.id, resolved);
      this.logger.log(`[${store.id}] Resueltos ${resolved.length}/${missing.length} links de producto nuevos.`);
    }
  }

  /**
   * Verifica compatibilidad ANTES de construir el reporte real (Parte 1
   * del encargo). Si algo resulta incompatible, NO se intenta dividir el
   * reporte automáticamente (requeriría saber de antemano cuál dimensión
   * "rompe" la combinación) — se detiene con un mensaje claro para que
   * se ajuste manualmente el reporte (ver nota en README). Confirmado
   * esta sesión: el fallback automático queda fuera de alcance de la
   * fase 1 hasta tener un caso real con el que validarlo.
   */
  private async assertCompatibility(propertyId: string, dimensions: string[], metrics: string[]): Promise<void> {
    const incompatible = await this.gaClient.checkCompatibility(propertyId, dimensions, metrics);
    if (incompatible.length > 0) {
      throw new Error(
        `Combinación incompatible en la propiedad GA4 ${propertyId}: ${incompatible.join(', ')}. Revisa el reporte manualmente (ver README).`,
      );
    }
  }
}
