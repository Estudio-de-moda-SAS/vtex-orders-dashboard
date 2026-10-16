import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStoreIdFromMarca } from './credit-notes.util';

const STORES = [
  { id: 'pilatos', name: 'Pilatos' },
  { id: 'kipling', name: 'Kipling' },
  { id: 'girbaud', name: 'Girbaud' },
];

test('resolveStoreIdFromMarca: coincide sin importar mayúsculas/espacios', () => {
  assert.equal(resolveStoreIdFromMarca('PILATOS', STORES), 'pilatos');
  assert.equal(resolveStoreIdFromMarca('  pilatos  ', STORES), 'pilatos');
  assert.equal(resolveStoreIdFromMarca('Kipling', STORES), 'kipling');
});

test('resolveStoreIdFromMarca: null si no coincide con ninguna tienda conocida (la nota crédito igual se guarda)', () => {
  assert.equal(resolveStoreIdFromMarca('MARCA_DESCONOCIDA', STORES), null);
});

test('resolveStoreIdFromMarca: respeta los alias confirmados (el ERP identifica a Girbaud como "MFG")', () => {
  assert.equal(resolveStoreIdFromMarca('MFG', STORES), 'girbaud');
  assert.equal(resolveStoreIdFromMarca('mfg', STORES), 'girbaud');
});
