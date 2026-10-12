/**
 * Espejo de `backend/src/modules/resumen/resumen.interface.ts`.
 * Cualquier cambio ahí debe reflejarse acá.
 */

export type SemaphoreColor = 'verde' | 'amarillo' | 'rojo' | 'gris';
export type ChangePieceName = 'tráfico' | 'conversión' | 'ticket';

export interface ResumenDateRange {
  startDate: string;
  endDate: string;
}

/** Valor en A, en B, y el % de cambio de B a A. Cualquiera puede ser `null` — nunca se inventa un dato ni un -100%. */
export interface ResumenMetricPair {
  a: number | null;
  b: number | null;
  changePercent: number | null;
}

export interface ResumenThresholdsInfo {
  redLimit: number;
  greenLimit: number;
  source: 'historial propio' | 'valores por defecto';
  sigma: number | null;
  windowCount: number;
}

/** Mínimo de órdenes contabilizadas para que el semáforo opine — calculado por tienda, relativo a su propia mediana histórica. */
export interface ResumenMinOrdersInfo {
  minOrders: number;
  source: 'historial propio' | 'valores por defecto';
  medianOrders: number | null;
  windowCount: number;
}

export interface ResumenMixReading {
  mixEffect: number;
  withinEffect: number;
  reading: 'mezcla' | 'dentro' | 'no concluyente';
}

export interface ResumenPilatosInfo {
  totalSales: ResumenMetricPair;
  siteSales: ResumenMetricPair;
  siteOrders: ResumenMetricPair;
  excludedMarketplaces: string[];
}

export interface ResumenStoreResult {
  storeId: string;
  storeName: string;
  periodA: ResumenDateRange;
  periodB: ResumenDateRange;
  periodC?: ResumenDateRange;

  sales: ResumenMetricPair;
  /** Órdenes contabilizadas (no "compras reales" dedupeadas — ver README). */
  orders: ResumenMetricPair;
  sessions: ResumenMetricPair;
  conversionPercent: ResumenMetricPair;
  ticket: ResumenMetricPair;
  salesYearAgo?: ResumenMetricPair;

  color: SemaphoreColor;
  grayReason?: string;
  thresholds: ResumenThresholdsInfo;
  minOrdersInfo: ResumenMinOrdersInfo;

  provisional: boolean;
  provisionalDates: string[];
  gaCoverageA: number;
  gaCoverageB: number;

  engine: ChangePieceName | null;
  noEngineReason?: 'cambio-minimo' | 'sin-pieza-clara';
  engineChangePercent?: number;
  brakes: ChangePieceName[];
  brakeChangePercents?: Partial<Record<ChangePieceName, number>>;

  mix?: ResumenMixReading;

  message: string;
  rankingPosition: number;

  pilatos?: ResumenPilatosInfo;
}

export interface ResumenResponse {
  filters: { periodA: ResumenDateRange; periodB: ResumenDateRange };
  stores: ResumenStoreResult[];
}
