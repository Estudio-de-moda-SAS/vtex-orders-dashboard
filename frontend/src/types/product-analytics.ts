/**
 * Espejo de `backend/src/modules/orders/interfaces/product-analytics.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí.
 */

export interface DiscountBucket {
  /** Porcentaje de descuento, ya redondeado al múltiplo de 5 (0, 5, 10, ..., 100). */
  bucket: number;
  /** Cuántos ítems (no órdenes) cayeron en este bucket. */
  count: number;
}

export interface DiscountDistribution {
  /** Ordenados de bucket ascendente (0%, 5%, 10%...). */
  buckets: DiscountBucket[];
  /** El bucket con más ocurrencias, o `null` si no hay datos todavía. */
  topBucket: number | null;
  /** Total de ítems considerados (suma de todos los buckets) — para calcular "% de ítems con el descuento top" sin sumar los buckets a mano. */
  totalItems: number;
}

/**
 * Respuesta de GET /api/analytics/discounts. `global`/`byStore` cubren
 * TODAS las tiendas (monomarca y multimarca). `multiBrand` es un universo
 * DISTINTO y más chico: solo ítems de tiendas multimarca (hoy, únicamente
 * Pilatos — `multiBrand.storeNames` lo deja explícito) — no confundir
 * `multiBrand.general` con `global`, son números diferentes a propósito.
 */
export interface DiscountAnalyticsResponse {
  global: DiscountDistribution;
  byStore: Record<string, DiscountDistribution>;
  multiBrand: {
    /** Nombres de las tiendas multimarca incluidas (hoy, `["Pilatos"]`) — para no hardcodear el nombre en el frontend. */
    storeNames: string[];
    general: DiscountDistribution;
    byBrand: Record<string, DiscountDistribution>;
  };
}

export interface CategoryRanking {
  category: string;
  quantity: number;
  value: number;
  /** % sobre el total de valor vendido de la TIENDA (todas sus categorías, todas las órdenes) — mismo criterio que `CityBreakdown`. */
  percentage: number;
}

/** Ranking de categorías por tienda (todas las órdenes, sin filtrar por status) — respuesta de GET /api/analytics/categories. */
export type CategoryRankingByStore = Record<string, { categories: CategoryRanking[] }>;

/**
 * Aporte de una categoría sobre el total de ventas CONTABILIZADAS (mismo
 * criterio que `CityRevenueBreakdown` en `types/dashboard.ts`) — por eso
 * la suma de `value` de todas las categorías coincide con el valor
 * contabilizado del rango. `percentage` es sobre ese valor total.
 */
export interface CategoryBreakdown {
  quantity: number;
  value: number;
  percentage: number;
}

/** Respuesta de GET /api/analytics/category-contribution. */
export interface CategoryContributionResponse {
  general: Record<string, CategoryBreakdown>;
  byStore: Record<string, Record<string, CategoryBreakdown>>;
}

export interface CategoryBrandTop {
  category: string;
  topBrand: string;
  quantity: number;
  value: number;
}

/**
 * Para cada categoría, la marca que más vendió DENTRO de ella — SOLO
 * aplica a tiendas multimarca. Para una monomarca, `applicable: false`
 * con un `reason` legible en vez de una lista vacía sin explicación.
 */
export type CategoryBrandRankingResult =
  | { applicable: true; categories: CategoryBrandTop[] }
  | { applicable: false; reason: string };

/** Respuesta de GET /api/analytics/category-brands. */
export type CategoryBrandRankingByStore = Record<string, CategoryBrandRankingResult>;

export interface CampaignBreakdown {
  /** Nombre tal cual lo entrega VTEX, ej. "Envío gratis". */
  campaignName: string;
  orders: number;
  sales: number;
}

export interface CollectionCategoryBreakdown {
  categoryName: string;
  units: number;
  sales: number;
}

/**
 * Una colección (Línea/Rack/Outlet/Saldos) con el desglose de categorías
 * vendidas DENTRO de ella (mayor a menor por unidades). Incluye también
 * "Sin colección" a propósito — sumar TODAS las filas (reales + "Sin
 * colección") da exactamente el total de unidades/ventas de la tienda.
 */
export interface CollectionBreakdown {
  collectionName: string;
  units: number;
  sales: number;
  categories: CollectionCategoryBreakdown[];
}

/**
 * Totales reales de la tienda en el rango (todas las órdenes, sin
 * filtrar) — referencia para verificar que sumar lo mostrado cuadra.
 */
export interface StoreHighlightTotals {
  orders: number;
  units: number;
  sales: number;
}

/**
 * Para una tienda: TODAS las campañas de descuento usadas en el rango y
 * TODAS las colecciones con ventas (incluyendo "Sin colección"), cada
 * una ya ordenada de mayor a menor (órdenes para campañas, unidades para
 * colecciones), más los totales reales de la tienda para verificación.
 */
export interface StoreHighlight {
  campaigns: CampaignBreakdown[];
  collections: CollectionBreakdown[];
  totals: StoreHighlightTotals;
}

/** Respuesta de GET /api/analytics/store-highlights. */
export type StoreHighlightsByStore = Record<string, StoreHighlight>;

/**
 * Total REAL (sin doble conteo) de un conjunto de campañas de descuento
 * seleccionadas, para UNA tienda. "Ventas" = solo estados contabilizados
 * (revenueOrders/revenueSales), mismo criterio que el resto del dashboard.
 */
export interface CampaignComboTotal {
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

/** Respuesta de GET /api/analytics/campaign-combo-total, indexado por storeId. */
export type CampaignComboTotalsByStore = Record<string, CampaignComboTotal>;
