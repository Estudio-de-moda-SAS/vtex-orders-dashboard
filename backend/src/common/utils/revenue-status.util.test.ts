import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getRevenueStatusDefinitions } from '../../config/revenue-status.config';
import { matchRevenueStatusDefinition } from './revenue-status.util';

const definitions = getRevenueStatusDefinitions();

test('waiting-ffmt-authorization cuenta en las 5 marcas y no en Pilatos', () => {
  for (const storeId of ['diesel', 'superdry', 'kipling', 'girbaud', 'replay']) {
    const match = matchRevenueStatusDefinition({ status: 'waiting-ffmt-authorization', storeId }, definitions);
    assert.equal(match?.key, 'waiting-ffmt-authorization', storeId);
  }
  assert.equal(matchRevenueStatusDefinition({ status: 'waiting-ffmt-authorization', storeId: 'pilatos' }, definitions), undefined);
});

test('sin tienda, un estado con exclusiones por tienda no cuenta (falla cerrada)', () => {
  assert.equal(matchRevenueStatusDefinition({ status: 'waiting-ffmt-authorization', storeId: null }, definitions), undefined);
});

test('los estados sin exclusiones siguen contando en todas las tiendas, incluida Pilatos', () => {
  for (const status of ['invoiced', 'payment-approved', 'handling', 'ready-for-handling', 'invoice']) {
    assert.ok(matchRevenueStatusDefinition({ status, storeId: 'pilatos' }, definitions), status);
    assert.ok(matchRevenueStatusDefinition({ status, storeId: 'diesel' }, definitions), status);
  }
  assert.equal(matchRevenueStatusDefinition({ status: 'canceled', storeId: 'diesel' }, definitions), undefined);
});
