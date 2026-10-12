import { Injectable } from '@nestjs/common';

import {
  enumerateDayBuckets,
  normalizeEndDate,
  normalizeStartDate,
  subtractDaysUtc,
  todayColombia,
  toDayBucketColombia,
} from '../../common/utils/date-range.util';
import { matchRevenueStatusDefinition } from '../../common/utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../config/revenue-status.config';
import { getStoresConfig } from '../../config/stores.config';
import { DashboardQueryRepository } from '../database/repositories/dashboard-query.repository';
import { GaProductLinksRepository } from '../database/repositories/ga-product-links.repository';
import { SyncLogsRepository } from '../database/repositories/sync-logs.repository';
import {
  GaChannelBreakdownRow,
  GaChannelsResponse,
  GaCitiesResponse,
  GaCityBreakdownRow,
  GaDailyPoint,
  GaDeviceBreakdownRow,
  GaDevicesResponse,
  GaFunnelRates,
  GaLandingPageBreakdownRow,
  GaLandingPagesResponse,
  GaOverviewResponse,
  GaProductBreakdownRow,
  GaProductsResponse,
  GaStoreOverview,
  GaStoreTotals,
  GaUserTypeBreakdownRow,
  GaUserTypesResponse,
} from './ga-analytics.interface';

const DAILY_COLUMNS = ['sessions', 'total_users', 'new_users', 'engaged_sessions', 'item_views', 'add_to_carts', 'checkouts', 'purchases', 'ga_revenue'];

/** Tope de filas de `getLandingPages` para el RANGO completo — ver nota en ese método (distinto del tope por día que ya aplica `GaReportUtil.rowsToByLandingPage`). */
const MAX_LANDING_PAGES_DISPLAY = 20;
const LANDING_PAGE_OTHER_LABEL = '(otros)';
/** Mismo tope/criterio que `MAX_LANDING_PAGES_DISPLAY`, aplicado a ciudades (ver `getCities`). */
const MAX_CITIES_DISPLAY = 20;
const CITY_OTHER_LABEL = '(otros)';
/** Mismo tope/criterio, aplicado a productos (ver `getProducts`). */
const MAX_PRODUCTS_DISPLAY = 20;
const PRODUCT_OTHER_ID = '(otros)';

/**
 * `pg` devuelve una columna `DATE` como objeto `Date` de JS (medianoche
 * UTC de ese día calendario) — `String(dateObject)` lo imprime como
 * "Fri Oct 09 2026 00:00:00 GMT-0500 (...)", NO como "2026-10-09", y
 * además hace que cualquier `.sort()`/comparación por string ordene por
 * nombre del día de la semana en vez de por fecha real. Confirmado en
 * producción: la serie diaria llegaba en el orden equivocado. `pg` no
 * devuelve un string aquí porque `queryGroupedMulti` no castea `date` a
 * texto en el SQL (los demás usos de esa función agrupan por `year`/`month`,
 * enteros, nunca por la columna `date` misma) — se normaliza acá en vez de
 * tocar el repositorio genérico.
 */
function toDateOnlyString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Lecturas SQL puras sobre `ga_daily*` — nunca habla con Google en vivo
 * (eso es exclusivo de `GaSyncService`). Mismo principio que
 * `DashboardQueryRepository`/`OrdersService` con VTEX: el dashboard SOLO
 * lee de Supabase.
 */
@Injectable()
export class GaQueryService {
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();

  constructor(
    private readonly dashboardQueryRepository: DashboardQueryRepository,
    private readonly gaProductLinksRepository: GaProductLinksRepository,
    private readonly syncLogsRepository: SyncLogsRepository,
  ) {}

  async getOverview(startDate: string, endDate: string, storeId?: string): Promise<GaOverviewResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(startDate));
    const endDay = toDayBucketColombia(normalizeEndDate(endDate));
    const totalDaysInRange = enumerateDayBuckets(`${startDay}T00:00:00-05:00`, `${endDay}T23:59:59-05:00`).length;

    const rows = await this.dashboardQueryRepository.queryGroupedMulti('ga_daily', ['date'], DAILY_COLUMNS, startDay, endDay, storeId);
    const lastStatusByStore = await this.syncLogsRepository.getLatestStatusByStore('ga4_api');
    const revenueOrdersByStore = await this.getRevenueOrdersByStore(startDay, endDay, storeId);

    // Últimos 2 días CALENDARIO reales (hoy y ayer) — no "los últimos 2 días del rango" sin más,
    // para no marcar como "provisional" un rango histórico viejo que nada tiene de reciente.
    const today = todayColombia();
    const provisionalCutoff = subtractDaysUtc(today, 1);

    const byStore = new Map<string, Record<string, string | number>[]>();
    for (const row of rows) {
      const list = byStore.get(String(row.store_id)) ?? [];
      list.push(row);
      byStore.set(String(row.store_id), list);
    }

    const storeIds = storeId ? [storeId] : getStoresConfig().map((s) => s.id);
    const stores: GaStoreOverview[] = storeIds.map((id) => {
      const storeRows = (byStore.get(id) ?? []).sort((a, b) => toDateOnlyString(a.date).localeCompare(toDateOnlyString(b.date)));

      const dailySeries: GaDailyPoint[] = storeRows.map((row) => ({
        date: toDateOnlyString(row.date),
        sessions: Number(row.sessions),
        totalUsers: Number(row.total_users),
        newUsers: Number(row.new_users),
        engagedSessions: Number(row.engaged_sessions),
        itemViews: Number(row.item_views),
        addToCarts: Number(row.add_to_carts),
        checkouts: Number(row.checkouts),
        purchases: Number(row.purchases),
        gaRevenue: Number(row.ga_revenue),
      }));

      const rawTotals = dailySeries.reduce(
        (acc, point) => ({
          sessions: acc.sessions + point.sessions,
          totalUsersSum: acc.totalUsersSum + point.totalUsers,
          newUsersSum: acc.newUsersSum + point.newUsers,
          engagedSessions: acc.engagedSessions + point.engagedSessions,
          itemViews: acc.itemViews + point.itemViews,
          addToCarts: acc.addToCarts + point.addToCarts,
          checkouts: acc.checkouts + point.checkouts,
          purchases: acc.purchases + point.purchases,
          gaRevenue: acc.gaRevenue + point.gaRevenue,
        }),
        { sessions: 0, totalUsersSum: 0, newUsersSum: 0, engagedSessions: 0, itemViews: 0, addToCarts: 0, checkouts: 0, purchases: 0, gaRevenue: 0 },
      );
      const totals: GaStoreTotals = {
        ...rawTotals,
        returningUsersSum: Math.max(0, rawTotals.totalUsersSum - rawTotals.newUsersSum),
      };

      const provisionalDays = dailySeries.map((p) => p.date).filter((date) => date >= provisionalCutoff);
      const revenueOrders = revenueOrdersByStore.get(id) ?? 0;

      return {
        storeId: id,
        totals,
        funnelRates: this.computeFunnelRates(totals),
        dailySeries,
        lastSyncedAt: lastStatusByStore[id]?.lastSyncedAt ?? null,
        lastSyncStatus: lastStatusByStore[id]?.lastSyncStatus ?? null,
        provisionalDays,
        coverage: totalDaysInRange > 0 ? dailySeries.length / totalDaysInRange : 0,
        revenueOrders,
        // Vista previa de la Fase B (cruce con ventas) — SOLO sesiones ÷ órdenes
        // contabilizadas de VTEX, sin las comparaciones de período ni el ajuste de
        // marketplaces de Pilatos (su conversión saldría baja de más una vez que
        // tenga GA_PROPERTY_ID configurado, hasta implementar esa exclusión).
        realConversionPercent: totals.sessions > 0 ? Number(((revenueOrders / totals.sessions) * 100).toFixed(2)) : null,
      };
    });

    return { filters: { startDate, endDate }, stores };
  }

  async getChannels(startDate: string, endDate: string, storeId?: string): Promise<GaChannelsResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(startDate));
    const endDay = toDayBucketColombia(normalizeEndDate(endDate));
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'ga_daily_by_channel',
      ['channel_group'],
      ['sessions', 'total_users', 'purchases', 'ga_revenue'],
      startDay,
      endDay,
      storeId,
    );
    const totalsByStore = await this.getAuthoritativeTotalsByStore(startDay, endDay, storeId);

    const byStore: Record<string, GaChannelBreakdownRow[]> = {};
    const totalSessionsByStore: Record<string, number> = {};
    const storeIds = Array.from(new Set(rows.map((r) => String(r.store_id))));
    for (const id of storeIds) {
      const storeRows = rows.filter((r) => String(r.store_id) === id);
      const storeTotals = totalsByStore[id] ?? { sessions: 0, totalUsers: 0, purchases: 0, gaRevenue: 0 };
      totalSessionsByStore[id] = storeTotals.sessions;
      byStore[id] = storeRows
        .map((r) => {
          const sessions = Number(r.sessions);
          const totalUsers = Number(r.total_users);
          const purchases = Number(r.purchases);
          const gaRevenue = Number(r.ga_revenue);
          return {
            channelGroup: String(r.channel_group),
            sessions,
            sessionsPercent: this.sharePercent(sessions, storeTotals.sessions),
            totalUsers,
            usersPercent: this.sharePercent(totalUsers, storeTotals.totalUsers),
            purchases,
            purchasesPercent: this.sharePercent(purchases, storeTotals.purchases),
            gaRevenue,
            revenuePercent: this.sharePercent(gaRevenue, storeTotals.gaRevenue),
            conversionPercent: sessions > 0 ? Number(((purchases / sessions) * 100).toFixed(2)) : 0,
          };
        })
        .sort((a, b) => b.sessions - a.sessions);
    }

    return { filters: { startDate, endDate }, byStore, totalSessionsByStore };
  }

  async getDevices(startDate: string, endDate: string, storeId?: string): Promise<GaDevicesResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(startDate));
    const endDay = toDayBucketColombia(normalizeEndDate(endDate));
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'ga_daily_by_device',
      ['device_category'],
      ['sessions', 'total_users', 'purchases', 'ga_revenue'],
      startDay,
      endDay,
      storeId,
    );
    const totalsByStore = await this.getAuthoritativeTotalsByStore(startDay, endDay, storeId);

    const byStore: Record<string, GaDeviceBreakdownRow[]> = {};
    const totalSessionsByStore: Record<string, number> = {};
    const storeIds = Array.from(new Set(rows.map((r) => String(r.store_id))));
    for (const id of storeIds) {
      const storeRows = rows.filter((r) => String(r.store_id) === id);
      const storeTotals = totalsByStore[id] ?? { sessions: 0, totalUsers: 0, purchases: 0, gaRevenue: 0 };
      totalSessionsByStore[id] = storeTotals.sessions;
      byStore[id] = storeRows
        .map((r) => {
          const sessions = Number(r.sessions);
          const totalUsers = Number(r.total_users);
          const purchases = Number(r.purchases);
          const gaRevenue = Number(r.ga_revenue);
          return {
            deviceCategory: String(r.device_category),
            sessions,
            sessionsPercent: this.sharePercent(sessions, storeTotals.sessions),
            totalUsers,
            usersPercent: this.sharePercent(totalUsers, storeTotals.totalUsers),
            purchases,
            purchasesPercent: this.sharePercent(purchases, storeTotals.purchases),
            gaRevenue,
            revenuePercent: this.sharePercent(gaRevenue, storeTotals.gaRevenue),
            conversionPercent: sessions > 0 ? Number(((purchases / sessions) * 100).toFixed(2)) : 0,
          };
        })
        .sort((a, b) => b.sessions - a.sessions);
    }

    return { filters: { startDate, endDate }, byStore, totalSessionsByStore };
  }

  /**
   * `ga_daily_by_landing_page` ya limita a 20 páginas POR DÍA (ver
   * `GaReportUtil.rowsToByLandingPage`), pero un rango de varios días
   * puede traer un Top 20 distinto cada día — sumados, el rango completo
   * fácilmente acumula 60-100+ páginas distintas. Se aplica el MISMO tope
   * acá, sobre el total YA SUMADO del rango, para que la tabla nunca
   * muestre más de `MAX_LANDING_PAGES_DISPLAY` filas sin importar cuántos
   * días abarque — el resto (incluyendo cualquier `(otros)` ya traído de
   * días individuales) se fusiona en un único `(otros)` del rango.
   */
  async getLandingPages(startDate: string, endDate: string, storeId?: string): Promise<GaLandingPagesResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(startDate));
    const endDay = toDayBucketColombia(normalizeEndDate(endDate));
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'ga_daily_by_landing_page',
      ['landing_page'],
      ['sessions', 'total_users', 'purchases', 'ga_revenue'],
      startDay,
      endDay,
      storeId,
    );
    const totalsByStore = await this.getAuthoritativeTotalsByStore(startDay, endDay, storeId);

    const byStore: Record<string, GaLandingPageBreakdownRow[]> = {};
    const totalSessionsByStore: Record<string, number> = {};
    const storeIds = Array.from(new Set(rows.map((r) => String(r.store_id))));
    for (const id of storeIds) {
      const storeTotals = totalsByStore[id] ?? { sessions: 0, totalUsers: 0, purchases: 0, gaRevenue: 0 };
      totalSessionsByStore[id] = storeTotals.sessions;

      const summed = rows
        .filter((r) => String(r.store_id) === id)
        .map((r) => ({
          landingPage: String(r.landing_page),
          sessions: Number(r.sessions),
          totalUsers: Number(r.total_users),
          purchases: Number(r.purchases),
          gaRevenue: Number(r.ga_revenue),
        }));

      const otherRow = summed.find((r) => r.landingPage === LANDING_PAGE_OTHER_LABEL);
      const realRows = summed.filter((r) => r.landingPage !== LANDING_PAGE_OTHER_LABEL).sort((a, b) => b.sessions - a.sessions);
      const top = realRows.slice(0, MAX_LANDING_PAGES_DISPLAY);
      const overflow = [...realRows.slice(MAX_LANDING_PAGES_DISPLAY), ...(otherRow ? [otherRow] : [])];

      const finalRows = [...top];
      if (overflow.length > 0) {
        finalRows.push({
          landingPage: LANDING_PAGE_OTHER_LABEL,
          sessions: overflow.reduce((sum, r) => sum + r.sessions, 0),
          totalUsers: overflow.reduce((sum, r) => sum + r.totalUsers, 0),
          purchases: overflow.reduce((sum, r) => sum + r.purchases, 0),
          gaRevenue: overflow.reduce((sum, r) => sum + r.gaRevenue, 0),
        });
      }

      byStore[id] = finalRows
        .map((r) => ({
          landingPage: r.landingPage,
          sessions: r.sessions,
          sessionsPercent: this.sharePercent(r.sessions, storeTotals.sessions),
          totalUsers: r.totalUsers,
          usersPercent: this.sharePercent(r.totalUsers, storeTotals.totalUsers),
          purchases: r.purchases,
          purchasesPercent: this.sharePercent(r.purchases, storeTotals.purchases),
          gaRevenue: r.gaRevenue,
          revenuePercent: this.sharePercent(r.gaRevenue, storeTotals.gaRevenue),
          conversionPercent: r.sessions > 0 ? Number(((r.purchases / r.sessions) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions);
    }

    return { filters: { startDate, endDate }, byStore, totalSessionsByStore };
  }

  /**
   * Mismo problema y misma solución que `getLandingPages` (ver esa nota):
   * `ga_daily_by_city` ya limita a 20 ciudades POR DÍA, pero sumar varios
   * días puede acumular más de 20 ciudades distintas — se aplica el mismo
   * tope sobre el total YA SUMADO del rango, fusionando el resto en un
   * único `(otros)`.
   */
  async getCities(startDate: string, endDate: string, storeId?: string): Promise<GaCitiesResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(startDate));
    const endDay = toDayBucketColombia(normalizeEndDate(endDate));
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'ga_daily_by_city',
      ['city'],
      ['sessions', 'total_users', 'purchases', 'ga_revenue'],
      startDay,
      endDay,
      storeId,
    );
    const totalsByStore = await this.getAuthoritativeTotalsByStore(startDay, endDay, storeId);

    const byStore: Record<string, GaCityBreakdownRow[]> = {};
    const totalSessionsByStore: Record<string, number> = {};
    const storeIds = Array.from(new Set(rows.map((r) => String(r.store_id))));
    for (const id of storeIds) {
      const storeTotals = totalsByStore[id] ?? { sessions: 0, totalUsers: 0, purchases: 0, gaRevenue: 0 };
      totalSessionsByStore[id] = storeTotals.sessions;

      const summed = rows
        .filter((r) => String(r.store_id) === id)
        .map((r) => ({
          city: String(r.city),
          sessions: Number(r.sessions),
          totalUsers: Number(r.total_users),
          purchases: Number(r.purchases),
          gaRevenue: Number(r.ga_revenue),
        }));

      const otherRow = summed.find((r) => r.city === CITY_OTHER_LABEL);
      const realRows = summed.filter((r) => r.city !== CITY_OTHER_LABEL).sort((a, b) => b.sessions - a.sessions);
      const top = realRows.slice(0, MAX_CITIES_DISPLAY);
      const overflow = [...realRows.slice(MAX_CITIES_DISPLAY), ...(otherRow ? [otherRow] : [])];

      const finalRows = [...top];
      if (overflow.length > 0) {
        finalRows.push({
          city: CITY_OTHER_LABEL,
          sessions: overflow.reduce((sum, r) => sum + r.sessions, 0),
          totalUsers: overflow.reduce((sum, r) => sum + r.totalUsers, 0),
          purchases: overflow.reduce((sum, r) => sum + r.purchases, 0),
          gaRevenue: overflow.reduce((sum, r) => sum + r.gaRevenue, 0),
        });
      }

      byStore[id] = finalRows
        .map((r) => ({
          city: r.city,
          sessions: r.sessions,
          sessionsPercent: this.sharePercent(r.sessions, storeTotals.sessions),
          totalUsers: r.totalUsers,
          usersPercent: this.sharePercent(r.totalUsers, storeTotals.totalUsers),
          purchases: r.purchases,
          purchasesPercent: this.sharePercent(r.purchases, storeTotals.purchases),
          gaRevenue: r.gaRevenue,
          revenuePercent: this.sharePercent(r.gaRevenue, storeTotals.gaRevenue),
          conversionPercent: r.sessions > 0 ? Number(((r.purchases / r.sessions) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions);
    }

    return { filters: { startDate, endDate }, byStore, totalSessionsByStore };
  }

  /**
   * A nivel de PRODUCTO — mismo problema de cardinalidad y misma solución
   * que `getLandingPages`/`getCities` (Top 20 del rango + "(otros)"), pero
   * los `*Percent` NO usan `getAuthoritativeTotalsByStore` (eso es sesiones
   * de `ga_daily`, una base que no tiene sentido para métricas de ÍTEM) —
   * se usa como denominador la suma de TODAS las filas de
   * `ga_daily_by_product` de la tienda/rango (incluyendo lo que ya venía
   * agrupado en "(otros)" por día), así los `%` siempre sumen 100% entre
   * todos los productos reales + "(otros)".
   */
  async getProducts(startDate: string, endDate: string, storeId?: string): Promise<GaProductsResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(startDate));
    const endDay = toDayBucketColombia(normalizeEndDate(endDate));
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'ga_daily_by_product',
      ['item_id', 'item_name', 'item_category'],
      ['items_viewed', 'items_added_to_cart', 'items_purchased', 'item_revenue'],
      startDay,
      endDay,
      storeId,
    );

    const byStore: Record<string, GaProductBreakdownRow[]> = {};
    const totalItemsViewedByStore: Record<string, number> = {};
    const storeIds = Array.from(new Set(rows.map((r) => String(r.store_id))));
    for (const id of storeIds) {
      const summed = rows
        .filter((r) => String(r.store_id) === id)
        .map((r) => ({
          itemId: String(r.item_id),
          itemName: String(r.item_name),
          itemCategory: String(r.item_category),
          itemsViewed: Number(r.items_viewed),
          itemsAddedToCart: Number(r.items_added_to_cart),
          itemsPurchased: Number(r.items_purchased),
          itemRevenue: Number(r.item_revenue),
        }));

      const storeTotals = summed.reduce(
        (acc, r) => ({
          itemsViewed: acc.itemsViewed + r.itemsViewed,
          itemsAddedToCart: acc.itemsAddedToCart + r.itemsAddedToCart,
          itemsPurchased: acc.itemsPurchased + r.itemsPurchased,
          itemRevenue: acc.itemRevenue + r.itemRevenue,
        }),
        { itemsViewed: 0, itemsAddedToCart: 0, itemsPurchased: 0, itemRevenue: 0 },
      );
      totalItemsViewedByStore[id] = storeTotals.itemsViewed;

      const otherRow = summed.find((r) => r.itemId === PRODUCT_OTHER_ID);
      const realRows = summed.filter((r) => r.itemId !== PRODUCT_OTHER_ID).sort((a, b) => b.itemsViewed - a.itemsViewed);
      const top = realRows.slice(0, MAX_PRODUCTS_DISPLAY);
      const overflow = [...realRows.slice(MAX_PRODUCTS_DISPLAY), ...(otherRow ? [otherRow] : [])];

      const finalRows = [...top];
      if (overflow.length > 0) {
        finalRows.push({
          itemId: PRODUCT_OTHER_ID,
          itemName: PRODUCT_OTHER_ID,
          itemCategory: PRODUCT_OTHER_ID,
          itemsViewed: overflow.reduce((sum, r) => sum + r.itemsViewed, 0),
          itemsAddedToCart: overflow.reduce((sum, r) => sum + r.itemsAddedToCart, 0),
          itemsPurchased: overflow.reduce((sum, r) => sum + r.itemsPurchased, 0),
          itemRevenue: overflow.reduce((sum, r) => sum + r.itemRevenue, 0),
        });
      }

      // Links REALES ya cacheados por el sync (`ga_product_links`) — solo para las filas
      // que se van a mostrar, nunca para todo el catálogo. "(otros)" nunca tiene link.
      const realFinalItemIds = finalRows.map((r) => r.itemId).filter((itemId) => itemId !== PRODUCT_OTHER_ID);
      const linksMap = await this.gaProductLinksRepository.getLinksMap(id, realFinalItemIds);

      byStore[id] = finalRows
        .map((r) => {
          const link = linksMap.get(r.itemId);
          return {
            itemId: r.itemId,
            itemName: r.itemName,
            itemCategory: r.itemCategory,
            itemsViewed: r.itemsViewed,
            itemsViewedPercent: this.sharePercent(r.itemsViewed, storeTotals.itemsViewed),
            itemsAddedToCart: r.itemsAddedToCart,
            itemsAddedToCartPercent: this.sharePercent(r.itemsAddedToCart, storeTotals.itemsAddedToCart),
            itemsPurchased: r.itemsPurchased,
            itemsPurchasedPercent: this.sharePercent(r.itemsPurchased, storeTotals.itemsPurchased),
            itemRevenue: r.itemRevenue,
            itemRevenuePercent: this.sharePercent(r.itemRevenue, storeTotals.itemRevenue),
            viewToPurchasePercent: r.itemsViewed > 0 ? Number(((r.itemsPurchased / r.itemsViewed) * 100).toFixed(2)) : 0,
            productUrl: link?.productUrl,
            productReference: link?.productReference ?? undefined,
          };
        })
        .sort((a, b) => b.itemsViewed - a.itemsViewed);
    }

    return { filters: { startDate, endDate }, byStore, totalItemsViewedByStore };
  }

  /**
   * Nuevos vs. recurrentes (`newVsReturning` de GA4) — responde si un
   * segmento compra/convierte mejor que el otro. Baja cardinalidad
   * (2-3 valores fijos), así que a diferencia de `getLandingPages` no
   * hace falta ningún tope ni fila "(otros)" — se mapea tal cual.
   */
  async getUserTypes(startDate: string, endDate: string, storeId?: string): Promise<GaUserTypesResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(startDate));
    const endDay = toDayBucketColombia(normalizeEndDate(endDate));
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'ga_daily_by_user_type',
      ['user_type'],
      ['sessions', 'total_users', 'purchases', 'ga_revenue'],
      startDay,
      endDay,
      storeId,
    );
    const totalsByStore = await this.getAuthoritativeTotalsByStore(startDay, endDay, storeId);

    const byStore: Record<string, GaUserTypeBreakdownRow[]> = {};
    const totalSessionsByStore: Record<string, number> = {};
    const storeIds = Array.from(new Set(rows.map((r) => String(r.store_id))));
    for (const id of storeIds) {
      const storeRows = rows.filter((r) => String(r.store_id) === id);
      const storeTotals = totalsByStore[id] ?? { sessions: 0, totalUsers: 0, purchases: 0, gaRevenue: 0 };
      totalSessionsByStore[id] = storeTotals.sessions;
      byStore[id] = storeRows
        .map((r) => {
          const sessions = Number(r.sessions);
          const totalUsers = Number(r.total_users);
          const purchases = Number(r.purchases);
          const gaRevenue = Number(r.ga_revenue);
          return {
            userType: String(r.user_type),
            sessions,
            sessionsPercent: this.sharePercent(sessions, storeTotals.sessions),
            totalUsers,
            usersPercent: this.sharePercent(totalUsers, storeTotals.totalUsers),
            purchases,
            purchasesPercent: this.sharePercent(purchases, storeTotals.purchases),
            gaRevenue,
            revenuePercent: this.sharePercent(gaRevenue, storeTotals.gaRevenue),
            conversionPercent: sessions > 0 ? Number(((purchases / sessions) * 100).toFixed(2)) : 0,
          };
        })
        .sort((a, b) => b.sessions - a.sessions);
    }

    return { filters: { startDate, endDate }, byStore, totalSessionsByStore };
  }

  /**
   * Órdenes CONTABILIZADAS de VTEX (mismo criterio que el resto del
   * dashboard, ver `revenue-status.config.ts`) por tienda, para el rango
   * dado — insumo de `realConversionPercent` (vista previa de la Fase B).
   * Lee `sales_daily_by_status`, ya expuesto por `DashboardQueryRepository`,
   * sin tabla nueva.
   */
  private async getRevenueOrdersByStore(startDay: string, endDay: string, storeId?: string): Promise<Map<string, number>> {
    const statusRows = await this.dashboardQueryRepository.queryGroupedMulti(
      'sales_daily_by_status',
      ['status'],
      ['orders'],
      startDay,
      endDay,
      storeId,
    );

    const revenueOrdersByStore = new Map<string, number>();
    for (const row of statusRows) {
      if (!matchRevenueStatusDefinition({ status: String(row.status) }, this.revenueStatusDefinitions)) continue;
      const id = String(row.store_id);
      revenueOrdersByStore.set(id, (revenueOrdersByStore.get(id) ?? 0) + Number(row.orders));
    }
    return revenueOrdersByStore;
  }

  /**
   * Totales por tienda (sesiones, usuarios, compras, ingresos), leídos de
   * `ga_daily` — la MISMA fuente que usa `getOverview` para la tarjeta de
   * arriba. Se usan como denominador del % de participación de cada
   * métrica en `getChannels`/`getDevices` en vez de sumar las filas del
   * propio desglose, para que los totales mostrados ahí SIEMPRE coincidan
   * con los de la tarjeta principal. Confirmado en producción: sumar
   * `ga_daily_by_channel` por separado puede diferir un poco del total de
   * `ga_daily` — casi todo concentrado en el día de HOY (todavía en
   * curso, sigue acumulando entre una consulta a GA4 y la otra) — mismo
   * tipo de inestabilidad ya conocida de VTEX con días recién
   * sincronizados, no un error de cálculo. `totalUsers` sigue siendo
   * suma diaria (NO deduplicada entre días, igual nota que en
   * `GaStoreTotals.totalUsersSum`).
   */
  private async getAuthoritativeTotalsByStore(
    startDay: string,
    endDay: string,
    storeId?: string,
  ): Promise<Record<string, { sessions: number; totalUsers: number; purchases: number; gaRevenue: number }>> {
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'ga_daily',
      'date',
      ['sessions', 'total_users', 'purchases', 'ga_revenue'],
      startDay,
      endDay,
      storeId,
    );
    const result: Record<string, { sessions: number; totalUsers: number; purchases: number; gaRevenue: number }> = {};
    for (const row of rows) {
      const id = String(row.store_id);
      const acc = result[id] ?? { sessions: 0, totalUsers: 0, purchases: 0, gaRevenue: 0 };
      acc.sessions += Number(row.sessions);
      acc.totalUsers += Number(row.total_users);
      acc.purchases += Number(row.purchases);
      acc.gaRevenue += Number(row.ga_revenue);
      result[id] = acc;
    }
    return result;
  }

  /** `value ÷ total × 100`, redondeado a 2 decimales — `0` si `total` es 0 (sin base para calcular). */
  private sharePercent(value: number, total: number): number {
    return total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0;
  }

  /** Tasas ENTRE PASOS del embudo, sobre conteos de eventos — `null` si el paso anterior fue 0 (sin base para calcular %). */
  private computeFunnelRates(totals: GaStoreTotals): GaFunnelRates {
    return {
      viewToCartPercent: totals.itemViews > 0 ? Number(((totals.addToCarts / totals.itemViews) * 100).toFixed(2)) : null,
      cartToCheckoutPercent: totals.addToCarts > 0 ? Number(((totals.checkouts / totals.addToCarts) * 100).toFixed(2)) : null,
      checkoutToPurchasePercent: totals.checkouts > 0 ? Number(((totals.purchases / totals.checkouts) * 100).toFixed(2)) : null,
      viewToPurchasePercent: totals.itemViews > 0 ? Number(((totals.purchases / totals.itemViews) * 100).toFixed(2)) : null,
    };
  }
}
