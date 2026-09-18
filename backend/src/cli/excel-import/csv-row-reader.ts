import { readFile } from 'fs/promises';

import { pickSafeRow, SafeRow } from './row-picker';

/**
 * Los 12 archivos reales de histórico son `.csv` delimitados por `;`
 * (exportados por VTEX/Excel con configuración regional latinoamericana)
 * — NO `.xlsx` como se asumió originalmente en la especificación. Traen
 * BOM UTF-8 al inicio, y AL MENOS UN caso confirmado de campo entre
 * comillas con un salto de línea real dentro (una nota con JSON
 * embebido) — por eso el parseo NO puede hacerse línea por línea con
 * `readline` (un lector así reconstruye mal esos registros multi-línea,
 * confirmado con datos reales). Se lee el archivo completo y se procesa
 * como una máquina de estados car a carácter (RFC4180), que sí reconoce
 * cuándo un salto de línea está DENTRO de un campo entre comillas.
 *
 * Aplica `pickSafeRow` a cada fila apenas se termina de reconstruir —
 * antes de cualquier otro procesamiento — para que las columnas
 * sensibles nunca existan en memoria más allá de esta función.
 */
export async function readSafeRowsFromCsv(filePath: string): Promise<SafeRow[]> {
  const raw = await readFile(filePath, 'utf8');
  const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows = parseCsv(content, ';');

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());

  const safeRows: SafeRow[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const values = rows[r];
    if (values.length === 1 && values[0].trim() === '') continue; // línea en blanco al final del archivo

    const rawRow: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) {
      if (headers[i]) rawRow[headers[i]] = values[i];
    }
    safeRows.push(pickSafeRow(rawRow));
  }

  return safeRows;
}

/**
 * Parser CSV completo compatible con RFC4180: procesa TODO el contenido
 * como una máquina de estados, carácter a carácter, para reconstruir
 * correctamente registros que traen un salto de línea real dentro de un
 * campo entre comillas (el caso real que rompía el parseo línea por
 * línea). `""` dentro de un campo entre comillas es una comilla escapada.
 */
function parseCsv(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const len = content.length;
  let i = 0;

  while (i < len) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
      i += 1;
    } else if (char === '\r') {
      i += 1; // el \n que sigue cierra la fila; un \r suelto se ignora
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }

  // Última fila si el archivo no termina con salto de línea.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
