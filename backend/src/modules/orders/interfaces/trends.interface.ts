/**
 * Módulo `/tendencias` (comparativo año contra año). Ver plan de
 * planeación del módulo — el frontend nunca habla con VTEX, todo sale de
 * `sales_daily_by_status` (mismo criterio de "ventas" que el resto del
 * dashboard: solo estados contabilizados).
 */

/** Semáforo de crecimiento — ver `growth-thresholds.config.ts` para los umbrales. */
export type GrowthStatus = 'green' | 'yellow' | 'red' | 'new' | 'no-data';

/**
 * Un punto mensual de la línea de tendencia. `priorSales`/`priorOrders`
 * son `null` cuando ese mes específico cae antes del inicio del
 * histórico disponible (2025-07) — `comparisonAvailable: false` en ese
 * caso, para que el frontend no dibuje una comparación inventada.
 */
export interface TrendMonthPoint {
  /** "YYYY-MM", mes del período ACTUAL (el equivalente del año anterior se infiere restando 1 año). */
  month: string;
  currentSales: number;
  currentOrders: number;
  priorSales: number | null;
  priorOrders: number | null;
  comparisonAvailable: boolean;
}

/**
 * Ranking de una tienda por % de crecimiento — SIEMPRE las 6 tiendas,
 * sin importar el filtro `storeId` de la petición (ese filtro solo
 * acota `monthly`, no `storeGrowth`: el ranking existe justamente para
 * comparar tiendas entre sí).
 *
 * IMPORTANTE: `currentSales`/`priorSales` (y `growthPercent`) están
 * calculados sobre los MISMOS meses en ambos lados (ver
 * `comparableMonths`) — nunca el rango completo pedido contra un tramo
 * más corto del año anterior, porque eso infla el % de forma falsa. Por
 * eso también existe `fullRangeCurrentSales`/`fullRangeCurrentOrders`:
 * el total real del rango completo pedido (ene-`endMonth`), para
 * mostrarlo informativamente aunque no todos esos meses tengan
 * comparación.
 */
export interface StoreGrowth {
  storeId: string;
  storeName: string;
  /** Total real de TODO el rango pedido (ene-`endMonth`) — informativo, sin relación con `growthPercent` cuando `comparisonCoverage` es 'partial'. */
  fullRangeCurrentSales: number;
  fullRangeCurrentOrders: number;
  /** Base usada para `growthPercent`: mismos `comparableMonths` meses en ambos lados. */
  currentSales: number;
  currentOrders: number;
  priorSales: number | null;
  priorOrders: number | null;
  /** Cuántos meses (de `endMonth` totales) tuvieron comparación disponible y entraron en `currentSales`/`priorSales`/`growthPercent`. */
  comparableMonths: number;
  /** `null` cuando `status` es 'new' o 'no-data' (no hay un % con sentido de negocio en esos casos). */
  growthPercent: number | null;
  status: GrowthStatus;
  /** 'partial': el rango pedido cruza el límite de histórico (2025-07) — algunos meses sí comparan, otros no. */
  comparisonCoverage: 'full' | 'partial' | 'none';
}

export interface TrendsResponse {
  currentRange: { startDate: string; endDate: string };
  comparisonRange: { startDate: string; endDate: string };
  /** Si la petición trae `storeId`, refleja solo esa tienda — si no, la suma de las 6. */
  monthly: TrendMonthPoint[];
  storeGrowth: StoreGrowth[];
  /** Mismo cálculo que cada fila de `storeGrowth`, pero sumando las 6 tiendas juntas — `storeId: 'all'` (sentinel, nunca el id de una tienda real). */
  overallGrowth: StoreGrowth;
}
