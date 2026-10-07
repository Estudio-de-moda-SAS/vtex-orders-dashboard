/**
 * Espejo de `backend/src/modules/orders/interfaces/payment-methods-trend.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí. Reutiliza `SeriesParticipation`
 * de `pilatos-mix` — mismo shape, mismo patrón de participación mes a mes.
 */

import { SeriesParticipation } from './pilatos-mix';

export interface PaymentMethodMonthlyPoint {
  /** "YYYY-MM". */
  month: string;
  total: number;
  /** nombre del método de pago → valor vendido ese mes. */
  breakdown: Record<string, number>;
}

export interface PaymentMethodsTrendResponse {
  points: PaymentMethodMonthlyPoint[];
  methodNames: string[];
  participation: SeriesParticipation[];
}
