/**
 * Módulo `/metodos-pago` — cómo evoluciona mes a mes la participación de
 * cada método de pago sobre el total vendido (todas las tiendas
 * combinadas). "Ventas" = solo estados contabilizados, mismo criterio que
 * el resto del dashboard (ver `revenue-status.config.ts`). Mismo shape de
 * `ParticipationPoint`/`SeriesParticipation` que `/pilatos`
 * (`pilatos-mix.interface.ts`) — se reutilizan tal cual, es el mismo
 * patrón "participación mes a mes con semáforo de crecimiento relativo".
 */

import { ParticipationPoint, SeriesParticipation } from './pilatos-mix.interface';

/** Un mes: el total contabilizado (todas las tiendas) y cuánto vendió cada método de pago ese mes. */
export interface PaymentMethodMonthlyPoint {
  /** "YYYY-MM". */
  month: string;
  total: number;
  /** nombre del método de pago → valor vendido ese mes. */
  breakdown: Record<string, number>;
}

export interface PaymentMethodsTrendResponse {
  points: PaymentMethodMonthlyPoint[];
  /** Nombres únicos que aparecen en `points[].breakdown`, para un orden de series consistente en el gráfico. */
  methodNames: string[];
  /** Tabla-semáforo: participación de cada método mes a mes — ver `ParticipationPoint`. */
  participation: SeriesParticipation[];
}

export type { ParticipationPoint, SeriesParticipation };
