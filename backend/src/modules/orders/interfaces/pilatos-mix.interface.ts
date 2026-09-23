/**
 * Módulo `/pilatos` (mezcla de venta directa vs. sellers/marketplaces en
 * el tiempo) — exclusivo Pilatos, la única tienda con `extraSegments`
 * configurados. "Ventas" = solo estados contabilizados (mismo criterio
 * que el resto del dashboard).
 */

import { GrowthStatus } from './trends.interface';

/**
 * Un mes: el total contabilizado, cuánto de ese total NO está atribuido
 * a ningún seller/marketplace nombrado ("venta directa"), y el desglose
 * por nombre. `direct + sum(breakdown values) === total` siempre (mismo
 * principio que "Sin colección"/"Sin campaña": la venta directa se
 * incluye a propósito para que el 100% del mes quede representado).
 */
export interface MonthlyMixPoint {
  /** "YYYY-MM". */
  month: string;
  total: number;
  direct: number;
  /** nombre del seller/marketplace → valor vendido ese mes. */
  breakdown: Record<string, number>;
}

/**
 * Un mes de la tabla-semáforo de participación de UN seller/marketplace:
 * qué % del total contabilizado de Pilatos representó ese mes, y cómo
 * cambió esa participación (NO la venta en pesos) respecto al mes
 * anterior. `growthPercent`/`status` son `null`/'no-data' en el primer
 * mes del rango (no hay mes anterior con el que comparar).
 */
export interface ParticipationPoint {
  /** "YYYY-MM". */
  month: string;
  /** % del total contabilizado de Pilatos ese mes (0-100). */
  participationPercent: number;
  /** Venta en pesos de este seller/marketplace ese mes — el dato comparativo detrás del %. */
  salesValue: number;
  /** Cambio % de `participationPercent` respecto al mes anterior del rango. `null` cuando `status` es 'new' o 'no-data'. */
  growthPercent: number | null;
  status: GrowthStatus;
}

export interface SeriesParticipation {
  name: string;
  points: ParticipationPoint[];
}

export interface PilatosMixResponse {
  bySeller: MonthlyMixPoint[];
  byMarketplace: MonthlyMixPoint[];
  /** Nombres únicos que aparecen en `bySeller[].breakdown`, para un orden de series consistente en el gráfico. */
  sellerNames: string[];
  marketplaceNames: string[];
  /** Tabla-semáforo debajo del gráfico 1 (uno por `sellerNames`) — ver `ParticipationPoint`. */
  sellerParticipation: SeriesParticipation[];
  marketplaceParticipation: SeriesParticipation[];
}
