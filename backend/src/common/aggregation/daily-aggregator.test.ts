import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aggregateDailyRows } from './daily-aggregator';
import { EnrichedOrder } from './types';

function baseOrder(overrides: Partial<EnrichedOrder>): EnrichedOrder {
  return {
    orderId: 'ORD-1',
    storeId: 'pilatos',
    dayBucket: '2026-06-01',
    status: 'invoiced',
    statusDescription: null,
    totalValue: 100000,
    paymentNames: 'Visa',
    city: 'Bogotá',
    items: [],
    discountCampaignNames: [],
    sellerLabel: null,
    marketplaceLabel: null,
    ...overrides,
  };
}

test('una orden con 2 productos de categoría/colección distintas aporta 1 unidad a cada una por separado', () => {
  const order = baseOrder({
    items: [
      { skuId: 'sku-a', ean: '', category: 'Camisetas', brand: 'Marca A', collectionName: 'Línea', quantity: 1, listPrice: 50000, sellingPrice: 50000, discountPercentage: 0 },
      { skuId: 'sku-b', ean: '', category: 'Pantalones', brand: 'Marca B', collectionName: 'Outlet', quantity: 1, listPrice: 50000, sellingPrice: 50000, discountPercentage: 0 },
    ],
  });

  const result = aggregateDailyRows([order], true);

  const camisetas = result.byCategory.find((r) => r.categoryName === 'Camisetas');
  const pantalones = result.byCategory.find((r) => r.categoryName === 'Pantalones');
  assert.equal(camisetas?.units, 1);
  assert.equal(pantalones?.units, 1);
  assert.equal(result.byCategory.length, 2, 'no debe colapsar las 2 categorías en una sola fila');

  const linea = result.byCollection.find((r) => r.collectionName === 'Línea');
  const outlet = result.byCollection.find((r) => r.collectionName === 'Outlet');
  assert.equal(linea?.units, 1);
  assert.equal(outlet?.units, 1);
});

test('una orden facturada (invoiced) suma tanto a orders/sales como a revenue_orders/revenue_sales', () => {
  const order = baseOrder({ status: 'invoiced', totalValue: 100000, city: 'Bogotá' });
  const result = aggregateDailyRows([order], false);

  const city = result.byCity.find((r) => r.city === 'Bogotá');
  assert.equal(city?.orders, 1);
  assert.equal(city?.sales, 100000);
  assert.equal(city?.revenueOrders, 1, 'invoiced debe contar en revenue_orders');
  assert.equal(city?.revenueSales, 100000, 'invoiced debe contar en revenue_sales');
});

test('una orden cancelada suma a orders/sales pero NO a revenue_orders/revenue_sales', () => {
  const order = baseOrder({ status: 'canceled', totalValue: 100000, city: 'Medellín' });
  const result = aggregateDailyRows([order], false);

  const city = result.byCity.find((r) => r.city === 'Medellín');
  assert.equal(city?.orders, 1, 'canceled sigue contando en el total general');
  assert.equal(city?.sales, 100000);
  assert.equal(city?.revenueOrders, 0, 'canceled NO debe contar en revenue_orders');
  assert.equal(city?.revenueSales, 0, 'canceled NO debe contar en revenue_sales');
});
