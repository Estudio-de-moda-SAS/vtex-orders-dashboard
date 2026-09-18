/**
 * Utilidades para convertir el rango de fechas seleccionado por el usuario
 * (en la zona horaria de Colombia, UTC-5, sin horario de verano) al formato
 * UTC que espera el filtro `f_creationDate` de VTEX.
 *
 * Este módulo evita que, por ejemplo, un usuario en Colombia seleccione
 * "1 de junio" y termine consultando parte del 31 de mayo o del 2 de junio
 * en UTC por una conversión de zona horaria incorrecta.
 *
 * IMPORTANTE: todo el concepto de "día" (bucket) usado para el caché
 * histórico (`toDayBucketColombia`, `enumerateDayBuckets`,
 * `dayBucketStartIso`, `dayBucketEndIso`, `todayColombia`) está basado en
 * el DÍA CALENDARIO DE COLOMBIA, no en el día calendario UTC. Si esto no
 * fuera consistente con `startOfDayColombiaToUtcIso`/
 * `endOfDayColombiaToUtcIso` (que es lo que usa `normalizeStartDate`/
 * `normalizeEndDate` para interpretar lo que pide el usuario), el caché
 * terminaría guardando/leyendo un rango de horas distinto al que el
 * usuario realmente pidió (hasta ~5 horas de diferencia en cada extremo),
 * y potencialmente un día de más o de menos en el rango total.
 */

/** Colombia no tiene horario de verano: siempre UTC-5. */
const COLOMBIA_UTC_OFFSET_HOURS = -5;
const COLOMBIA_OFFSET_MS = COLOMBIA_UTC_OFFSET_HOURS * 60 * 60 * 1000;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convierte una fecha (solo día, ej. "2026-06-01") al inicio de ese día
 * (00:00:00.000) en la zona horaria de Colombia, expresado como instante
 * UTC en formato ISO 8601 con sufijo Z.
 */
export function startOfDayColombiaToUtcIso(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  // 00:00:00 en UTC-5 equivale a 05:00:00 del mismo día en UTC.
  const utcMs = Date.UTC(year, month - 1, day, -COLOMBIA_UTC_OFFSET_HOURS, 0, 0, 0);
  return new Date(utcMs).toISOString();
}

/**
 * Convierte una fecha (solo día) al final de ese día (23:59:59.999) en la
 * zona horaria de Colombia, expresado como instante UTC.
 */
export function endOfDayColombiaToUtcIso(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const utcMs = Date.UTC(year, month - 1, day, 23 - COLOMBIA_UTC_OFFSET_HOURS, 59, 59, 999);
  return new Date(utcMs).toISOString();
}

/**
 * Normaliza el parámetro de fecha inicial recibido por query string.
 * - Si viene solo la fecha (YYYY-MM-DD), se interpreta como el inicio del
 *   día en la zona horaria de Colombia y se convierte a UTC.
 * - Si ya viene con hora/offset (ISO 8601 completo), se usa tal cual,
 *   respetando la intención explícita del cliente.
 */
export function normalizeStartDate(rawDate: string): string {
  if (DATE_ONLY_REGEX.test(rawDate)) {
    return startOfDayColombiaToUtcIso(rawDate);
  }
  return new Date(rawDate).toISOString();
}

/** Análogo a `normalizeStartDate` pero para el límite superior del rango. */
export function normalizeEndDate(rawDate: string): string {
  if (DATE_ONLY_REGEX.test(rawDate)) {
    return endOfDayColombiaToUtcIso(rawDate);
  }
  return new Date(rawDate).toISOString();
}

/** Formatea un instante ISO al formato exacto que espera `f_creationDate` de VTEX. */
export function toVtexDateFilterFormat(isoDate: string): string {
  // VTEX espera milisegundos con 3 dígitos y sufijo Z, igual a toISOString().
  return new Date(isoDate).toISOString();
}

/**
 * Retorna el punto medio (en tiempo) entre dos instantes ISO. Se usa para
 * partir un rango de fechas en dos mitades cuando la consulta a VTEX
 * necesitaría paginar demasiado profundo (ver `VtexOrdersService`).
 */
export function midpointIso(startIso: string, endIso: string): string {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const midMs = startMs + Math.floor((endMs - startMs) / 2);
  return new Date(midMs).toISOString();
}

/** Diferencia en milisegundos entre dos instantes ISO. */
export function diffMs(startIso: string, endIso: string): number {
  return new Date(endIso).getTime() - new Date(startIso).getTime();
}

/**
 * Convierte un instante ISO a su día CALENDARIO DE COLOMBIA (UTC-5),
 * formato YYYY-MM-DD. Usado como "bucket" para el caché histórico, de
 * forma consistente con cómo el resto de la aplicación interpreta las
 * fechas que pide el usuario (ver nota al inicio del archivo).
 */
export function toDayBucketColombia(isoDate: string): string {
  const shiftedMs = new Date(isoDate).getTime() + COLOMBIA_OFFSET_MS;
  return new Date(shiftedMs).toISOString().slice(0, 10);
}

/**
 * Enumera todos los días (YYYY-MM-DD, calendario Colombia) entre dos
 * instantes ISO, inclusive. `startIso`/`endIso` deben ser instantes ya
 * normalizados (ej. via `normalizeStartDate`/`normalizeEndDate`).
 */
export function enumerateDayBuckets(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const startDay = toDayBucketColombia(startIso);
  const endDay = toDayBucketColombia(endIso);

  const [sy, sm, sd] = startDay.split('-').map(Number);
  const [ey, em, ed] = endDay.split('-').map(Number);
  // Se itera con un objeto Date en UTC puro, usado únicamente como
  // "contador de días calendario" — no representa ningún instante real,
  // solo permite avanzar de un día calendario al siguiente de forma
  // segura sin preocuparse por horario de verano (Colombia no tiene).
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Instante ISO de inicio (00:00:00 Colombia) de un día YYYY-MM-DD (calendario Colombia). */
export function dayBucketStartIso(dayBucket: string): string {
  return startOfDayColombiaToUtcIso(dayBucket);
}

/** Instante ISO de fin (23:59:59.999 Colombia) de un día YYYY-MM-DD (calendario Colombia). */
export function dayBucketEndIso(dayBucket: string): string {
  return endOfDayColombiaToUtcIso(dayBucket);
}

/** Día de hoy en calendario de Colombia, formato YYYY-MM-DD. */
export function todayColombia(): string {
  return toDayBucketColombia(new Date().toISOString());
}

/** Resta días a un día YYYY-MM-DD (calendario Colombia) y retorna el resultado en el mismo formato. */
export function subtractDaysUtc(dayBucket: string, days: number): string {
  const [y, m, d] = dayBucket.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() - days);
  return cursor.toISOString().slice(0, 10);
}

/** Suma días a un día YYYY-MM-DD (calendario Colombia) y retorna el resultado en el mismo formato. */
export function addDaysUtc(dayBucket: string, days: number): string {
  return subtractDaysUtc(dayBucket, -days);
}

/**
 * Agrupa una lista ORDENADA de días (YYYY-MM-DD) en tramos contiguos (cada
 * día es exactamente el siguiente calendario del anterior). Usado por
 * `OrdersService.fillMissingDays`: si los días sin sincronizar de un rango
 * NO son consecutivos (ej. faltan el 5, el 6 y el 17, pero el 7-16 ya
 * existe en la base), traer todo el 5-17 de una sola consulta en vivo
 * volvería a descargar (y sumar por encima de lo que ya hay) el 7-16 — hay
 * que pedirle a VTEX cada tramo contiguo por separado.
 */
export function groupConsecutiveDayRuns(sortedDays: string[]): { start: string; end: string }[] {
  if (sortedDays.length === 0) return [];

  const runs: { start: string; end: string }[] = [];
  let runStart = sortedDays[0];
  let runEnd = sortedDays[0];

  for (let i = 1; i < sortedDays.length; i += 1) {
    const day = sortedDays[i];
    if (day === addDaysUtc(runEnd, 1)) {
      runEnd = day;
    } else {
      runs.push({ start: runStart, end: runEnd });
      runStart = day;
      runEnd = day;
    }
  }
  runs.push({ start: runStart, end: runEnd });
  return runs;
}
