import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyErpLine,
  erpExclusionReason,
  erpSmartSaleSellerName,
  isErpCreditNoteDoc,
  mergeSalesWithCreditNotes,
  normalizeErpSellerCode,
  resolveErpChannel,
  resolveErpStoreIdFromCo,
  splitIntoDayChunks,
} from './erp-sales.util';

test('resolveErpStoreIdFromCo mapea los 6 CO y descarta el resto', () => {
  assert.equal(resolveErpStoreIdFromCo('199'), 'pilatos');
  assert.equal(resolveErpStoreIdFromCo('202'), 'replay');
  assert.equal(resolveErpStoreIdFromCo('203'), 'kipling');
  assert.equal(resolveErpStoreIdFromCo('204'), 'girbaud');
  assert.equal(resolveErpStoreIdFromCo('208'), 'diesel');
  assert.equal(resolveErpStoreIdFromCo(' 209 '), 'superdry');
  assert.equal(resolveErpStoreIdFromCo('810'), null);
  assert.equal(resolveErpStoreIdFromCo(null), null);
});

test('erpExclusionReason: CO 810, CO 956 y CO desconocido (aplica a facturas y notas crédito)', () => {
  assert.equal(erpExclusionReason({ co: '199' }), null);
  assert.equal(erpExclusionReason({ co: ' 209 ' }), null);
  assert.equal(erpExclusionReason({ co: '810' }), 'smartsale-co');
  assert.equal(erpExclusionReason({ co: '956' }), 'pending-co');
  assert.equal(erpExclusionReason({ co: '999' }), 'unknown-co');
  assert.equal(erpExclusionReason({ co: null }), 'unknown-co');
});

test('isErpCreditNoteDoc: NVF es nota crédito (se guarda marcada, no se descarta)', () => {
  assert.equal(isErpCreditNoteDoc('NVF-00022259'), true);
  assert.equal(isErpCreditNoteDoc(' nvf-1'), true);
  assert.equal(isErpCreditNoteDoc('FTF-00236369'), false);
  assert.equal(isErpCreditNoteDoc(null), false);
});

test('resolveErpChannel / erpSmartSaleSellerName: 082P y 168A son SmartSale, sin distinguir mayúsculas', () => {
  assert.equal(resolveErpChannel('082P'), 'smartsale');
  assert.equal(resolveErpChannel('082p'), 'smartsale');
  assert.equal(resolveErpChannel(' 168a '), 'smartsale');
  assert.equal(resolveErpChannel('168A'), 'smartsale');
  assert.equal(resolveErpChannel('001'), 'ecommerce');
  assert.equal(resolveErpChannel(null), 'ecommerce');
  assert.equal(erpSmartSaleSellerName('082p'), 'Juana Pinilla');
  assert.equal(erpSmartSaleSellerName('168a'), 'Felipe Rengifo');
  assert.equal(erpSmartSaleSellerName('001'), null);
  assert.equal(normalizeErpSellerCode(' 168a '), '168A');
  assert.equal(normalizeErpSellerCode('  '), null);
});

test('classifyErpLine: flete, empaque y producto', () => {
  assert.equal(classifyErpLine('FLETE TIENDA VIRTUAL COORDINADORA', 'NA - NO APLICA'), 'freight');
  assert.equal(classifyErpLine('FLETE TIENDA VIRTUAL COORDINADORA', null), 'freight');
  assert.equal(classifyErpLine('CUALQUIER COSA', 'NA - NO APLICA'), 'freight');
  assert.equal(classifyErpLine('CONSUMO BOLSA KIPLING TIENDA VIRTUAL', 'NA - NO APLICA'), 'packaging');
  assert.equal(classifyErpLine('consumo bolsa diesel', null), 'packaging');
  assert.equal(classifyErpLine('CAJA', '741 - MATERIAL DE EMPAQUE'), 'packaging');
  assert.equal(classifyErpLine('CAMISETA M/C', '101 - CAMISETA'), 'product');
  assert.equal(classifyErpLine(null, null), 'product');
});

test('splitIntoDayChunks parte en tramos de 3 días inclusive', () => {
  assert.deepEqual(splitIntoDayChunks('2026-11-01', '2026-11-10'), [
    { start: '2026-11-01', end: '2026-11-03' },
    { start: '2026-11-04', end: '2026-11-06' },
    { start: '2026-11-07', end: '2026-11-09' },
    { start: '2026-11-10', end: '2026-11-10' },
  ]);
  assert.deepEqual(splitIntoDayChunks('2026-11-05', '2026-11-05'), [{ start: '2026-11-05', end: '2026-11-05' }]);
  assert.deepEqual(splitIntoDayChunks('2026-10-30', '2026-11-02'), [
    { start: '2026-10-30', end: '2026-11-01' },
    { start: '2026-11-02', end: '2026-11-02' },
  ]);
  assert.deepEqual(splitIntoDayChunks('2026-11-05', '2026-11-04'), []);
});

test('mergeSalesWithCreditNotes: une por clave y agrega al final los que solo tienen notas crédito', () => {
  const sales = [{ code: '168A', total: 10 }, { code: '082P', total: 5 }];
  const credits = [{ code: '082P', value: -2 }, { code: '999X', value: -1 }];
  const merged = mergeSalesWithCreditNotes(sales, credits, (s) => s.code, (c) => c.code);
  assert.deepEqual(
    merged.map((m) => [m.key, m.sale?.total ?? null, m.creditNote?.value ?? null]),
    [
      ['168A', 10, null],
      ['082P', 5, -2],
      ['999X', null, -1],
    ],
  );
  assert.deepEqual(mergeSalesWithCreditNotes([], [], (s: { k: string }) => s.k, (c: { k: string }) => c.k), []);
});
