/**
 * Normaliza texto para comparaciones insensibles a mayúsculas/minúsculas y
 * a tildes/acentos. Útil para comparar `status`/`statusDescription` de VTEX
 * contra listas de valores esperados sin preocuparse por variaciones de
 * formato (ej. "Facturado" vs "facturado" vs "Faturado").
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
