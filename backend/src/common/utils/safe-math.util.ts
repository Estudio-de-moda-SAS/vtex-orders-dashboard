/**
 * Divisiones protegidas para `/resumen` — el encargo es explícito: SI UN
 * PERÍODO NO TIENE DATOS, el valor es `null` y la UI muestra "sin
 * datos". Nunca se calcula ni se muestra un -100% inventado por falta
 * de datos (ej. período anterior en 0 o `null`).
 */

/** `null` si falta cualquiera de los dos valores o `denominator` es 0 — nunca `Infinity`/`NaN`. */
export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

/** % de cambio de `previous` a `current` — `null` si falta cualquiera de los dos o `previous` es 0. */
export function safePercentChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  const ratio = safeDivide(current, previous);
  return ratio === null ? null : (ratio - 1) * 100;
}
