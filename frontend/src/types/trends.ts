/**
 * Espejo de `backend/src/modules/orders/interfaces/trends.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí.
 */

export type GrowthStatus = 'green' | 'yellow' | 'red' | 'new' | 'no-data';

export interface TrendMonthPoint {
  /** "YYYY-MM" del mes del período ACTUAL. */
  month: string;
  currentSales: number;
  currentOrders: number;
  priorSales: number | null;
  priorOrders: number | null;
  comparisonAvailable: boolean;
}

/**
 * `currentSales`/`priorSales`/`growthPercent` están calculados sobre los
 * MISMOS `comparableMonths` meses en ambos lados — nunca el rango
 * completo pedido contra un tramo más corto del año anterior.
 * `fullRangeCurrentSales`/`fullRangeCurrentOrders` es el total real de
 * TODO el rango pedido (informativo, puede no coincidir con
 * `currentSales` cuando `comparisonCoverage` es "partial").
 */
export interface StoreGrowth {
  storeId: string;
  storeName: string;
  fullRangeCurrentSales: number;
  fullRangeCurrentOrders: number;
  currentSales: number;
  currentOrders: number;
  priorSales: number | null;
  priorOrders: number | null;
  comparableMonths: number;
  growthPercent: number | null;
  status: GrowthStatus;
  comparisonCoverage: 'full' | 'partial' | 'none';
}

export interface TrendsResponse {
  currentRange: { startDate: string; endDate: string };
  comparisonRange: { startDate: string; endDate: string };
  monthly: TrendMonthPoint[];
  storeGrowth: StoreGrowth[];
  /** Mismo cálculo que cada fila de `storeGrowth`, pero sumando las 6 tiendas juntas — `storeId: 'all'` (sentinel). */
  overallGrowth: StoreGrowth;
}
