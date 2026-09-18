import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getStoresConfig } from '../../config/stores.config';
import { buildEnrichedOrder, groupRowsByOrder, HostMismatchError, ReferenceLookups } from './row-mapper';
import { SafeRow } from './row-picker';

const pilatos = getStoresConfig().find((s) => s.id === 'pilatos')!;

/** Mapas vacíos — "no encontrado" para toda referencia, que es lo único que necesitan estos tests. */
const emptyLookups: ReferenceLookups = {
  categoriesById: new Map(),
  brandsBySkuId: new Map(),
  collectionsBySkuAndStore: new Map(),
};

function row(overrides: Partial<SafeRow>): SafeRow {
  return {
    Order: 'VPC-12345',
    'Creation Date': '2026-06-01 10:00:00-0500',
    'Status raw value (temporary)': 'invoiced',
    'Total Value': 100000,
    Host: 'pilatos21.vtexcommercestable.com.br',
    ID_SKU: 'sku-1',
    'SKU Value': 50000,
    'SKU Selling Price': 50000,
    ...overrides,
  };
}

test('el order_id (con prefijo tipo VPC-) pasa sin transformación del Excel al dato guardado', () => {
  const rows = [row({ Order: 'VPC-12345' })];
  const groups = groupRowsByOrder(rows, pilatos);

  assert.equal(groups.has('VPC-12345'), true, 'el id con el prefijo original debe ser la llave del grupo');

  const [orderId, group] = [...groups.entries()][0];
  const enriched = buildEnrichedOrder(orderId, group, pilatos, emptyLookups);
  assert.equal(enriched.orderId, 'VPC-12345', 'no debe quitarse ni agregarse ningún prefijo al order_id');
});

test('groupRowsByOrder lanza HostMismatchError si el Host no corresponde a la tienda esperada', () => {
  const rows = [row({ Host: 'otratienda.vtexcommercestable.com.br' })];
  assert.throws(() => groupRowsByOrder(rows, pilatos), HostMismatchError);
});

test('cuando "Status raw value (temporary)" viene vacío, se resuelve el código en inglés a partir del texto en español (caso real: Kipling)', () => {
  const rows = [row({ 'Status raw value (temporary)': '', Status: 'Facturado' })];
  const groups = groupRowsByOrder(rows, pilatos);
  const [orderId, group] = [...groups.entries()][0];
  const enriched = buildEnrichedOrder(orderId, group, pilatos, emptyLookups);
  assert.equal(enriched.status, 'invoiced', '"Facturado" debe resolverse a "invoiced", no quedarse en español');
});

test('cuando "Status raw value (temporary)" en sí mismo trae texto en español (no vacío, caso real: Kipling), igual se resuelve al código en inglés', () => {
  const rows = [row({ 'Status raw value (temporary)': 'Facturado', Status: 'Facturado' })];
  const groups = groupRowsByOrder(rows, pilatos);
  const [orderId, group] = [...groups.entries()][0];
  const enriched = buildEnrichedOrder(orderId, group, pilatos, emptyLookups);
  assert.equal(enriched.status, 'invoiced', 'no basta con que la columna "raw" no esté vacía — igual hay que resolver el código si el valor no es un código conocido');
});

test('un status en español sin equivalente conocido (ej. "Preparando") se conserva tal cual', () => {
  const rows = [row({ 'Status raw value (temporary)': '', Status: 'Preparando' })];
  const groups = groupRowsByOrder(rows, pilatos);
  const [orderId, group] = [...groups.entries()][0];
  const enriched = buildEnrichedOrder(orderId, group, pilatos, emptyLookups);
  assert.equal(enriched.status, 'Preparando');
});
