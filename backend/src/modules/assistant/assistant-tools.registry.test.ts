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
  const creditNotesService = { getCreditNotes: async () => ({ ok: true }) } as any;
  const syncStatusService = { getSyncStatus: async () => ({ ok: true }) } as any;
  const smartSaleService = { getSmartSaleSales: async () => ({ ok: true }) } as any;
  return new AssistantToolsRegistry(salesService, compareService, budgetService, creditNotesService, syncStatusService, smartSaleService);
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

test('get_smartsale_sales: storeId es opcional', async () => {
  let received: unknown[] = [];
  const registry = new AssistantToolsRegistry(
    { getSalesBreakdown: async () => ({}) } as any,
    { comparePeriods: async () => ({}) } as any,
    { getBudgetVsActual: async () => ({}) } as any,
    { getCreditNotes: async () => ({}) } as any,
    { getSyncStatus: async () => ({}) } as any,
    { getSmartSaleSales: async (...args: unknown[]) => { received = args; return { totalSmartSaleSales: 500 }; } } as any,
  );
  const result = await registry.execute('get_smartsale_sales', { startDay: '2026-10-01', endDay: '2026-10-10' });
  assert.deepEqual(received, ['2026-10-01', '2026-10-10', undefined]);
  assert.deepEqual(result, { totalSmartSaleSales: 500 });
});

test('get_smartsale_sales: storeId inválido lanza AssistantToolError', async () => {
  const registry = buildRegistry();
  await assert.rejects(
    () => registry.execute('get_smartsale_sales', { startDay: '2026-10-01', endDay: '2026-10-10', storeId: 'no-existe' }),
    AssistantToolError,
  );
});
