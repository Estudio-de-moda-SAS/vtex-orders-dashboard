/**
 * Respuestas de `GaQueryController` (`GET /api/analytics/ga/*`) — lectura
 * SQL pura sobre `ga_daily*`, nunca habla con Google en vivo. Espejo en
 * `frontend/src/types/ga-analytics.ts`.
 */
import { SyncStatus } from '../database/repositories/sync-logs.repository';

/** Un día de la serie — usuarios (`totalUsers`/`newUsers`) SOLO aparecen acá, nunca en `GaStoreOverview.totals` (no se pueden sumar entre días, ver nota en `GaSyncService`). */
export interface GaDailyPoint {
  date: string;
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  itemViews: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  gaRevenue: number;
}

/**
 * Tasas de conversión ENTRE PASOS del embudo — calculadas sobre CONTEOS
 * DE EVENTOS (cuántas veces ocurrió cada evento), no sobre sesiones
 * únicas: una misma sesión puede ver varios productos, agregar al
 * carrito varias veces, etc. `null` si el paso anterior tuvo 0 (no hay
 * base para calcular el %).
 */
export interface GaFunnelRates {
  viewToCartPercent: number | null;
  cartToCheckoutPercent: number | null;
  checkoutToPurchasePercent: number | null;
  viewToPurchasePercent: number | null;
}

export interface GaStoreTotals {
  sessions: number;
  /**
   * Suma de `totalUsers` día por día — NO es el número de usuarios únicos
   * deduplicado de GA4 para todo el rango de una sola vez (alguien que
   * visita 2 días distintos del rango cuenta 2 veces). Sirve para
   * comparar tiendas/rangos entre sí, nunca como "cuántas personas
   * distintas visitaron" exacto — por eso el nombre explícito `Sum`.
   */
  totalUsersSum: number;
  /**
   * Suma de `newUsers` día por día — a diferencia de `totalUsersSum`, esta
   * SÍ es exacta para el rango completo: GA4 marca a un usuario como
   * "nuevo" en el día de su PRIMERA visita de toda la vida del dato, una
   * sola vez por usuario — nunca se repite en otro día, así que sumar
   * varios días nunca duplica a nadie.
   */
  newUsersSum: number;
  /**
   * `totalUsersSum - newUsersSum`, nunca negativo. Aproximado para rangos
   * de más de un día — hereda la misma sobrecontabilización de
   * `totalUsersSum` (alguien que vuelve 3 días distintos del rango cuenta
   * 3 veces). Sirve para ver tendencia y proporción, no como "cuántas
   * personas distintas regresaron" exacto.
   */
  returningUsersSum: number;
  engagedSessions: number;
  itemViews: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  gaRevenue: number;
}

export interface GaStoreOverview {
  storeId: string;
  totals: GaStoreTotals;
  funnelRates: GaFunnelRates;
  dailySeries: GaDailyPoint[];
  lastSyncedAt: string | null;
  lastSyncStatus: SyncStatus | null;
  /** Últimos 2 días del rango pedido (si caen dentro de él) — GA4 tarda 24-48h en estabilizar sus números, estos días pueden seguir cambiando. */
  provisionalDays: string[];
  /** Días del rango con AL MENOS una fila en `ga_daily` (sincronizados, aunque haya sido en cero) ÷ días totales del rango — 0 a 1. */
  coverage: number;
  /** Órdenes CONTABILIZADAS de VTEX para esta tienda/rango (mismo criterio que el resto del dashboard) — denominador de `realConversionPercent`. */
  revenueOrders: number;
  /**
   * Conversión REAL (órdenes contabilizadas de VTEX ÷ sesiones de GA4) —
   * vista previa de la Fase B (cruce con ventas), sin las comparaciones
   * de período ni el ajuste de marketplaces externos de Pilatos (cuando
   * esa tienda tenga GA4 configurado, su conversión saldrá más baja de lo
   * real hasta que se implemente esa exclusión). `null` si no hubo
   * sesiones en el rango (sin base para calcular).
   */
  realConversionPercent: number | null;
}

export interface GaOverviewResponse {
  filters: { startDate: string; endDate: string };
  stores: GaStoreOverview[];
}

/**
 * Cada métrica trae su propio `*Percent`: qué % del TOTAL de esa misma
 * métrica (sesiones totales, usuarios totales, compras totales, ingresos
 * totales de la tienda en el rango — ver `GaChannelsResponse.totalSessionsByStore`
 * y la nota de `getAuthoritativeTotalsByStore`) representa este canal —
 * no son todas relativas a sesiones, cada una es relativa a su propio total.
 */
export interface GaChannelBreakdownRow {
  channelGroup: string;
  sessions: number;
  sessionsPercent: number;
  /** Suma diaria — NO deduplicado entre días del rango (alguien que visita 2 días distintos cuenta 2 veces). Útil para comparar canales entre sí, no como cifra exacta de personas. */
  totalUsers: number;
  usersPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  /** "Según Analytics" — purchases (evento GA4) ÷ sessions de ESTE canal. NO es la conversión real contra pedidos de VTEX (ver `GaStoreOverview.realConversionPercent`). */
  conversionPercent: number;
}

export interface GaChannelsResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaChannelBreakdownRow[]>;
  /** Total de sesiones de la tienda en el rango — el denominador de `sessionsPercent` de cada fila (viene de `ga_daily`, no de sumar los canales). */
  totalSessionsByStore: Record<string, number>;
}

/** Ver nota de `GaChannelBreakdownRow` — cada `*Percent` es relativo al total de ESA métrica, no todas respecto a sesiones. */
export interface GaDeviceBreakdownRow {
  deviceCategory: string;
  sessions: number;
  sessionsPercent: number;
  /** Suma diaria — NO deduplicado entre días del rango (ver nota en `GaChannelBreakdownRow`). */
  totalUsers: number;
  usersPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  /** "Según Analytics" — purchases (evento GA4) ÷ sessions de ESTE dispositivo. NO es la conversión real contra pedidos de VTEX (ver `GaStoreOverview.realConversionPercent`). */
  conversionPercent: number;
}

export interface GaDevicesResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaDeviceBreakdownRow[]>;
  /** Total de sesiones de la tienda en el rango — el denominador de `sessionsPercent` de cada fila. */
  totalSessionsByStore: Record<string, number>;
}

/**
 * Ver nota de `GaChannelBreakdownRow` — cada `*Percent` es relativo al
 * total de ESA métrica. `landingPage` trae `(otros)` para la suma de
 * todas las páginas fuera del Top 20 diario de cada tienda (ver
 * `GaReportUtil.rowsToByLandingPage`) — no una página real.
 */
export interface GaLandingPageBreakdownRow {
  landingPage: string;
  sessions: number;
  sessionsPercent: number;
  /** Suma diaria — NO deduplicado entre días del rango. */
  totalUsers: number;
  usersPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  conversionPercent: number;
}

export interface GaLandingPagesResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaLandingPageBreakdownRow[]>;
  /** Total de sesiones de la tienda en el rango — el denominador de `sessionsPercent` de cada fila. */
  totalSessionsByStore: Record<string, number>;
}

/**
 * `newVsReturning` de GA4 ("new"/"returning"/"(not set)") — responde si
 * los usuarios recurrentes compran más o convierten mejor que los
 * nuevos. Baja cardinalidad, sin tope ni fila "(otros)" (a diferencia de
 * `GaLandingPageBreakdownRow`). Ver nota de `GaChannelBreakdownRow` sobre
 * cada `*Percent`.
 */
export interface GaUserTypeBreakdownRow {
  userType: string;
  sessions: number;
  sessionsPercent: number;
  /** Suma diaria — NO deduplicado entre días del rango. */
  totalUsers: number;
  usersPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  conversionPercent: number;
}

export interface GaUserTypesResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaUserTypeBreakdownRow[]>;
  /** Total de sesiones de la tienda en el rango — el denominador de `sessionsPercent` de cada fila. */
  totalSessionsByStore: Record<string, number>;
}

/**
 * Ver nota de `GaChannelBreakdownRow` sobre cada `*Percent`. `city` trae
 * `(otros)` para la suma de todas las ciudades fuera del Top 20 diario de
 * cada tienda (ver `GaReportUtil.rowsToByCity`) — no una ciudad real.
 */
export interface GaCityBreakdownRow {
  city: string;
  sessions: number;
  sessionsPercent: number;
  /** Suma diaria — NO deduplicado entre días del rango. */
  totalUsers: number;
  usersPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  conversionPercent: number;
}

export interface GaCitiesResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaCityBreakdownRow[]>;
  /** Total de sesiones de la tienda en el rango — el denominador de `sessionsPercent` de cada fila. */
  totalSessionsByStore: Record<string, number>;
}

/**
 * A nivel de PRODUCTO (`itemId`/`itemName`/`itemCategory` de GA4) — la
 * pregunta de negocio es "¿qué se ve mucho pero no se compra?" vs. "¿qué
 * SÍ convierte?". Métricas de ÍTEM (vistas/agregados/compras DE ESE
 * producto), no de sesión — por eso cada `*Percent` es sobre el total de
 * ESA métrica entre TODOS los productos (ver `GaProductsResponse`), no
 * sobre sesiones de la tienda. `itemId` trae `(otros)` para la suma de
 * productos fuera del Top 20 diario (ver `GaReportUtil.rowsToByProduct`)
 * — no un producto real.
 */
export interface GaProductBreakdownRow {
  itemId: string;
  itemName: string;
  itemCategory: string;
  itemsViewed: number;
  itemsViewedPercent: number;
  itemsAddedToCart: number;
  itemsAddedToCartPercent: number;
  itemsPurchased: number;
  itemsPurchasedPercent: number;
  itemRevenue: number;
  itemRevenuePercent: number;
  /** `itemsPurchased ÷ itemsViewed × 100` — la señal clave para decidir: mucha vista y bajo % acá apunta a revisar stock/precio/tallas/ficha. */
  viewToPurchasePercent: number;
  /**
   * Link REAL de producto (VTEX), resuelto durante el sync contra la API
   * pública de catálogo y cacheado en `ga_product_links` — `undefined` si
   * todavía no se resolvió (SKU nuevo, pendiente del próximo sync) o si es
   * la fila "(otros)"/"(not set)" (no son productos reales).
   */
  productUrl?: string;
  /** Referencia (`RefId` de VTEX) del producto, si se pudo resolver — informativa, no se usa para armar ningún link. */
  productReference?: string;
}

export interface GaProductsResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaProductBreakdownRow[]>;
  /** Total de VISTAS de producto de la tienda en el rango — el denominador de `itemsViewedPercent` de cada fila (distinto de `totalSessionsByStore` de los demás desgloses). */
  totalItemsViewedByStore: Record<string, number>;
}

/**
 * `sessionCampaignName` + `sessionSourceMedium` de GA4 — qué campaña con
 * UTM (ej. "pilatos-bazar-on-off-promo-email-on-9102026") trajo qué
 * resultado, y desde qué fuente/medio (ej. "woowup / email") la disparó.
 * A diferencia de `GaLandingPageBreakdownRow`/`GaCityBreakdownRow`/
 * `GaProductBreakdownRow`, NO hay tope Top 20 ni fila "(otros)" — se
 * devuelven TODAS las campañas del rango (ver `GaReportUtil.rowsToByCampaign`),
 * para que el buscador de campañas del frontend pueda filtrar sobre la
 * lista completa. La gran mayoría de las sesiones NO tienen campaña
 * (tráfico orgánico/directo) y aparecen como `campaignName: '(not set)'`
 * — es tráfico real, no un error. Métricas de EMBUDO (no solo
 * sessions/totalUsers/purchases como el resto de desgloses), cada
 * `*Percent` relativo al total de ESA métrica (ver nota de
 * `GaChannelBreakdownRow`).
 */
export interface GaCampaignBreakdownRow {
  campaignName: string;
  sourceMedium: string;
  sessions: number;
  sessionsPercent: number;
  addToCarts: number;
  addToCartsPercent: number;
  checkouts: number;
  checkoutsPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  conversionPercent: number;
}

export interface GaCampaignsResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaCampaignBreakdownRow[]>;
  /** Total de sesiones de la tienda en el rango — el denominador de `sessionsPercent` de cada fila. */
  totalSessionsByStore: Record<string, number>;
}
