/**
 * Estructuras de la analítica de producto (descuento, categoría, marca),
 * poblada por `OrderCityEnrichmentService` en `order_items` y calculada
 * por `ProductAnalyticsService`. Igual que `dashboard.interface.ts`: este
 * es el contrato con el frontend — cualquier cambio aquí debe reflejarse
 * en `frontend/src/types`.
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
 * Respuesta de `GET /api/analytics/discounts`. `global`/`byStore` cubren
 * TODAS las tiendas (monomarca y multimarca). `multiBrand` es un universo
 * DISTINTO y más chico: solo ítems de tiendas multimarca (hoy, únicamente
 * Pilatos — `multiBrand.storeNames` lo deja explícito) — no confundir
 * `multiBrand.general` con `global`, son números diferentes a propósito
 * (ver `ProductAnalyticsService.getMultiBrandDiscountBreakdown`).
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
  /** % sobre el total de valor vendido de la TIENDA (todas sus categorías, todas las órdenes) — mismo criterio que `cityBreakdown`. */
  percentage: number;
}

/** Ranking de categorías por tienda (todas las órdenes, sin filtrar por status), ordenado de mayor a menor `value`. Usado por `StoreCard` ("Categoría top"). */
export interface CategoryRankingResult {
  categories: CategoryRanking[];
}

/**
 * Aporte de una categoría sobre el total de ventas CONTABILIZADAS (mismo
 * criterio que `CityRevenueBreakdown`) — por eso la suma de `value` de
 * todas las categorías coincide con el valor contabilizado del rango.
 * `percentage` es sobre ese valor total. Usado por el recuadro de aporte
 * general por categoría (con o sin filtro de categorías específicas).
 */
export interface CategoryBreakdown {
  quantity: number;
  value: number;
  percentage: number;
}

export interface CategoryBrandTop {
  category: string;
  topBrand: string;
  quantity: number;
  value: number;
}

/**
 * Resultado de "para cada categoría, cuál es la marca que más vendió
 * dentro de ella" — SOLO aplica a tiendas multimarca (`isMultiBrand`).
 * Para una tienda monomarca, `applicable: false` con un `reason` legible
 * en vez de una lista vacía sin explicación.
 */
export type CategoryBrandRankingResult =
  | { applicable: true; categories: CategoryBrandTop[] }
  | { applicable: false; reason: string };

export interface EnrichmentStatus {
  storeId: string;
  totalOrders: number;
  enrichedOrders: number;
  percentage: number;
  isComplete: boolean;
}
