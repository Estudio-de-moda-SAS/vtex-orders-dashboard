/** Formatea un objeto Date como YYYY-MM-DD usando componentes locales (sin desfase UTC). */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Retorna el rango por defecto al abrir el dashboard: los últimos 7 días. */
export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);

  return {
    startDate: toDateInputValue(sevenDaysAgo),
    endDate: toDateInputValue(today),
  };
}

/** Rango por defecto para vistas que analizan tendencias del año en curso (ej. `/pilatos`): 1 de enero a hoy. */
export function getYearToDateRange(): { startDate: string; endDate: string } {
  const today = new Date();
  return {
    startDate: `${today.getFullYear()}-01-01`,
    endDate: toDateInputValue(today),
  };
}

/** Rango por defecto para vistas sin histórico (ej. `/smartsale`, que solo tiene datos desde que se empezó a capturar): hoy únicamente. */
export function getTodayRange(): { startDate: string; endDate: string } {
  const today = new Date();
  return { startDate: toDateInputValue(today), endDate: toDateInputValue(today) };
}

/** Formatea una fecha YYYY-MM-DD para mostrarla de forma legible, ej. "1 jun 2026". */
export function formatDisplayDate(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
