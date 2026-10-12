import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoryWindowRanges,
  classifySemaphore,
  computeMinOrdersThreshold,
  computeRobustSigma,
  computeStoreThresholds,
  filterWindowsFromEarliestDate,
} from './resumen-semaphore.util';

test('buildHistoryWindowRanges: la ventana 0 es EXACTA a B — A nunca entra en el cálculo de su propio umbral (la función ni siquiera recibe las fechas de A)', () => {
  const windows = buildHistoryWindowRanges('2026-09-21', '2026-09-30', 3);
  assert.deepEqual(windows[0], { startDay: '2026-09-21', endDay: '2026-09-30' });
});

test('buildHistoryWindowRanges: ventanas consecutivas, sin solaparse, misma duración, hacia atrás', () => {
  const windows = buildHistoryWindowRanges('2026-09-21', '2026-09-30', 3);
  assert.deepEqual(windows, [
    { startDay: '2026-09-21', endDay: '2026-09-30' },
    { startDay: '2026-09-11', endDay: '2026-09-20' },
    { startDay: '2026-09-01', endDay: '2026-09-10' },
  ]);
});

test('computeRobustSigma: MAD escalada (1,4826×mediana de desviaciones absolutas), no desviación estándar clásica', () => {
  // mediana([0,0,0,20,20,20]) = 10; desviaciones absolutas = [10,10,10,10,10,10]; mediana = 10.
  const sigma = computeRobustSigma([0, 0, 0, 20, 20, 20]);
  assert.ok(Math.abs(sigma - 1.4826 * 10) < 1e-6);
});

test('computeStoreThresholds: con sigma alto, los límites se ENSANCHAN más allá del piso por defecto', () => {
  // 7 ventanas (índice 0 = B más reciente) → 6 cambios: [0,0,0,20,20,20] (mismo dataset que el test de computeRobustSigma, sigma ≈ 14,826).
  const windowSales = [1728, 1728, 1728, 1728, 1440, 1200, 1000];
  const result = computeStoreThresholds(windowSales, { floorRedPercent: 5, floorGreenPercent: 10, k: 1.5, minHistoryChanges: 6 });
  assert.equal(result.source, 'historial propio');
  assert.ok(result.sigma !== null && Math.abs(result.sigma - 14.826) < 0.01);
  assert.ok(Math.abs(result.redLimit - -22.239) < 0.01); // -max(5, 1.5×14.826)
  assert.ok(Math.abs(result.greenLimit - 22.239) < 0.01);
});

test('computeStoreThresholds: con menos de MIN_HISTORY_CHANGES cambios, cae a los valores por defecto (piso rojo/verde, sin sigma)', () => {
  // 5 ventanas → 4 cambios, menos que minHistoryChanges=6.
  const windowSales = [100, 110, 120, 130, 140];
  const result = computeStoreThresholds(windowSales, { floorRedPercent: 5, floorGreenPercent: 10, k: 1.5, minHistoryChanges: 6 });
  assert.equal(result.source, 'valores por defecto');
  assert.equal(result.sigma, null);
  assert.equal(result.redLimit, -5);
  assert.equal(result.greenLimit, 10);
});

test('computeStoreThresholds: excluye ventanas sin ventas (null o 0) ANTES de calcular cambios', () => {
  const windowSales = [100, null, 110, 0, 120, 130, 140];
  const result = computeStoreThresholds(windowSales, { floorRedPercent: 5, floorGreenPercent: 10, k: 1.5, minHistoryChanges: 6 });
  // 5 ventanas sobreviven (100,110,120,130,140) → solo 4 cambios, menos que 6 → valores por defecto.
  assert.equal(result.windowCount, 5);
  assert.equal(result.source, 'valores por defecto');
});

test('classifySemaphore: verde cuando la variación supera greenLimit', () => {
  const result = classifySemaphore({ salesChangePercent: 12, salesB: 1000, redLimit: -5, greenLimit: 10, purchasesA: 200, purchasesB: 200, minPurchases: 100 });
  assert.deepEqual(result, { color: 'verde' });
});

test('classifySemaphore: rojo cuando la variación es menor que redLimit', () => {
  const result = classifySemaphore({ salesChangePercent: -6, salesB: 1000, redLimit: -5, greenLimit: 10, purchasesA: 200, purchasesB: 200, minPurchases: 100 });
  assert.deepEqual(result, { color: 'rojo' });
});

test('classifySemaphore: amarillo entre los dos límites', () => {
  const result = classifySemaphore({ salesChangePercent: 0, salesB: 1000, redLimit: -5, greenLimit: 10, purchasesA: 200, purchasesB: 200, minPurchases: 100 });
  assert.deepEqual(result, { color: 'amarillo' });
});

test('classifySemaphore: gris por volumen mínimo (compras reales) — nunca inventa un color', () => {
  const result = classifySemaphore({ salesChangePercent: 50, salesB: 1000, redLimit: -5, greenLimit: 10, purchasesA: 50, purchasesB: 200, minPurchases: 100 });
  assert.equal(result.color, 'gris');
  assert.ok(result.grayReason?.includes('compras reales'));
});

test('classifySemaphore: gris por volumen mínimo usando órdenes contabilizadas como respaldo, lo indica en el motivo', () => {
  const result = classifySemaphore({
    salesChangePercent: 50,
    salesB: 1000,
    redLimit: -5,
    greenLimit: 10,
    purchasesA: 50,
    purchasesB: 200,
    minPurchases: 100,
    volumeIsOrdersFallback: true,
  });
  assert.equal(result.color, 'gris');
  assert.ok(result.grayReason?.includes('órdenes contabilizadas'));
});

test('classifySemaphore: gris (nunca -100%) cuando falta la variación de ventas por falta de datos', () => {
  const result = classifySemaphore({ salesChangePercent: null, salesB: null, redLimit: -5, greenLimit: 10, purchasesA: null, purchasesB: null, minPurchases: 100 });
  assert.equal(result.color, 'gris');
  assert.ok(result.grayReason);
});

test('classifySemaphore: gris cuando el período anterior (B) tuvo ventas en cero — no hay base para la variación', () => {
  const result = classifySemaphore({ salesChangePercent: 999, salesB: 0, redLimit: -5, greenLimit: 10, purchasesA: 200, purchasesB: 200, minPurchases: 100 });
  assert.equal(result.color, 'gris');
});

const MIN_ORDERS_CONFIG = { minOrdersFloor: 10, minOrdersDefault: 30, minOrdersRelativeFraction: 0.3, minHistoryWindowsForOrders: 3 };

test('computeMinOrdersThreshold: con suficiente historial, el mínimo es relativo a la MEDIANA propia de la tienda (30%), nunca un número fijo', () => {
  // mediana([100,100,100,120,80]) = 100 → mínimo = max(10, 0.3×100) = 30.
  const result = computeMinOrdersThreshold([100, 100, 100, 120, 80], MIN_ORDERS_CONFIG);
  assert.equal(result.source, 'historial propio');
  assert.equal(result.medianOrders, 100);
  assert.equal(result.minOrders, 30);
  assert.equal(result.windowCount, 5);
});

test('computeMinOrdersThreshold: una tienda chica (mediana baja) nunca pide menos que el piso absoluto', () => {
  // mediana([10,12,8,11,9]) = 10 → relativo = 0.3×10 = 3, pero el piso absoluto es 10.
  const result = computeMinOrdersThreshold([10, 12, 8, 11, 9], MIN_ORDERS_CONFIG);
  assert.equal(result.source, 'historial propio');
  assert.equal(result.minOrders, 10);
});

test('computeMinOrdersThreshold: una tienda grande exige un mínimo mucho más alto que una chica (mismo criterio, distinto resultado)', () => {
  const small = computeMinOrdersThreshold([50, 50, 50, 50, 50], MIN_ORDERS_CONFIG);
  const big = computeMinOrdersThreshold([5000, 5000, 5000, 5000, 5000], MIN_ORDERS_CONFIG);
  assert.equal(small.minOrders, 15);
  assert.equal(big.minOrders, 1500);
  assert.ok(big.minOrders > small.minOrders);
});

test('computeMinOrdersThreshold: con menos ventanas que minHistoryWindowsForOrders, cae al valor por defecto', () => {
  const result = computeMinOrdersThreshold([100, 120], MIN_ORDERS_CONFIG);
  assert.equal(result.source, 'valores por defecto');
  assert.equal(result.medianOrders, null);
  assert.equal(result.minOrders, 30);
});

test('computeMinOrdersThreshold: excluye ventanas sin órdenes (null o 0) antes de contar cuántas sobrevivieron — con suficientes sobrevivientes, igual usa el historial propio', () => {
  // Sobreviven [100,110,120] (null y 0 se descartan) → 3 ventanas, justo el mínimo exigido.
  const result = computeMinOrdersThreshold([100, null, 0, 110, 120], MIN_ORDERS_CONFIG);
  assert.equal(result.windowCount, 3);
  assert.equal(result.source, 'historial propio');
  assert.equal(result.medianOrders, 110);
});

test('computeMinOrdersThreshold: si tras excluir null/0 quedan menos ventanas que el mínimo exigido, cae al valor por defecto', () => {
  // Sobreviven [100,110] → solo 2, menos que minHistoryWindowsForOrders=3.
  const result = computeMinOrdersThreshold([100, null, 0, 110], MIN_ORDERS_CONFIG);
  assert.equal(result.windowCount, 2);
  assert.equal(result.source, 'valores por defecto');
  assert.equal(result.minOrders, 30);
});

test('filterWindowsFromEarliestDate: descarta ventanas que empiezan ANTES del primer día con datos reales — no solo las que quedan en 0', () => {
  const windows = [
    { startDay: '2026-09-01', endDay: '2026-09-30' }, // ventana 0 = B
    { startDay: '2026-08-02', endDay: '2026-08-31' },
    { startDay: '2026-07-03', endDay: '2026-08-01' }, // cruza el inicio del historial (2026-07-15) → cobertura parcial, se descarta
    { startDay: '2026-06-03', endDay: '2026-07-02' }, // totalmente antes del historial → se descarta
  ];
  const result = filterWindowsFromEarliestDate(windows, '2026-07-15');
  assert.deepEqual(result, [windows[0], windows[1]]);
});

test('filterWindowsFromEarliestDate: sin fecha de inicio conocida (tienda sin datos todavía), no descarta nada', () => {
  const windows = [{ startDay: '2026-09-01', endDay: '2026-09-30' }];
  assert.deepEqual(filterWindowsFromEarliestDate(windows, undefined), windows);
});
