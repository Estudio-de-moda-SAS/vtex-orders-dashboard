/**
 * Convierte un texto pegado (Excel/Sheets, un valor por línea) en
 * números — reglas de formato es-CO: la COMA es separador decimal, el
 * PUNTO es separador de miles (nunca al revés). Ej.: "24,5" → 24.5;
 * "1.234,5" → 1234.5; "24.500" (sin coma) → 24500 (exactamente 3 dígitos
 * después del último punto = agrupación de miles, no decimales).
 *
 * Nunca se usa `Number()`/`parseFloat` directo sobre el texto crudo — una
 * interpretación equivocada acá multiplicaría o dividiría el presupuesto
 * por 1000 en silencio, el mismo tipo de bug que ya tuvimos con
 * `VTEX_MONEY_DIVISOR` en el backend.
 */
export function parseRawBudgetValue(input: string): number | null {
  const trimmedOriginal = input.trim();
  if (trimmedOriginal === '') return 0; // línea realmente vacía (día sin presupuesto) — NO es lo mismo que texto no numérico.

  const cleaned = trimmedOriginal.replace(/[^\d.,-]/g, '');
  if (cleaned === '') return null; // había contenido pero nada numérico (ej. "abc", "N/A") — inválido, no cero.

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized: string;
  if (hasComma && hasDot) {
    // "1.234,5" → punto de miles, coma decimal.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // "24,5" → la coma SIEMPRE es decimal en este formato, sin importar cuántos dígitos la sigan.
    normalized = cleaned.replace(',', '.');
  } else if (hasDot) {
    // Sin coma: un punto puede ser decimal ("24.5") o agrupación de miles
    // ("24.500") — se asume agrupación SOLO si el patrón calza exacto con
    // grupos de 3 dígitos (miles reales), nunca por adivinar.
    const looksLikeThousands = /^\d{1,3}(\.\d{3})+$/.test(cleaned);
    normalized = looksLikeThousands ? cleaned.replace(/\./g, '') : cleaned;
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export interface ParsedBudgetPaste {
  /** Un valor por línea, en el mismo orden — `null` donde no se pudo interpretar. Una línea vacía se interpreta como 0, no como inválida. */
  values: (number | null)[];
  /** Índices (0-based) de las líneas que no se pudieron interpretar como número. */
  invalidLineIndexes: number[];
}

/** Separa el texto pegado por líneas y parsea cada una con `parseRawBudgetValue`. */
export function parsePastedBudgetValues(text: string): ParsedBudgetPaste {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  // Quita líneas vacías al FINAL (comunes al copiar de Excel con filas de más), preserva las del medio como 0.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const values: (number | null)[] = [];
  const invalidLineIndexes: number[] = [];
  lines.forEach((line, index) => {
    const parsed = parseRawBudgetValue(line);
    values.push(parsed);
    if (parsed === null) invalidLineIndexes.push(index);
  });
  return { values, invalidLineIndexes };
}
