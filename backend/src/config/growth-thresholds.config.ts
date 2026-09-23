/**
 * Umbrales del semáforo de crecimiento año contra año (módulo
 * `/tendencias`). Único lugar donde vive esta regla de negocio — igual
 * patrón que `revenue-status.config.ts` — así que cambiar el % que
 * cuenta como "verde"/"rojo" no requiere tocar ningún otro archivo.
 */
export interface GrowthThresholds {
  /** Crecimiento >= este % se considera "verde". */
  greenMinPercent: number;
  /** Crecimiento <= este % (negativo) se considera "rojo". Entre este valor y `greenMinPercent`: "amarillo". */
  redMaxPercent: number;
}

export function getGrowthThresholds(): GrowthThresholds {
  return {
    greenMinPercent: 10,
    redMaxPercent: -5,
  };
}

/**
 * Umbrales del semáforo de participación de sellers/marketplaces
 * (módulo `/pilatos`) — mide el cambio mes a mes en el % de participación
 * sobre el total de Pilatos, no el crecimiento de la venta en pesos. Más
 * estrecho que el de `/tendencias` a propósito: la participación se
 * mueve poco de un mes a otro, así que ±5% ya es una señal relevante.
 */
export function getParticipationGrowthThresholds(): GrowthThresholds {
  return {
    greenMinPercent: 5,
    redMaxPercent: -5,
  };
}
