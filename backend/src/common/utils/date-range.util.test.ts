import assert from 'node:assert/strict';
import test from 'node:test';

import { dayCount, previousPeriodOfEqualDuration, sameRangeLastYear } from './date-range.util';

test('dayCount: cuenta días INCLUSIVE (mismo día → 1)', () => {
  assert.equal(dayCount('2026-10-01', '2026-10-01'), 1);
  assert.equal(dayCount('2026-10-01', '2026-10-10'), 10);
});

test('previousPeriodOfEqualDuration: termina el día antes de A y tiene la misma duración', () => {
  const result = previousPeriodOfEqualDuration('2026-10-01', '2026-10-10');
  assert.deepEqual(result, { startDay: '2026-09-21', endDay: '2026-09-30' });
  assert.equal(dayCount(result.startDay, result.endDay), 10);
});

test('previousPeriodOfEqualDuration: funciona con un rango de un solo día', () => {
  assert.deepEqual(previousPeriodOfEqualDuration('2026-10-10', '2026-10-10'), { startDay: '2026-10-09', endDay: '2026-10-09' });
});

test('sameRangeLastYear: resta un año calendario a ambos extremos', () => {
  assert.deepEqual(sameRangeLastYear('2026-10-01', '2026-10-10'), { startDay: '2025-10-01', endDay: '2025-10-10' });
});
