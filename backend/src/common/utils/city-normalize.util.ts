/**
 * Normaliza el nombre de una ciudad para agrupar de forma consistente
 * (ej. "BOGOTA", "Bogotá ", "bogota" deben verse como una sola fila en el
 * desglose por ciudad). A diferencia de `normalizeText` (usada para
 * comparar `status`), aquí SÍ se conservan las tildes — el resultado se
 * muestra directamente en el dashboard, no solo se usa para comparar.
 *
 * Colapsa espacios repetidos, recorta los extremos y aplica Title Case
 * (una mayúscula inicial por palabra). Retorna `null` si no queda ningún
 * texto útil (ciudad vacía o solo espacios).
 */
export function normalizeCityName(rawCity: string | null | undefined): string | null {
  const collapsed = (rawCity ?? '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;

  return collapsed
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}
