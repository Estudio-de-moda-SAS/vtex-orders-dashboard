/**
 * El enriquecimiento de producto (ciudad, descuento, categoría, marca) se
 * calcula en segundo plano y puede tardar en llegar. Mientras una tienda
 * no tenga `isComplete: true` para el rango consultado, un valor "vacío"
 * (ej. la key "Sin categoría" del backend) NO significa que de verdad no
 * haya categoría — significa que todavía no se ha revisado esa orden. Por
 * eso, en ese estado, la UI debe decir "Pendiente de identificar" en vez
 * de un "Sin X" que insinúa una ausencia real y confirmada.
 *
 * Se trata como incompleto por defecto (`isComplete` en `false` o
 * desconocido) mientras no haya llegado la primera respuesta de
 * `getEnrichmentStatus` — nunca se debe afirmar "Sin X" sin saber todavía
 * si es cierto.
 */
export function resolveUnknownLabel(
  value: string,
  isComplete: boolean,
  unknownValue: string,
  pendingLabel = 'Pendiente de identificar',
): string {
  if (value === unknownValue && !isComplete) return pendingLabel;
  return value;
}
