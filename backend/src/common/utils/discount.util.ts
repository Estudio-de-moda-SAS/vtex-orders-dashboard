/**
 * Calcula el % de descuento de un ítem a partir de su precio de lista y
 * precio de venta (ya normalizados con el mismo divisor que `totalValue`
 * — ver `VtexOrdersService.normalizeMoney`), redondeado al múltiplo de 5
 * más cercano (0%, 5%, 10%, 15%...).
 *
 * El redondeo es a propósito: sin él, casi todos los descuentos reales
 * (33.2%, 33.4%, 33.7%...) serían ligeramente distintos entre sí y nunca
 * habría una moda clara al agregar "cuál fue el descuento más aplicado" —
 * agrupar en buckets de 5 puntos es lo que le da sentido a esa pregunta.
 *
 * `listPrice <= 0` (ej. un ítem regalo con precio de lista 0) retorna 0%
 * en vez de `NaN`/`Infinity` — no hay descuento que calcular sobre una
 * base de cero. El resultado siempre se acota a [0, 100]: un
 * `sellingPrice > listPrice` (recargo, no descuento) no encaja en el
 * concepto de "bucket de descuento" y se trata como 0%.
 */
export function computeDiscountPercentage(listPrice: number, sellingPrice: number): number {
  if (!Number.isFinite(listPrice) || listPrice <= 0) return 0;
  if (!Number.isFinite(sellingPrice)) return 0;

  const rawPercentage = ((listPrice - sellingPrice) / listPrice) * 100;
  const clamped = Math.min(100, Math.max(0, rawPercentage));
  return Math.round(clamped / 5) * 5;
}
