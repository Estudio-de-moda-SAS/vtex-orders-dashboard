import assert from 'node:assert/strict';
import test from 'node:test';

import { safeDivide, safePercentChange } from './safe-math.util';

test('safeDivide: división normal', () => {
  assert.equal(safeDivide(10, 2), 5);
});

test('safeDivide: null si el denominador es 0 (nunca Infinity/NaN)', () => {
  assert.equal(safeDivide(10, 0), null);
});

test('safeDivide: null si falta cualquiera de los dos valores', () => {
  assert.equal(safeDivide(null, 10), null);
  assert.equal(safeDivide(10, null), null);
  assert.equal(safeDivide(undefined, 10), null);
});

test('safePercentChange: % de cambio normal', () => {
  assert.ok(Math.abs((safePercentChange(120, 100) ?? NaN) - 20) < 1e-9);
  assert.ok(Math.abs((safePercentChange(80, 100) ?? NaN) - -20) < 1e-9);
});

test('safePercentChange: null (NUNCA -100%) cuando falta el período anterior', () => {
  assert.equal(safePercentChange(100, null), null);
  assert.equal(safePercentChange(null, 100), null);
  assert.equal(safePercentChange(100, 0), null);
});
