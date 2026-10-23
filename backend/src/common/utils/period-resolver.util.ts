import { dayCount, subtractDaysUtc } from './date-range.util';

/**
 * Traduce una frase de fecha en español (la que el modelo del asistente
 * extrae de la pregunta del usuario) a un rango `{startDay, endDay}`
 * determinista — el modelo NUNCA calcula la fecha por su cuenta, solo
 * identifica cuál de estas frases (o un rango explícito) pidió el
 * usuario. Vocabulario fijo a propósito: una frase fuera de esta lista
 * devuelve `null` en vez de adivinar, para que la herramienta pueda pedirle
 * al modelo que repregunte con un rango explícito.
 */
export interface ResolvedPeriod {
  startDay: string;
  endDay: string;
}

const EXPLICIT_RANGE_REGEX = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

export function resolvePeriodPhrase(phrase: string, todayDay: string): ResolvedPeriod | null {
  const normalized = phrase.trim().toLowerCase();

  const explicitMatch = normalized.match(EXPLICIT_RANGE_REGEX);
  if (explicitMatch) {
    const [, startDay, endDay] = explicitMatch;
    if (startDay > endDay) return null;
    return { startDay, endDay };
  }

  switch (normalized) {
    case 'hoy':
      return { startDay: todayDay, endDay: todayDay };
    case 'ayer': {
      const yesterday = subtractDaysUtc(todayDay, 1);
      return { startDay: yesterday, endDay: yesterday };
    }
    case 'esta semana':
      return { startDay: startOfWeek(todayDay), endDay: todayDay };
    case 'semana pasada': {
      const thisWeekStart = startOfWeek(todayDay);
      const lastWeekEnd = subtractDaysUtc(thisWeekStart, 1);
      const lastWeekStart = subtractDaysUtc(lastWeekEnd, 6);
      return { startDay: lastWeekStart, endDay: lastWeekEnd };
    }
    case 'este mes':
      return { startDay: startOfMonth(todayDay), endDay: todayDay };
    case 'mes pasado': {
      const thisMonthStart = startOfMonth(todayDay);
      const lastMonthEnd = subtractDaysUtc(thisMonthStart, 1);
      const lastMonthStart = startOfMonth(lastMonthEnd);
      return { startDay: lastMonthStart, endDay: lastMonthEnd };
    }
    case 'este año':
      return { startDay: startOfYear(todayDay), endDay: todayDay };
    case 'año pasado': {
      // Año calendario completo anterior (no un "a la fecha" parcial — el año pasado ya terminó).
      const lastYear = Number(todayDay.slice(0, 4)) - 1;
      return { startDay: `${lastYear}-01-01`, endDay: `${lastYear}-12-31` };
    }
    default:
      return null;
  }
}

function startOfWeek(day: string): string {
  // Lunes como inicio de semana. `getUTCDay()`: 0=domingo..6=sábado.
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isoDayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return subtractDaysUtc(day, isoDayOfWeek - 1);
}

function startOfMonth(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function startOfYear(day: string): string {
  const [y] = day.split('-').map(Number);
  return `${y}-01-01`;
}

/** Solo para los tests: expone el conteo de días usado por el resolver, sin duplicar la lógica de `date-range.util.ts`. */
export function resolvedPeriodDayCount(period: ResolvedPeriod): number {
  return dayCount(period.startDay, period.endDay);
}
