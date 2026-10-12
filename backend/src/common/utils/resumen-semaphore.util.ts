import { dayCount, subtractDaysUtc } from './date-range.util';

export interface DateRange {
  startDay: string;
  endDay: string;
}

/**
 * Ventanas consecutivas, SIN SOLAPARSE, de la misma duración que
 * `[periodBStart, periodBEnd]`, empezando por esa misma ventana (índice
 * 0 = B) y yendo hacia atrás hasta `maxWindows`. A (el período que se
 * está juzgando) NUNCA entra acá — el historial se construye solo con
 * lo anterior a A, para que el cambio evaluado no influya en su propio
 * umbral.
 */
export function buildHistoryWindowRanges(periodBStart: string, periodBEnd: string, maxWindows: number): DateRange[] {
  const days = dayCount(periodBStart, periodBEnd);
  const windows: DateRange[] = [];
  let currentStart = periodBStart;
  let currentEnd = periodBEnd;
  for (let i = 0; i < maxWindows; i += 1) {
    windows.push({ startDay: currentStart, endDay: currentEnd });
    currentEnd = subtractDaysUtc(currentStart, 1);
    currentStart = subtractDaysUtc(currentEnd, days - 1);
  }
  return windows;
}

/**
 * Descarta ventanas que empiezan ANTES del primer día con datos reales de
 * la tienda (`earliestDataDate`, `undefined` si no se conoce). Una ventana
 * así no queda en 0 — queda con cobertura PARCIAL (solo los días dentro del
 * historial real aportan), lo que la haría ver como una caída real sin
 * haber pasado nada, e inflaría el σ o bajaría la mediana de órdenes sin
 * motivo. Relevante sobre todo con rangos largos (ej. 1 mes): 13 ventanas
 * de un mes alcanzan ~13 meses atrás, que puede caer antes del inicio del
 * historial de ventas de la tienda.
 */
export function filterWindowsFromEarliestDate(windows: DateRange[], earliestDataDate: string | undefined): DateRange[] {
  if (!earliestDataDate) return windows;
  return windows.filter((w) => w.startDay >= earliestDataDate);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Desviación robusta (MAD escalada): 1.4826 × mediana(|cambio − mediana(cambios)|).
 * A diferencia de la desviación estándar clásica, un pico puntual (ej.
 * Black Friday) no la distorsiona — es justo lo que pide el spec para
 * que el umbral de cada tienda no se "infle" por un solo mes atípico.
 */
export function computeRobustSigma(changes: number[]): number {
  if (changes.length === 0) return 0;
  const med = median(changes);
  const absoluteDeviations = changes.map((c) => Math.abs(c - med));
  return 1.4826 * median(absoluteDeviations);
}

export interface StoreThresholdsConfig {
  floorRedPercent: number;
  floorGreenPercent: number;
  k: number;
  minHistoryChanges: number;
}

export interface StoreThresholds {
  /** Negativo — variación por debajo de esto es "rojo". */
  redLimit: number;
  /** Positivo — variación igual o por encima de esto es "verde". */
  greenLimit: number;
  source: 'historial propio' | 'valores por defecto';
  /** `null` cuando se usan los valores por defecto (no hubo suficiente historial para calcularla). */
  sigma: number | null;
  /** Ventanas con ventas que sobrevivieron el filtro (antes de calcular cambios). */
  windowCount: number;
}

/**
 * `windowSales` debe venir en el MISMO orden que entrega
 * `buildHistoryWindowRanges` (índice 0 = B, 1 = la ventana justo antes
 * de B, ...), con `null`/`0` para una ventana sin ventas. Esas ventanas
 * se excluyen ANTES de calcular los cambios porcentuales — los cambios
 * se calculan entre las ventanas que sobreviven, en el mismo orden
 * temporal en que quedaron (aunque ya no sean calendario-adyacentes
 * entre sí tras quitar las que no tienen ventas).
 */
export function computeStoreThresholds(windowSales: (number | null)[], config: StoreThresholdsConfig): StoreThresholds {
  const survivors = windowSales.filter((v): v is number => v !== null && v > 0);
  const changes: number[] = [];
  for (let i = 0; i < survivors.length - 1; i += 1) {
    const newer = survivors[i];
    const older = survivors[i + 1];
    changes.push(((newer - older) / older) * 100);
  }

  if (changes.length >= config.minHistoryChanges) {
    const sigma = computeRobustSigma(changes);
    return {
      redLimit: -Math.max(config.floorRedPercent, config.k * sigma),
      greenLimit: Math.max(config.floorGreenPercent, config.k * sigma),
      source: 'historial propio',
      sigma,
      windowCount: survivors.length,
    };
  }

  return {
    redLimit: -config.floorRedPercent,
    greenLimit: config.floorGreenPercent,
    source: 'valores por defecto',
    sigma: null,
    windowCount: survivors.length,
  };
}

export interface MinOrdersConfig {
  /** Piso absoluto — nunca confiar en menos que esto, tenga o no historial propio la tienda. */
  minOrdersFloor: number;
  /** Usado cuando la tienda no tiene suficiente historial propio de órdenes para sacar una mediana confiable. */
  minOrdersDefault: number;
  /** Fracción de la mediana histórica propia de la tienda que se exige como mínimo (ej. 0,3 = 30%). */
  minOrdersRelativeFraction: number;
  /** Ventanas con órdenes mínimas para confiar en la mediana en vez de caer a `minOrdersDefault`. */
  minHistoryWindowsForOrders: number;
}

export interface MinOrdersResult {
  minOrders: number;
  source: 'historial propio' | 'valores por defecto';
  /** `null` cuando `source` es "valores por defecto". */
  medianOrders: number | null;
  /** Ventanas con órdenes que sobrevivieron el filtro (`null`/0 excluidas). */
  windowCount: number;
}

/**
 * Mínimo de órdenes para que el semáforo opine, calculado SOBRE EL
 * COMPORTAMIENTO PROPIO de cada tienda (igual espíritu que
 * `computeStoreThresholds`) en vez de un número fijo igual para todas:
 * una tienda que normalmente mueve pocas órdenes no debe quedar gris
 * todo el tiempo solo por ser chica, y una tienda grande con una caída
 * de volumen real sí debe quedar gris aunque ese número siga siendo
 * "mucho" para otra tienda.
 */
export function computeMinOrdersThreshold(windowOrders: (number | null)[], config: MinOrdersConfig): MinOrdersResult {
  const survivors = windowOrders.filter((v): v is number => v !== null && v > 0);
  if (survivors.length >= config.minHistoryWindowsForOrders) {
    const med = median(survivors);
    return {
      minOrders: Math.max(config.minOrdersFloor, med * config.minOrdersRelativeFraction),
      source: 'historial propio',
      medianOrders: med,
      windowCount: survivors.length,
    };
  }
  return {
    minOrders: config.minOrdersDefault,
    source: 'valores por defecto',
    medianOrders: null,
    windowCount: survivors.length,
  };
}

export type SemaphoreColor = 'verde' | 'amarillo' | 'rojo' | 'gris';

export interface SemaphoreResult {
  color: SemaphoreColor;
  /** Presente SOLO cuando `color === 'gris'` — el spec exige que el gris siempre traiga motivo. */
  grayReason?: string;
}

export interface ClassifySemaphoreInput {
  /** `null` si A o B no tienen datos de ventas — nunca se infiere ni se fuerza a 0/-100. */
  salesChangePercent: number | null;
  /** Ventas totales contabilizadas de B — si es 0 o `null`, no hay base para la variación %. */
  salesB: number | null;
  redLimit: number;
  greenLimit: number;
  /** Compras reales de A y B (o, si son `null`, órdenes contabilizadas — marcar `volumeIsOrdersFallback`). */
  purchasesA: number | null;
  purchasesB: number | null;
  /** `true` si `purchasesA`/`purchasesB` en realidad son órdenes contabilizadas (compras reales no disponibles para ese período). */
  volumeIsOrdersFallback?: boolean;
  minPurchases: number;
}

/** El color depende SOLO de la variación de ventas — nunca de sesiones, conversión ni ticket (eso es el motor, no el semáforo). */
export function classifySemaphore(input: ClassifySemaphoreInput): SemaphoreResult {
  if (input.salesChangePercent === null) {
    return { color: 'gris', grayReason: 'Sin datos de ventas en el período actual o en el anterior.' };
  }
  if (input.salesB === null || input.salesB === 0) {
    return { color: 'gris', grayReason: 'El período anterior no tuvo ventas — no hay base para calcular la variación.' };
  }

  const volumeLabel = input.volumeIsOrdersFallback ? 'órdenes contabilizadas' : 'compras reales';
  if (
    input.purchasesA === null ||
    input.purchasesB === null ||
    input.purchasesA < input.minPurchases ||
    input.purchasesB < input.minPurchases
  ) {
    return {
      color: 'gris',
      grayReason: `Menos de ${input.minPurchases} ${volumeLabel} en el período actual o en el anterior — muy pocos datos para opinar.`,
    };
  }

  if (input.salesChangePercent >= input.greenLimit) return { color: 'verde' };
  if (input.salesChangePercent < input.redLimit) return { color: 'rojo' };
  return { color: 'amarillo' };
}
