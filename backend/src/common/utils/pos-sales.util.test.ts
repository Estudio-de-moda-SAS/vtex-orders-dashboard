import assert from 'node:assert/strict';
import test from 'node:test';

import {
  friendlyPosSellerName,
  isPosCreditNoteDoc,
  isPosFreightLine,
  resolvePosStoreIdFromMarca,
} from './pos-sales.util';

test('resolvePosStoreIdFromMarca: marcas monomarca conocidas', () => {
  assert.equal(resolvePosStoreIdFromMarca('DIESEL ADULTO'), 'diesel');
  assert.equal(resolvePosStoreIdFromMarca('MARITHE FRANCOIS GIRBAUD'), 'girbaud');
  assert.equal(resolvePosStoreIdFromMarca('REPLAY'), 'replay');
  assert.equal(resolvePosStoreIdFromMarca('SUPERDRY'), 'superdry');
  assert.equal(resolvePosStoreIdFromMarca('KIPLING'), 'kipling');
});

test('resolvePosStoreIdFromMarca: es insensible a mayúsculas/espacios', () => {
  assert.equal(resolvePosStoreIdFromMarca('  replay  '), 'replay');
  assert.equal(resolvePosStoreIdFromMarca('kipling'), 'kipling');
});

test('resolvePosStoreIdFromMarca: cualquier otra marca (incluida "NO APLICA") cae en pilatos', () => {
  assert.equal(resolvePosStoreIdFromMarca('NO APLICA'), 'pilatos');
  assert.equal(resolvePosStoreIdFromMarca('CLEMONT'), 'pilatos');
  assert.equal(resolvePosStoreIdFromMarca('ARMO STUDIO'), 'pilatos');
});

test('isPosFreightLine: detecta "FLETE" en la referencia', () => {
  assert.equal(isPosFreightLine('FLETE TIENDA VIRTUAL 5000'), true);
  assert.equal(isPosFreightLine('flete tienda virtual 5000'), true);
});

test('isPosFreightLine: un producto normal no es flete', () => {
  assert.equal(isPosFreightLine('W9110435A'), false);
});

test('isPosCreditNoteDoc: NPE es nota crédito, FPE no', () => {
  assert.equal(isPosCreditNoteDoc('NPE'), true);
  assert.equal(isPosCreditNoteDoc('npe'), true);
  assert.equal(isPosCreditNoteDoc('FPE'), false);
});

test('friendlyPosSellerName: usa el mapeo manual cuando existe', () => {
  assert.equal(friendlyPosSellerName('RENGIFO OSORIO ANDRES FELIPE'), 'Felipe Rengifo');
  assert.equal(friendlyPosSellerName('PINILLA LONDOÑO JUANA SOFIA'), 'Juana Pinilla');
});

test('friendlyPosSellerName: cae a "Nombre Apellido" genérico si no está mapeado', () => {
  assert.equal(friendlyPosSellerName('PEREZ GOMEZ MARIA JOSE'), 'Perez Gomez Maria Jose');
});
