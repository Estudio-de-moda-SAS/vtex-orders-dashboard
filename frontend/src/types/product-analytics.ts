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

/** Respuesta de GET /api/sync/enrichment-status. */
export interface EnrichmentStatus {
  storeId: string;
  totalOrders: number;
  enrichedOrders: number;
  percentage: number;
  isComplete: boolean;
}
