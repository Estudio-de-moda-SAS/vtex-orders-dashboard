import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMarginSummary, MarginInputRow } from './erp-margin.util';

const close = (actual: number | null, expected: number) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) < 1e-9, `${actual} ≈ ${expected}`);
};

test('ejemplo de la explicación: tienda A 50%, tienda B 10% → simple 30%, ponderado 46,4%', () => {
  const rows: MarginInputRow[] = [
    { storeId: 'a', lineKind: 'product', subtotal: 100, cost: 50 },
    { storeId: 'b', lineKind: 'product', subtotal: 10, cost: 9 },
  ];
  const m = buildMarginSummary(rows, ['a', 'b']);
  close(m.byStore[0].marginPercent, 50);
  close(m.byStore[1].marginPercent, 10);
  close(m.channel.simpleAverageMarginPercent, 30);
  close(m.channel.marginPercent, (51 / 110) * 100);
  assert.equal(m.channel.utility, 51);
  assert.equal(m.channel.storesInSimpleAverage, 2);
});

test('una marca sin venta no entra al promedio simple (no es 0%)', () => {
  const m = buildMarginSummary([{ storeId: 'a', lineKind: 'product', subtotal: 100, cost: 40 }], ['a', 'b']);
  assert.equal(m.byStore[1].marginPercent, null);
  close(m.channel.simpleAverageMarginPercent, 60);
  assert.equal(m.channel.storesInSimpleAverage, 1);
});

test('fletes y empaque NO entran al margen (solo productos) y se reportan aparte', () => {
  const rows: MarginInputRow[] = [
    { storeId: 'a', lineKind: 'product', subtotal: 1000, cost: 500 },
    { storeId: 'a', lineKind: 'freight', subtotal: 50, cost: 0 },
    { storeId: 'a', lineKind: 'packaging', subtotal: 0, cost: 10 },
    { storeId: 'a', lineKind: 'advertising', subtotal: 0, cost: 7 },
  ];
  const m = buildMarginSummary(rows, ['a']);
  assert.equal(m.channel.subtotal, 1000);
  assert.equal(m.channel.cost, 500);
  assert.equal(m.channel.utility, 500);
  assert.equal(m.channel.marginPercent, 50);
  assert.equal(m.byStore[0].subtotal, 1000);
  assert.deepEqual(m.freight, { subtotal: 50, cost: 0, utility: 50 });
  assert.deepEqual(m.packaging, { subtotal: 0, cost: 10, utility: -10 });
});

test('sin ventas: márgenes en null', () => {
  const m = buildMarginSummary([], ['a']);
  assert.equal(m.channel.marginPercent, null);
  assert.equal(m.channel.simpleAverageMarginPercent, null);
});
