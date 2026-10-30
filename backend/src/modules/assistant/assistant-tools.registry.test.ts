import assert from 'node:assert/strict';
import { test } from 'node:test';

import { todayColombia } from '../../common/utils/date-range.util';
import { AssistantToolError } from './assistant-tool.error';
import { AssistantToolsRegistry } from './assistant-tools.registry';

/** Stubs mínimos — solo se prueba el dispatcher (validación + ruteo), no la lógica de cada servicio (ya cubierta por sus propios tests/CLI de humo). */
function buildRegistry(overrides: { getSalesBreakdown?: (...args: unknown[]) => unknown } = {}) {
  const salesService = {
    getSalesBreakdown: overrides.getSalesBreakdown ?? (async () => ({ ok: true })),
  } as any;
  const compareService = { comparePeriods: async () => ({ ok: true }) } as any;
  const budgetService = { getBudgetVsActual: async () => ({ ok: true }) } as any;
  const smartSaleBudgetService = { getSmartSaleBudgetVsActual: async () => ({ ok: true }) } as any;
  const creditNotesService = { getCreditNotes: async () => ({ ok: true }) } as any;
  const syncStatusService = { getSyncStatus: async () => ({ ok: true }) } as any;
  const smartSaleService = { getSmartSaleSales: async () => ({ ok: true }) } as any;
  const diagnosisService = { getDiagnosis: async () => ({ ok: true }) } as any;
  const analyticsService = { getAnalyticsBreakdown: async () => ({ ok: true }) } as any;
  const campaignSearchService = { searchCampaigns: async () => ({ ok: true }) } as any;
  return new AssistantToolsRegistry(
    salesService,
    compareService,
    budgetService,
    smartSaleBudgetService,
    creditNotesService,
    syncStatusService,
    smartSaleService,
    diagnosisService,
    analyticsService,
    campaignSearchService,
  );
}

test('resolve_period: frase reconocida devuelve un rango', async () => {
  const registry = buildRegistry();
  const result = (await registry.execute('resolve_period', { phrase: 'hoy' })) as { startDay: string; endDay: string };
  assert.equal(result.startDay, todayColombia());
  assert.equal(result.endDay, todayColombia());
});

test('resolve_period: frase no reconocida lanza AssistantToolError, no inventa una fecha', async () => {
  const registry = buildRegistry();
  await assert.rejects(() => registry.execute('resolve_period', { phrase: 'la quincena' }), AssistantToolError);
});

test('get_sales: storeId inválido lanza AssistantToolError antes de llamar al servicio', async () => {
  let called = false;
  const registry = buildRegistry({
    getSalesBreakdown: async () => {
      called = true;
      return {};
    },
  });
  await assert.rejects(
    () => registry.execute('get_sales', { storeId: 'no-existe', startDay: '2026-10-01', endDay: '2026-10-10', breakdown: 'status' }),
    AssistantToolError,
  );
  assert.equal(called, false);
});

test('get_sales: input válido delega al servicio con los argumentos correctos', async () => {
  let received: unknown[] = [];
  const registry = buildRegistry({
    getSalesBreakdown: async (...args: unknown[]) => {
      received = args;
      return { totalSales: 100 };
    },
  });
  const result = await registry.execute('get_sales', { storeId: 'pilatos', startDay: '2026-10-01', endDay: '2026-10-10', breakdown: 'status' });
  assert.deepEqual(received, ['pilatos', '2026-10-01', '2026-10-10', 'status']);
  assert.deepEqual(result, { totalSales: 100 });
});

test('herramienta desconocida lanza AssistantToolError', async () => {
  const registry = buildRegistry();
  await assert.rejects(() => registry.execute('no_existe', {}), AssistantToolError);
});

test('get_sync_status: no requiere input', async () => {
  const registry = buildRegistry();
  const result = await registry.execute('get_sync_status', {});
  assert.deepEqual(result, { ok: true });
});

test('get_smartsale_sales: storeId y periodB son opcionales', async () => {
  let received: unknown[] = [];
  const registry = new AssistantToolsRegistry(
    { getSalesBreakdown: async () => ({}) } as any,
    { comparePeriods: async () => ({}) } as any,
    { getBudgetVsActual: async () => ({}) } as any,
    { getSmartSaleBudgetVsActual: async () => ({}) } as any,
    { getCreditNotes: async () => ({}) } as any,
    { getSyncStatus: async () => ({}) } as any,
    { getSmartSaleSales: async (...args: unknown[]) => { received = args; return { periodA: { totalSales: 500 } }; } } as any,
    { getDiagnosis: async () => ({}) } as any,
    { getAnalyticsBreakdown: async () => ({}) } as any,
    { searchCampaigns: async () => ({}) } as any,
  );
  const result = await registry.execute('get_smartsale_sales', { periodA: { startDay: '2026-10-01', endDay: '2026-10-10' } });
  // `plainToInstance` convierte el objeto anidado en una instancia de `PeriodInputDto` (no un objeto
  // plano) — comparar vía JSON descarta el prototipo y deja solo los valores, que es lo que importa acá.
  // `JSON.stringify` convierte `undefined` en `null` dentro de un arreglo — es lo esperado acá, no un objeto vacío.
  assert.deepEqual(JSON.parse(JSON.stringify(received)), [{ startDay: '2026-10-01', endDay: '2026-10-10' }, null, null]);
  assert.deepEqual(result, { periodA: { totalSales: 500 } });
});

test('get_smartsale_sales: con periodB, delega al servicio con los dos períodos', async () => {
  let received: unknown[] = [];
  const registry = new AssistantToolsRegistry(
    { getSalesBreakdown: async () => ({}) } as any,
    { comparePeriods: async () => ({}) } as any,
    { getBudgetVsActual: async () => ({}) } as any,
    { getSmartSaleBudgetVsActual: async () => ({}) } as any,
    { getCreditNotes: async () => ({}) } as any,
    { getSyncStatus: async () => ({}) } as any,
    { getSmartSaleSales: async (...args: unknown[]) => { received = args; return {}; } } as any,
    { getDiagnosis: async () => ({}) } as any,
    { getAnalyticsBreakdown: async () => ({}) } as any,
    { searchCampaigns: async () => ({}) } as any,
  );
  await registry.execute('get_smartsale_sales', {
    periodA: { startDay: '2026-10-01', endDay: '2026-10-10' },
    periodB: { startDay: '2026-09-01', endDay: '2026-09-10' },
    storeId: 'pilatos',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(received)), [
    { startDay: '2026-10-01', endDay: '2026-10-10' },
    { startDay: '2026-09-01', endDay: '2026-09-10' },
    'pilatos',
  ]);
});

test('get_smartsale_sales: storeId inválido lanza AssistantToolError', async () => {
  const registry = buildRegistry();
  await assert.rejects(
    () => registry.execute('get_smartsale_sales', { periodA: { startDay: '2026-10-01', endDay: '2026-10-10' }, storeId: 'no-existe' }),
    AssistantToolError,
  );
});

test('get_diagnosis: input válido delega al servicio con storeId/periodA/periodB', async () => {
  let received: unknown[] = [];
  const registry = new AssistantToolsRegistry(
    { getSalesBreakdown: async () => ({}) } as any,
    { comparePeriods: async () => ({}) } as any,
    { getBudgetVsActual: async () => ({}) } as any,
    { getSmartSaleBudgetVsActual: async () => ({}) } as any,
    { getCreditNotes: async () => ({}) } as any,
    { getSyncStatus: async () => ({}) } as any,
    { getSmartSaleSales: async () => ({}) } as any,
    { getDiagnosis: async (...args: unknown[]) => { received = args; return { color: 'verde' }; } } as any,
    { getAnalyticsBreakdown: async () => ({}) } as any,
    { searchCampaigns: async () => ({}) } as any,
  );
  const result = await registry.execute('get_diagnosis', {
    storeId: 'pilatos',
    periodA: { startDay: '2026-10-01', endDay: '2026-10-10' },
    periodB: { startDay: '2026-09-01', endDay: '2026-09-10' },
  });
  // `plainToInstance` convierte los objetos anidados en instancias de `PeriodInputDto` (no objetos
  // planos) — comparar vía JSON descarta el prototipo y deja solo los valores, que es lo que importa acá.
  assert.deepEqual(JSON.parse(JSON.stringify(received)), [
    'pilatos',
    { startDay: '2026-10-01', endDay: '2026-10-10' },
    { startDay: '2026-09-01', endDay: '2026-09-10' },
  ]);
  assert.deepEqual(result, { color: 'verde' });
});

test('get_diagnosis: storeId inválido lanza AssistantToolError antes de llamar al servicio', async () => {
  const registry = buildRegistry();
  await assert.rejects(
    () =>
      registry.execute('get_diagnosis', {
        storeId: 'no-existe',
        periodA: { startDay: '2026-10-01', endDay: '2026-10-10' },
        periodB: { startDay: '2026-09-01', endDay: '2026-09-10' },
      }),
    AssistantToolError,
  );
});

test('get_analytics: input válido delega al servicio con los 4 argumentos', async () => {
  let received: unknown[] = [];
  const registry = new AssistantToolsRegistry(
    { getSalesBreakdown: async () => ({}) } as any,
    { comparePeriods: async () => ({}) } as any,
    { getBudgetVsActual: async () => ({}) } as any,
    { getSmartSaleBudgetVsActual: async () => ({}) } as any,
    { getCreditNotes: async () => ({}) } as any,
    { getSyncStatus: async () => ({}) } as any,
    { getSmartSaleSales: async () => ({}) } as any,
    { getDiagnosis: async () => ({}) } as any,
    { getAnalyticsBreakdown: async (...args: unknown[]) => { received = args; return { rows: [] }; } } as any,
    { searchCampaigns: async () => ({}) } as any,
  );
  const result = await registry.execute('get_analytics', { storeId: 'pilatos', startDay: '2026-10-01', endDay: '2026-10-10', breakdown: 'channel' });
  assert.deepEqual(received, ['pilatos', '2026-10-01', '2026-10-10', 'channel']);
  assert.deepEqual(result, { rows: [] });
});

test('get_analytics: breakdown inválido lanza AssistantToolError', async () => {
  const registry = buildRegistry();
  await assert.rejects(
    () => registry.execute('get_analytics', { storeId: 'pilatos', startDay: '2026-10-01', endDay: '2026-10-10', breakdown: 'no-existe' }),
    AssistantToolError,
  );
});

test('get_smartsale_budget_vs_actual: input válido delega al servicio con startDay/endDay, sin storeId', async () => {
  let received: unknown[] = [];
  const registry = new AssistantToolsRegistry(
    { getSalesBreakdown: async () => ({}) } as any,
    { comparePeriods: async () => ({}) } as any,
    { getBudgetVsActual: async () => ({}) } as any,
    { getSmartSaleBudgetVsActual: async (...args: unknown[]) => { received = args; return { rangeBudget: 1000 }; } } as any,
    { getCreditNotes: async () => ({}) } as any,
    { getSyncStatus: async () => ({}) } as any,
    { getSmartSaleSales: async () => ({}) } as any,
    { getDiagnosis: async () => ({}) } as any,
    { getAnalyticsBreakdown: async () => ({}) } as any,
    { searchCampaigns: async () => ({}) } as any,
  );
  const result = await registry.execute('get_smartsale_budget_vs_actual', { startDay: '2026-10-01', endDay: '2026-10-10' });
  assert.deepEqual(received, ['2026-10-01', '2026-10-10']);
  assert.deepEqual(result, { rangeBudget: 1000 });
});

test('get_smartsale_budget_vs_actual: startDay con formato inválido lanza AssistantToolError', async () => {
  const registry = buildRegistry();
  await assert.rejects(
    () => registry.execute('get_smartsale_budget_vs_actual', { startDay: '01-10-2026', endDay: '2026-10-10' }),
    AssistantToolError,
  );
});

test('search_campaign: input válido delega al servicio con los 4 argumentos', async () => {
  let received: unknown[] = [];
  const registry = new AssistantToolsRegistry(
    { getSalesBreakdown: async () => ({}) } as any,
    { comparePeriods: async () => ({}) } as any,
    { getBudgetVsActual: async () => ({}) } as any,
    { getSmartSaleBudgetVsActual: async () => ({}) } as any,
    { getCreditNotes: async () => ({}) } as any,
    { getSyncStatus: async () => ({}) } as any,
    { getSmartSaleSales: async () => ({}) } as any,
    { getDiagnosis: async () => ({}) } as any,
    { getAnalyticsBreakdown: async () => ({}) } as any,
    { searchCampaigns: async (...args: unknown[]) => { received = args; return { vtexCampaigns: {}, gaCampaigns: {} }; } } as any,
  );
  const result = await registry.execute('search_campaign', { query: 'bazar', startDay: '2026-10-01', endDay: '2026-10-10' });
  assert.deepEqual(received, ['bazar', '2026-10-01', '2026-10-10', undefined]);
  assert.deepEqual(result, { vtexCampaigns: {}, gaCampaigns: {} });
});

test('search_campaign: query vacío lanza AssistantToolError', async () => {
  const registry = buildRegistry();
  await assert.rejects(
    () => registry.execute('search_campaign', { query: '', startDay: '2026-10-01', endDay: '2026-10-10' }),
    AssistantToolError,
  );
});
