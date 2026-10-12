import assert from 'node:assert/strict';
import test from 'node:test';

import { enumerateDayBuckets, subtractDaysUtc, todayColombia } from './date-range.util';
import { computeGaCoverage } from './ga-coverage.util';

test('computeGaCoverage: un día provisional (hoy) CON fila cuenta como cubierto en coverage, no como faltante', () => {
  const today = todayColombia();
  const startDay = subtractDaysUtc(today, 2);
  const allDays = enumerateDayBuckets(`${startDay}T00:00:00-05:00`, `${today}T23:59:59-05:00`); // 3 días: startDay, startDay+1, today
  const daysWithRows = [startDay, subtractDaysUtc(today, 1), today]; // los 3 días ya tienen fila, incluido hoy

  const result = computeGaCoverage(allDays, daysWithRows);
  assert.equal(result.coverage, 1); // 3/3 — hoy con fila SÍ cuenta como cubierto
  assert.ok(result.provisionalDays.includes(today));
});

test('computeGaCoverage: un día dentro de la ventana de hoy/ayer SIN fila no aparece como provisional (no es "faltante marcado", simplemente no está)', () => {
  const today = todayColombia();
  const yesterday = subtractDaysUtc(today, 1);
  const allDays = enumerateDayBuckets(`${yesterday}T00:00:00-05:00`, `${today}T23:59:59-05:00`);
  const daysWithRows = [yesterday]; // hoy todavía no se sincronizó

  const result = computeGaCoverage(allDays, daysWithRows);
  assert.equal(result.coverage, 0.5); // 1/2 — hoy SIN fila sí reduce la cobertura
  assert.deepEqual(result.provisionalDays, [yesterday]);
});

test('computeGaCoverage: un día viejo (fuera de la ventana de provisional) nunca se marca como provisional', () => {
  const allDays = ['2025-09-01', '2025-09-02'];
  const daysWithRows = ['2025-09-01', '2025-09-02'];
  const result = computeGaCoverage(allDays, daysWithRows);
  assert.equal(result.coverage, 1);
  assert.deepEqual(result.provisionalDays, []);
});
