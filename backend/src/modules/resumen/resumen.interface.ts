import { ChangePieceName } from '../../common/utils/change-engine.util';
import { SemaphoreColor } from '../../common/utils/resumen-semaphore.util';

/**
 * Respuesta de `GET /api/analytics/summary` — lectura SQL pura sobre
 * `sales_daily*`/`ga_daily*` (nunca VTEX ni Google en vivo). Espejo en
 * `frontend/src/types/resumen.ts`.
 */

export interface ResumenDateRange {
  startDate: string;
  endDate: string;
}

/** Valor en A, en B, y el % de cambio de B a A. Cualquiera puede ser `null` — NUNCA se inventa un dato ni un -100%. */
export interface ResumenMetricPair {
  a: number | null;
  b: number | null;
  changePercent: number | null;
}

export interface ResumenThresholdsInfo {
  /** Negativo. */
  redLimit: number;
  greenLimit: number;
  source: 'historial propio' | 'valores por defecto';
  /** `null` cuando `source` es "valores por defecto". */
  sigma: number | null;
  windowCount: number;
}

/** Mínimo de órdenes contabilizadas para que el semáforo opine — calculado por tienda, ver `computeMinOrdersThreshold`. */
export interface ResumenMinOrdersInfo {
  minOrders: number;
  source: 'historial propio' | 'valores por defecto';
  /** `null` cuando `source` es "valores por defecto". */
  medianOrders: number | null;
  windowCount: number;
}

/** Solo presente cuando la conversión según Analytics cambió >= 5% y la cobertura GA es 100% en A y B. */
export interface ResumenMixReading {
  mixEffect: number;
  withinEffect: number;
  reading: 'mezcla' | 'dentro' | 'no concluyente';
}

/**
 * Solo presente para Pilatos. `totalSales`/`totalOrders` son LAS MISMAS
 * cifras que los campos `sales`/`orders` de nivel superior (se repiten
 * acá para que la tarjeta pueda mostrar "ambas líneas" sin tener que
 * recordar de dónde viene cada una). `siteSales`/`siteOrders` son la
 * base que usan `conversionPercent`/`ticket`/el motor del cambio (ya a
 * nivel superior para Pilatos, que YA vienen con este ajuste aplicado) —
 * se exponen acá solo para que el panel de detalle pueda mostrar el
 * número exacto que se usó, nunca para que otro cálculo los repita.
 */
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
  /** Período C (año anterior) — informativo, nunca afecta semáforo/motor. `undefined` si no hay datos en ninguno de los dos lados. */
  periodC?: ResumenDateRange;

  /** Ventas contabilizadas — para Pilatos, las TOTALES (todas las fuentes); ver `pilatos.siteSales` para la base ajustada. */
  sales: ResumenMetricPair;
  /**
   * Órdenes contabilizadas (`sales_daily_by_status`, mismo filtro de
   * estado que `sales`, conteo de órdenes en vez de suma de ventas) —
   * NO es "compras reales" (`sales_daily.real_revenue_orders`, que
   * dedupea fragmentos de una misma compra): se usa este conteo porque
   * no hay histórico confiable de compras reales para todo el rango que
   * necesita el semáforo, y la diferencia entre ambos es normalmente
   * chica. Para Pilatos, son las TOTALES (todas las fuentes) — igual que
   * `sales` — así coincide exacto con la card "Contabilizadas" del
   * Dashboard; ver `pilatos.siteOrders` para la base ajustada que sí usan
   * `conversionPercent`/`ticket` más abajo.
   */
  orders: ResumenMetricPair;
  sessions: ResumenMetricPair;
  /** Ya en % — para Pilatos, usa `pilatos.siteOrders` ÷ sesiones, no `orders` de arriba. */
  conversionPercent: ResumenMetricPair;
  /** Ventas ÷ órdenes — para Pilatos, usa `pilatos.siteSales` ÷ `pilatos.siteOrders`, no `sales`/`orders` de arriba. */
  ticket: ResumenMetricPair;
  /** Período C — solo ventas, informativo. */
  salesYearAgo?: ResumenMetricPair;

  color: SemaphoreColor;
  /** Presente solo cuando `color === 'gris'`. */
  grayReason?: string;
  thresholds: ResumenThresholdsInfo;
  minOrdersInfo: ResumenMinOrdersInfo;

  /** El rango incluye días provisionales (hoy/ayer con fila) — nunca gatilla gris ni suprime ningún cálculo. */
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
  /** 1-based; las tiendas grises quedan al final. */
  rankingPosition: number;

  pilatos?: ResumenPilatosInfo;
}

export interface ResumenResponse {
  filters: { periodA: ResumenDateRange; periodB: ResumenDateRange };
  stores: ResumenStoreResult[];
}

export type { ChangePieceName, SemaphoreColor };
