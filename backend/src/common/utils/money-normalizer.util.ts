/**
 * Normaliza los valores monetarios que entrega VTEX (`totalValue` y cualquier
 * otro campo de dinero) a la unidad real de la moneda (ej. pesos colombianos).
 *
 * Este es el ÚNICO lugar donde se aplica esa conversión. Se ejecuta en el
 * backend, justo cuando las órdenes entran al sistema (ver
 * `VtexOrdersService`), de modo que todo lo que viene después —analítica,
 * KPIs, tarjetas por tienda, tabla comparativa y los 4 gráficos— ya trabaja
 * con el valor correcto sin tener que repetir la conversión en ningún otro
 * archivo.
 *
 * Por qué es necesario: en algunas cuentas VTEX, el campo `totalValue` del
 * listado de órdenes viene expresado en una unidad menor que la moneda
 * (por ejemplo, milésimas), lo que infla el valor real por 1000. Si al
 * sumar las órdenes facturadas de una tienda obtienes una cifra que en
 * texto dice "23 mil millones" cuando en realidad son "23 millones", ese
 * es exactamente el síntoma: sobra un factor de 1000 (o de 100, según la
 * configuración de la cuenta VTEX).
 *
 * `VTEX_MONEY_DIVISOR` en `.env` controla el factor de corrección:
 *   - 1000  → valores venían en milésimas (caso reportado / valor por defecto)
 *   - 100   → valores venían en centavos (convención estándar documentada por VTEX)
 *   - 1     → los valores ya vienen en la unidad correcta, sin conversión
 *
 * Para calibrarlo: compara el `totalValue` crudo de una orden conocida
 * contra su valor real en pesos y divide uno entre el otro.
 */
export function normalizeVtexMoneyValue(rawValue: number, divisor: number): number {
  if (!Number.isFinite(rawValue)) return 0;
  if (!divisor || divisor <= 0) return rawValue;
  return rawValue / divisor;
}
