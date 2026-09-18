/**
 * ALLOWLIST explícita de columnas del Excel que el importador puede leer.
 * A propósito es una lista de PERMITIDOS, no de prohibidos: cualquier
 * columna que no esté aquí (dato personal, de pago, o cualquier campo
 * nuevo que alguien agregue al Excel en el futuro) queda excluida
 * automáticamente, sin necesitar mantener una lista de bloqueo que
 * siempre corre el riesgo de quedar incompleta. `pickSafeRow` es el
 * ÚNICO punto por el que pasa cada fila leída del Excel — nada aguas
 * abajo (agregación, `sync_logs`, logs de consola) ve la fila cruda.
 */
export const ALLOWED_COLUMNS = [
  'Order',
  'Creation Date',
  'Status raw value (temporary)',
  'Status',
  'Total Value',
  'Payment System Name',
  'SalesChannel',
  'Seller Name',
  'City',
  'ID_SKU',
  'Category Ids Sku',
  'SKU Value',
  'SKU Selling Price',
  'Discounts Names',
  'Host',
] as const;

export type SafeRow = Partial<Record<(typeof ALLOWED_COLUMNS)[number], unknown>>;

/**
 * Descarta TODO lo que no esté en `ALLOWED_COLUMNS` — se llama
 * inmediatamente al leer cada fila, antes de cualquier otro
 * procesamiento (agrupación, validación de `Host`, etc.), para que un
 * dato sensible nunca llegue a existir en memoria más allá de esta
 * función.
 */
export function pickSafeRow(rawRow: Record<string, unknown>): SafeRow {
  const safe: SafeRow = {};
  for (const column of ALLOWED_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(rawRow, column)) {
      safe[column] = rawRow[column];
    }
  }
  return safe;
}
