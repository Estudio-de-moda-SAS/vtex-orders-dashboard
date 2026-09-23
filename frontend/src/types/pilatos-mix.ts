/**
 * Espejo de `backend/src/modules/orders/interfaces/pilatos-mix.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí.
 */

import { GrowthStatus } from './trends';

export interface MonthlyMixPoint {
  /** "YYYY-MM". */
  month: string;
  total: number;
  direct: number;
  /** nombre del seller/marketplace → valor vendido ese mes. */
  breakdown: Record<string, number>;
}

export interface ParticipationPoint {
  month: string;
  /** % del total contabilizado de Pilatos ese mes (0-100). */
  participationPercent: number;
  /** Venta en pesos de este seller/marketplace ese mes — el dato comparativo detrás del %. */
  salesValue: number;
  /** Cambio % de la participación respecto al mes anterior del rango. `null` cuando `status` es 'new' o 'no-data'. */
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
  sellerNames: string[];
  marketplaceNames: string[];
  sellerParticipation: SeriesParticipation[];
  marketplaceParticipation: SeriesParticipation[];
}
