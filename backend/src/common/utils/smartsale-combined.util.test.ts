import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCombinedMonthlyTrend, buildErpCoverageNote, combinedCategoryKey, stripErpCategoryCode } from './smartsale-combined.util';

test('stripErpCategoryCode quita el código del ERP y deja el texto de POS', () => {
  assert.equal(stripErpCategoryCode('101B - CAMISETA M/C'), 'CAMISETA M/C');
  assert.equal(stripErpCategoryCode('208 - TENIS'), 'TENIS');
  assert.equal(stripErpCategoryCode('406A - RELOJ DIGITAL'), 'RELOJ DIGITAL');
  assert.equal(stripErpCategoryCode('TENIS'), 'TENIS');
  assert.equal(stripErpCategoryCode('  CAMISETA M/C '), 'CAMISETA M/C');
});

test('combinedCategoryKey hace coincidir POS y ERP', () => {
  assert.equal(combinedCategoryKey('101B - CAMISETA M/C'), combinedCategoryKey('CAMISETA M/C'));
  assert.equal(combinedCategoryKey('208 - tenis'), combinedCategoryKey('TENIS'));
  assert.equal(combinedCategoryKey('CHAQUETA  CASUAL'), 'CHAQUETA CASUAL');
});

const classify = (current: number, prior: number | null) =>
  prior === null || prior === 0
    ? { growthPercent: null, status: 'no-data' as const }
    : { growthPercent: ((current - prior) / prior) * 100, status: 'green' as const };

test('buildCombinedMonthlyTrend: sin % de crecimiento hasta tener dos meses con ERP', () => {
  const pos = [
    { month: '2026-09', orders: 10, sales: 1000 },
    { month: '2026-10', orders: 12, sales: 1200 },
    { month: '2026-11', orders: 5, sales: 500 },
    { month: '2026-12', orders: 6, sales: 600 },
  ];
  const erp = [
    { month: '2026-11', orders: 20, sales: 9000 },
    { month: '2026-12', orders: 22, sales: 9900 },
  ];
  const trend = buildCombinedMonthlyTrend(pos, erp, '2026-11', classify);

  assert.deepEqual(
    trend.map((p) => [p.month, p.sales, p.orders, p.erpAvailable, p.growthPercent, p.status]),
    [
      ['2026-09', 1000, 10, false, null, 'no-data'],
      ['2026-10', 1200, 12, false, null, 'no-data'],
      // Noviembre es el primer mes con ERP: NO se compara contra octubre (solo POS).
      ['2026-11', 9500, 25, true, null, 'no-data'],
      ['2026-12', 10500, 28, true, (10500 - 9500) / 9500 * 100, 'green'],
    ],
  );
  assert.equal(trend[2].posSales, 500);
  assert.equal(trend[2].erpSales, 9000);
});

test('buildCombinedMonthlyTrend: sin ERP sincronizado, ningún mes es comparable', () => {
  const trend = buildCombinedMonthlyTrend([{ month: '2026-10', orders: 1, sales: 10 }], [], null, classify);
  assert.equal(trend.length, 1);
  assert.equal(trend[0].erpAvailable, false);
  assert.equal(trend[0].growthPercent, null);
});

test('buildCombinedMonthlyTrend: un mes con ERP pero sin POS igual aparece', () => {
  const trend = buildCombinedMonthlyTrend([], [{ month: '2026-11', orders: 3, sales: 300 }], '2026-11', classify);
  assert.deepEqual(trend.map((p) => [p.month, p.posSales, p.erpSales]), [['2026-11', 0, 300]]);
});

test('buildErpCoverageNote avisa cuando un período empieza antes del ERP', () => {
  assert.equal(buildErpCoverageNote('2026-11-01', ['2026-11-01']), null);
  assert.equal(buildErpCoverageNote('2026-11-01', ['2026-11-05', '2026-11-02']), null);
  assert.match(buildErpCoverageNote('2026-11-01', ['2026-11-05', '2026-10-01'])!, /desde el 2026-11-01/);
  assert.match(buildErpCoverageNote(null, ['2026-11-01'])!, /solo de POS/);
});
