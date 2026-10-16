import { GrowthThresholds } from '../../config/growth-thresholds.config';
import { GrowthStatus } from '../../modules/orders/interfaces/trends.interface';

/**
 * Clasifica el cambio mes a mes de un % DE PARTICIPACIÓN (no de venta en
 * pesos) — usado por `/pilatos` (sellers/marketplaces) y `/metodos-pago`
 * (métodos de pago): ambos miden "¿este nombre está ganando o perdiendo
 * peso relativo dentro del total?", con la misma regla de casos borde.
 *
 * `prior === null` cuando no hay mes anterior en el rango pedido (primer
 * punto). `everHadParticipation` = si el nombre ya tuvo participación > 0
 * en ALGÚN mes anterior de la serie (no solo el inmediatamente anterior)
 * — distingue un debut real ('new') de una reactivación tras un mes en 0
 * ('green': es una mejora clara, aunque no haya un % de referencia
 * significativo para calcular contra cero).
 */
export function classifyParticipationGrowth(
  current: number,
  prior: number | null,
  everHadParticipation: boolean,
  thresholds: GrowthThresholds,
): { growthPercent: number | null; status: GrowthStatus } {
  if (prior === null) return { growthPercent: null, status: 'no-data' };
  if (prior === 0) {
    if (current === 0) return { growthPercent: null, status: 'no-data' };
    return { growthPercent: null, status: everHadParticipation ? 'green' : 'new' };
  }
  const growthPercent = ((current - prior) / prior) * 100;
  const status: GrowthStatus =
    growthPercent >= thresholds.greenMinPercent ? 'green' : growthPercent <= thresholds.redMaxPercent ? 'red' : 'yellow';
  return { growthPercent, status };
}

/** "2026-09" → "2025-09". */
export function yearAgoMonthKey(month: string): string {
  const [year, m] = month.split('-');
  return `${Number(year) - 1}-${m}`;
}

/** Mismo resultado de `classifyParticipationGrowth`, más el valor y el % de participación del mes de referencia (año pasado). */
export interface YearAgoComparison {
  participationPercent: number;
  salesValue: number;
  growthPercent: number | null;
  status: GrowthStatus;
}

export interface MonthlyPointLike {
  /** "YYYY-MM". */
  month: string;
  total: number;
  breakdown: Record<string, number>;
}

export interface ParticipationPointLike {
  month: string;
  participationPercent: number;
  salesValue: number;
  total: number;
  growthPercent: number | null;
  status: GrowthStatus;
  vsYearAgo: YearAgoComparison | null;
}

/**
 * Compara la participación de `name` en `month` contra el MISMO MES, un
 * año antes — `null` si ese mes no existe en `totalByMonth` (sin
 * histórico tan atrás, ej. antes de julio 2025). A diferencia de
 * `classifyParticipationGrowth` usado mes-a-mes-anterior (que distingue
 * "Nuevo" de "reactivación" con `everHadParticipation`), acá siempre se
 * pasa `true`: cada comparación año a año es un punto independiente, no
 * tiene sentido hablar de "debut" cuando no se conoce el historial
 * completo antes del mes de referencia.
 */
function buildYearAgoComparison(
  name: string,
  month: string,
  currentParticipationPercent: number,
  totalByMonth: Map<string, number>,
  byMonth: Map<string, Record<string, number>>,
  thresholds: GrowthThresholds,
): YearAgoComparison | null {
  const priorMonth = yearAgoMonthKey(month);
  const priorTotal = totalByMonth.get(priorMonth);
  if (priorTotal === undefined) return null;

  const priorValue = byMonth.get(priorMonth)?.[name] ?? 0;
  const priorParticipationPercent = priorTotal > 0 ? (priorValue / priorTotal) * 100 : 0;
  const { growthPercent, status } = classifyParticipationGrowth(currentParticipationPercent, priorParticipationPercent, true, thresholds);
  return { participationPercent: priorParticipationPercent, salesValue: priorValue, growthPercent, status };
}

/**
 * Arma la tabla-semáforo de participación de cada `name` (método de pago,
 * seller o marketplace): para cada mes de `points`, calcula qué % del
 * total representó, cómo cambió esa participación respecto al mes
 * ANTERIOR del rango (`growthPercent`/`status`, igual criterio de
 * siempre) y, por separado, contra el MISMO MES un año antes
 * (`vsYearAgo`, `null` si no hay histórico esa fecha). Comparte esta
 * lógica `PaymentMethodsTrendService`/`PilatosMixService` — antes vivía
 * duplicada en cada servicio.
 *
 * IMPORTANTE: `totalByMonth`/`byMonth` deben cubrir TAMBIÉN el año
 * anterior a los meses de `points` (no solo los meses mostrados) — si no,
 * `vsYearAgo` siempre sale `null`. `points` en cambio SOLO trae los meses
 * que se van a mostrar (el año anterior nunca aparece como fila propia).
 */
export function buildParticipationSeries(
  names: string[],
  points: MonthlyPointLike[],
  totalByMonth: Map<string, number>,
  byMonth: Map<string, Record<string, number>>,
  thresholds: GrowthThresholds,
): { name: string; points: ParticipationPointLike[] }[] {
  return names.map((name) => {
    let priorParticipation: number | null = null;
    let everHadParticipation = false;
    const seriesPoints = points.map((point, index) => {
      const value = point.breakdown[name] ?? 0;
      const participationPercent = point.total > 0 ? (value / point.total) * 100 : 0;
      const { growthPercent, status } = classifyParticipationGrowth(
        participationPercent,
        index === 0 ? null : priorParticipation,
        everHadParticipation,
        thresholds,
      );
      priorParticipation = participationPercent;
      if (participationPercent > 0) everHadParticipation = true;

      const vsYearAgo = buildYearAgoComparison(name, point.month, participationPercent, totalByMonth, byMonth, thresholds);

      return { month: point.month, participationPercent, salesValue: value, total: point.total, growthPercent, status, vsYearAgo };
    });
    return { name, points: seriesPoints };
  });
}
