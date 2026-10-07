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
