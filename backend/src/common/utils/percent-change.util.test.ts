import assert from 'node:assert/strict';
import { test } from 'node:test';

import { percentChange } from './percent-change.util';

test('percentChange: aumento', () => {
  assert.equal(percentChange(100, 120), 20);
});

test('percentChange: disminución', () => {
  assert.equal(percentChange(200, 150), -25);
});

test('percentChange: previous en 0 devuelve null, no Infinity', () => {
  assert.equal(percentChange(0, 50), null);
});

test('percentChange: sin cambio es 0', () => {
  assert.equal(percentChange(80, 80), 0);
});
