/**
 * Espejo de `backend/src/modules/analytics-ga/ga-analytics.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí.
 */

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

export interface GaFunnelRates {
  viewToCartPercent: number | null;
  cartToCheckoutPercent: number | null;
  checkoutToPurchasePercent: number | null;
  viewToPurchasePercent: number | null;
}

export interface GaStoreTotals {
  sessions: number;
  /** Suma diaria — NO deduplicado entre días del rango (alguien que visita 2 días cuenta 2 veces). */
  totalUsersSum: number;
  /** Suma diaria — a diferencia de `totalUsersSum`, ESTA SÍ es exacta (un usuario es "nuevo" una sola vez en toda su vida). */
  newUsersSum: number;
  /** `totalUsersSum - newUsersSum`, nunca negativo — aproximado en rangos de más de un día (ver nota de `totalUsersSum`). */
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
  lastSyncStatus: 'success' | 'error' | 'partial' | null;
  provisionalDays: string[];
  coverage: number;
  /** Órdenes CONTABILIZADAS de VTEX para esta tienda/rango — denominador de `realConversionPercent`. */
  revenueOrders: number;
  /** Conversión REAL (órdenes VTEX ÷ sesiones GA4) — vista previa de la Fase B, sin comparación de período ni ajuste de marketplaces de Pilatos. `null` sin sesiones. */
  realConversionPercent: number | null;
}

export interface GaOverviewResponse {
  filters: { startDate: string; endDate: string };
  stores: GaStoreOverview[];
}

/** Cada métrica trae su propio `*Percent` — % del TOTAL de ESA MISMA métrica (no todas respecto a sesiones). */
export interface GaChannelBreakdownRow {
  channelGroup: string;
  sessions: number;
  sessionsPercent: number;
  /** Suma diaria — NO deduplicado entre días del rango. */
  totalUsers: number;
  usersPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  /** "Según Analytics" — no es la conversión real contra pedidos de VTEX. */
  conversionPercent: number;
}

export interface GaChannelsResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaChannelBreakdownRow[]>;
  totalSessionsByStore: Record<string, number>;
}

/** Ver nota de `GaChannelBreakdownRow`. */
export interface GaDeviceBreakdownRow {
  deviceCategory: string;
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

export interface GaDevicesResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaDeviceBreakdownRow[]>;
  totalSessionsByStore: Record<string, number>;
}

/** `landingPage` trae `(otros)` para la suma de páginas fuera del Top 20 diario — no una página real. */
export interface GaLandingPageBreakdownRow {
  landingPage: string;
  sessions: number;
  sessionsPercent: number;
  totalUsers: number;
  usersPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  conversionPercent: number;
  /** `1 - sesiones con interacción ÷ sesiones` de ESTA página, en % — mismo criterio que la tasa de rebote general. */
  bounceRatePercent: number;
}

export interface GaLandingPagesResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaLandingPageBreakdownRow[]>;
  totalSessionsByStore: Record<string, number>;
}

/** `userType`: "new" | "returning" | "(not set)" — baja cardinalidad, sin tope ni fila "(otros)". */
export interface GaUserTypeBreakdownRow {
  userType: string;
  sessions: number;
  sessionsPercent: number;
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
  totalSessionsByStore: Record<string, number>;
}

/** `city` trae `(otros)` para la suma de ciudades fuera del Top 20 diario — no una ciudad real. */
export interface GaCityBreakdownRow {
  city: string;
  sessions: number;
  sessionsPercent: number;
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
  totalSessionsByStore: Record<string, number>;
}

/**
 * A nivel de PRODUCTO — métricas de ÍTEM (vistas/agregados/compras DE ESE
 * producto), no de sesión. `itemId` trae `(otros)` para productos fuera
 * del Top 20 diario — no un producto real.
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
  /** `itemsPurchased ÷ itemsViewed × 100` — mucha vista y bajo % acá apunta a revisar stock/precio/tallas/ficha. */
  viewToPurchasePercent: number;
  /** Link REAL de producto (VTEX), resuelto durante el sync — `undefined` si aún no se resolvió o si es "(otros)"/"(not set)". */
  productUrl?: string;
  /** Referencia (`RefId` de VTEX), si se pudo resolver. */
  productReference?: string;
}

export interface GaProductsResponse {
  filters: { startDate: string; endDate: string };
  byStore: Record<string, GaProductBreakdownRow[]>;
  totalItemsViewedByStore: Record<string, number>;
}

/**
 * Campaña (UTM) + fuente/medio — a diferencia de los demás desgloses, SIN
 * tope Top 20 ni fila "(otros)": trae TODAS las campañas del rango, para
 * que el buscador (`GaCampaignFilter`) pueda filtrar sobre la lista
 * completa. La mayoría de sesiones no tienen campaña y aparecen como
 * `campaignName: '(not set)'` — tráfico real orgánico/directo, no un error.
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
  totalSessionsByStore: Record<string, number>;
}
