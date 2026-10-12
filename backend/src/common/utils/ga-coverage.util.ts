import { subtractDaysUtc, todayColombia } from './date-range.util';

export interface GaCoverageResult {
  /** Días con fila en `ga_daily` ÷ días totales del rango — 0 a 1. */
  coverage: number;
  /** Días del rango que son hoy o ayer (calendario Colombia) Y YA tienen fila. */
  provisionalDays: string[];
}

/**
 * Mismo criterio EXACTO que `GaQueryService.getOverview` (no se modifica
 * ese archivo — esto es una reimplementación pura, testeable sin DB, para
 * que `/resumen` pueda reutilizar la misma regla sin depender de
 * `AnalyticsGaModule`): un día es "provisional" si es hoy o ayer
 * (calendario Colombia) Y ya tiene fila — un día de esa ventana SIN fila
 * simplemente no aparece, no se marca ausente de forma especial. Un día
 * provisional CUENTA como cubierto en `coverage`, igual que cualquier
 * otro día con fila — sin excepción.
 */
export function computeGaCoverage(allDaysInRange: string[], daysWithRows: string[]): GaCoverageResult {
  const provisionalCutoff = subtractDaysUtc(todayColombia(), 1);
  const provisionalDays = daysWithRows.filter((day) => day >= provisionalCutoff);
  const coverage = allDaysInRange.length > 0 ? daysWithRows.length / allDaysInRange.length : 0;
  return { coverage, provisionalDays };
}
