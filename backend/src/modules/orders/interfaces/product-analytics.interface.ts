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

/** `orders`/`sales` acá son SOLO ventas contabilizadas (mismo criterio que el resto del dashboard) — una campaña sin ninguna orden contabilizada no aparece en la lista. */
export interface CampaignBreakdown {
  /** Nombre tal cual lo entrega VTEX (`ratesAndBenefitsData`), ej. "Envío gratis". */
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
 * Una colección (Línea/Rack/Outlet/Saldos — ver `StoreConfig.collections`)
 * con el desglose de categorías vendidas DENTRO de ella. `units`/`sales`
 * son SOLO ventas contabilizadas (mismo criterio que el resto del
 * dashboard). Incluye también "Sin colección" (el SKU no está en
 * ninguna de las 4 colecciones curadas) — se incluye a propósito para
 * que sumar TODAS las filas de la lista (reales + "Sin colección") dé
 * exactamente el total de unidades/ventas contabilizadas de la tienda,
 * sin dejar nada afuera. Las colecciones reales van ordenadas de mayor
 * a menor por unidades; "Sin colección" siempre al final de la lista
 * (no es una colección real que tenga sentido destacar primero).
 */
export interface CollectionBreakdown {
  collectionName: string;
  units: number;
  sales: number;
  categories: CollectionCategoryBreakdown[];
}

/**
 * Totales de la tienda en el rango, mismo criterio de "ventas
 * contabilizadas" que `StoreDashboardData.totalOrders`/`revenueTotalValue`
 * — referencia para verificar que sumar lo mostrado en campañas/
 * colecciones (incluyendo "Sin colección") cuadra con esto. Para
 * campañas, como una orden puede tener más de una campaña simultánea, la
 * suma de `campaigns` puede superar `orders` (una orden con 2 campañas
 * cuenta en ambas) — no es un error, `orders` sigue sirviendo como
 * referencia de cuántas órdenes contabilizadas hubo en total.
 */
export interface StoreHighlightTotals {
  orders: number;
  units: number;
  sales: number;
}

/**
 * Para una tienda: TODAS las campañas de descuento usadas en el rango
 * (cantidad de órdenes + valor que representa cada una) y TODAS las
 * colecciones con ventas (incluyendo "Sin colección"), cada una con su
 * desglose de categorías — ambas listas ya vienen ordenadas de mayor a
 * menor por el valor principal de cada una (órdenes para campañas,
 * unidades para colecciones). `totals` trae los totales reales de la
 * tienda para poder verificar que todo está sumado (ver
 * `StoreHighlightTotals`).
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
 * seleccionadas, para UNA tienda — ver `DashboardQueryRepository.getCampaignComboTotals`.
 * "Ventas" = solo estados contabilizados (mismo criterio que el resto del
 * dashboard), igual que `revenueOrders`/`revenueSales` en `StoreDashboardData`.
 */
export interface CampaignComboTotal {
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

/** Respuesta de GET /api/analytics/campaign-combo-total, indexado por storeId. */
export type CampaignComboTotalsByStore = Record<string, CampaignComboTotal>;
