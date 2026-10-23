/**
 * `% de cambio` genérico, protegido contra división por cero — usado por
 * las herramientas del asistente (`compare_periods`) para que el modelo
 * NUNCA reste ni divida por su cuenta. El resto del código (`/tendencias`,
 * `buildParticipationSeries`) calcula este mismo % en línea con su propia
 * semántica de casos borde (p.ej. "Nuevo" cuando el período anterior es 0);
 * esta versión es la genérica para cuando no hace falta esa semántica
 * adicional.
 *
 * `previous === 0` devuelve `null` (no 0% ni Infinity) — un cambio desde
 * cero no es un porcentaje con sentido, el llamador decide cómo narrarlo.
 */
export function percentChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
