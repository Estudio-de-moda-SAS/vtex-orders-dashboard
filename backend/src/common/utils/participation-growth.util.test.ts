import assert from 'node:assert/strict';
import test from 'node:test';

import { buildParticipationSeries, classifyParticipationGrowth, yearAgoMonthKey } from './participation-growth.util';

const THRESHOLDS = { greenMinPercent: 5, redMaxPercent: -5 };

test('classifyParticipationGrowth: verde/amarillo/rojo según los umbrales', () => {
  assert.equal(classifyParticipationGrowth(21, 20, true, THRESHOLDS).status, 'green'); // +5%
  assert.equal(classifyParticipationGrowth(20.5, 20, true, THRESHOLDS).status, 'yellow'); // +2.5%
  assert.equal(classifyParticipationGrowth(19, 20, true, THRESHOLDS).status, 'red'); // -5%
});

test('classifyParticipationGrowth: "new" solo en el debut real, "green" si ya tuvo participación antes', () => {
  assert.equal(classifyParticipationGrowth(10, 0, false, THRESHOLDS).status, 'new');
  assert.equal(classifyParticipationGrowth(10, 0, true, THRESHOLDS).status, 'green');
});

test('classifyParticipationGrowth: "no-data" sin mes anterior o con 0 contra 0', () => {
  assert.equal(classifyParticipationGrowth(10, null, false, THRESHOLDS).status, 'no-data');
  assert.equal(classifyParticipationGrowth(0, 0, false, THRESHOLDS).status, 'no-data');
});

test('yearAgoMonthKey: resta un año al mes "YYYY-MM"', () => {
  assert.equal(yearAgoMonthKey('2026-09'), '2025-09');
  assert.equal(yearAgoMonthKey('2026-01'), '2025-01');
});

test('buildParticipationSeries: vsYearAgo compara contra el MISMO MES un año antes, no el mes anterior del rango', () => {
  const points = [
    { month: '2026-09', total: 1000, breakdown: { Nequi: 300 } }, // 30%
    { month: '2026-10', total: 1000, breakdown: { Nequi: 400 } }, // 40%
  ];
  // El año anterior solo tiene datos para septiembre (ej. octubre 2025 no se sincronizó aún) — simula
  // "desde cuando tengamos datos": octubre debe salir con vsYearAgo = null.
  const totalByMonth = new Map([
    ['2026-09', 1000],
    ['2026-10', 1000],
    ['2025-09', 800],
  ]);
  const byMonth = new Map([
    ['2026-09', { Nequi: 300 }],
    ['2026-10', { Nequi: 400 }],
    ['2025-09', { Nequi: 160 }], // 20% en 2025-09
  ]);

  const [series] = buildParticipationSeries(['Nequi'], points, totalByMonth, byMonth, THRESHOLDS);

  // Septiembre 2026 (30%) vs. septiembre 2025 (20%) → creció.
  assert.ok(series.points[0].vsYearAgo !== null);
  assert.equal(series.points[0].vsYearAgo?.participationPercent, 20);
  assert.equal(series.points[0].vsYearAgo?.status, 'green');

  // Octubre 2026 no tiene referencia en 2025 → null, no se inventa un dato.
  assert.equal(series.points[1].vsYearAgo, null);

  // El semáforo "mes anterior" (growthPercent/status) sigue intacto, sin verse afectado por vsYearAgo:
  // septiembre es el primer punto del rango (no-data), octubre compara contra septiembre (30→40 = +33%).
  assert.equal(series.points[0].status, 'no-data');
  assert.equal(series.points[1].status, 'green');
});

test('buildParticipationSeries: vsYearAgo nunca usa "new" — una reactivación puntual contra el año pasado es "green", no "Nuevo"', () => {
  const points = [{ month: '2026-09', total: 1000, breakdown: { Addi: 500 } }]; // 50%
  const totalByMonth = new Map([
    ['2026-09', 1000],
    ['2025-09', 900],
  ]);
  const byMonth = new Map<string, Record<string, number>>([
    ['2026-09', { Addi: 500 }],
    ['2025-09', {}], // Addi no vendió nada ese mes el año pasado (0%)
  ]);

  const [series] = buildParticipationSeries(['Addi'], points, totalByMonth, byMonth, THRESHOLDS);
  assert.equal(series.points[0].vsYearAgo?.participationPercent, 0);
  assert.equal(series.points[0].vsYearAgo?.status, 'green');
});
