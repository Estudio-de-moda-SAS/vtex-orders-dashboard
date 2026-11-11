import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyErpLine, erpExclusionReason, resolveErpStoreIdFromCo, splitIntoDayChunks } from './erp-sales.util';

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

test('erpExclusionReason: notas crédito, CO 810, CO desconocido y vendedores SmartSale', () => {
  const ok = { co: '199', codigo_vendedor: '001', nro_documento: 'FTF-00236369' };
  assert.equal(erpExclusionReason(ok), null);
  assert.equal(erpExclusionReason({ ...ok, nro_documento: 'NVF-00005964' }), 'credit-note');
  assert.equal(erpExclusionReason({ ...ok, co: '810' }), 'smartsale-co');
  assert.equal(erpExclusionReason({ ...ok, co: '956' }), 'pending-co');
  assert.equal(erpExclusionReason({ ...ok, co: '999' }), 'unknown-co');
  assert.equal(erpExclusionReason({ ...ok, codigo_vendedor: '082P' }), 'smartsale-seller');
  assert.equal(erpExclusionReason({ ...ok, codigo_vendedor: '082p' }), 'smartsale-seller');
  assert.equal(erpExclusionReason({ ...ok, codigo_vendedor: ' 168a ' }), 'smartsale-seller');
  assert.equal(erpExclusionReason({ ...ok, codigo_vendedor: '168A' }), 'smartsale-seller');
  assert.equal(erpExclusionReason({ ...ok, codigo_vendedor: null }), null);
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
