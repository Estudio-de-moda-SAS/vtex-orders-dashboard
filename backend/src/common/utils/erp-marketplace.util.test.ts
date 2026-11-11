import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMarketplaceSummary, doctoReferenciaPrefix } from './erp-marketplace.util';

const close = (actual: number | null, expected: number) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) < 1e-6, `${actual} ≈ ${expected}`);
};

test('doctoReferenciaPrefix toma las letras iniciales', () => {
  assert.equal(doctoReferenciaPrefix('GVL1093638'), 'GVL');
  assert.equal(doctoReferenciaPrefix(' ddd1125359'), 'DDD');
  assert.equal(doctoReferenciaPrefix('SLR-500192'), 'SLR');
  assert.equal(doctoReferenciaPrefix('1120143'), null);
  assert.equal(doctoReferenciaPrefix(null), null);
});

test('comisión sobre el subtotal, utilidad = subtotal − comisión, sin costo (ejemplo Addi)', () => {
  const s = buildMarketplaceSummary([{ prefix: 'DDD', total: 5426620, subtotal: 4560185, invoices: 12 }], { Addi: 5482580 });
  const addi = s.rows.find((r) => r.prefix === 'DDD')!;
  close(addi.commission, 4560185 * 0.13);
  close(addi.utility, 4560185 * 0.87);
  close(addi.marginPercent, 87);
  assert.equal(addi.vtexSales, 5482580);
  assert.equal(addi.erpSales, 5426620);
  assert.equal(addi.invoices, 12);
});

test('total ponderado vs. promedio simple, y marketplaces sin venta fuera del simple', () => {
  const s = buildMarketplaceSummary(
    [
      { prefix: 'FFC', total: 0, subtotal: 100, invoices: 1 },
      { prefix: 'VPC', total: 0, subtotal: 900, invoices: 1 },
    ],
    {},
  );
  // FFC margen 59,15%, VPC 89%: simple = 74,075%; ponderado = (59,15 + 801) / 1000.
  close(s.total.simpleAverageMarginPercent, (59.15 + 89) / 2);
  close(s.total.marginPercent, ((100 * (1 - 0.4085) + 900 * 0.89) / 1000) * 100);
  assert.equal(s.total.marketplacesInSimpleAverage, 2);
  assert.equal(s.rows.find((r) => r.prefix === 'DTF')!.marginPercent, null);
});

test('prefijos fuera del cuadro (SLR) y ventas sin prefijo', () => {
  const s = buildMarketplaceSummary(
    [
      { prefix: 'SLR', total: 84, subtotal: 70, invoices: 2 },
      { prefix: null, total: 500, subtotal: 420, invoices: 9 },
      { prefix: 'GVL', total: 10, subtotal: 8, invoices: 1 },
    ],
    {},
  );
  assert.deepEqual(s.otherPrefixes, [{ prefix: 'SLR', erpSales: 84, erpSubtotal: 70, invoices: 2 }]);
  assert.equal(s.total.erpSales, 10);
});

test('commissionPercent sin error de punto flotante (40,85%)', () => {
  const s = buildMarketplaceSummary([], {});
  assert.equal(s.rows.find((r) => r.prefix === 'FFC')!.commissionPercent, 40.85);
});
