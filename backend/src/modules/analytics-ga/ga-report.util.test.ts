import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fillMissingDays,
  parseGaDate,
  rowsToByCampaign,
  rowsToByChannel,
  rowsToByCity,
  rowsToByDevice,
  rowsToByLandingPage,
  rowsToByProduct,
  rowsToByUserType,
  rowsToGaDaily,
} from './ga-report.util';

test('parseGaDate: convierte YYYYMMDD a YYYY-MM-DD sin tocar la zona horaria', () => {
  assert.equal(parseGaDate('20260115'), '2026-01-15');
});

test('parseGaDate: lanza si el formato no es YYYYMMDD', () => {
  assert.throws(() => parseGaDate('2026-01-15'));
});

test('rowsToGaDaily: mapea dimensión date y las 9 métricas en el orden esperado', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }],
      metricValues: [
        { value: '100' }, // sessions
        { value: '80' }, // totalUsers
        { value: '20' }, // newUsers
        { value: '60' }, // engagedSessions
        { value: '40' }, // itemViews
        { value: '10' }, // addToCarts
        { value: '5' }, // checkouts
        { value: '3' }, // purchases
        { value: '150000' }, // purchaseRevenue
      ],
    },
  ];
  const result = rowsToGaDaily(rows, 'pilatos');
  assert.deepEqual(result, [
    {
      date: '2026-01-15',
      storeId: 'pilatos',
      sessions: 100,
      totalUsers: 80,
      newUsers: 20,
      engagedSessions: 60,
      itemViews: 40,
      addToCarts: 10,
      checkouts: 5,
      purchases: 3,
      gaRevenue: 150000,
    },
  ]);
});

test('rowsToByChannel: conserva "(not set)" tal cual y mapea las 4 métricas (sessions, totalUsers, purchases, gaRevenue)', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: '(not set)' }],
      metricValues: [{ value: '10' }, { value: '9' }, { value: '1' }, { value: '50000' }],
    },
  ];
  const result = rowsToByChannel(rows, 'diesel');
  assert.equal(result[0].channelGroup, '(not set)');
  assert.equal(result[0].sessions, 10);
  assert.equal(result[0].totalUsers, 9);
  assert.equal(result[0].purchases, 1);
  assert.equal(result[0].gaRevenue, 50000);
});

test('rowsToByChannel: un string VACÍO literal de GA4 (no null/undefined) también se normaliza a "(not set)"', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: '' }],
      metricValues: [{ value: '5' }, { value: '4' }, { value: '0' }, { value: '0' }],
    },
  ];
  const result = rowsToByChannel(rows, 'pilatos');
  assert.equal(result[0].channelGroup, '(not set)');
});

test('rowsToByDevice: mapea dimensión deviceCategory y las 4 métricas (sessions, totalUsers, purchases, gaRevenue)', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: 'mobile' }],
      metricValues: [{ value: '200' }, { value: '180' }, { value: '8' }, { value: '120000' }],
    },
  ];
  const result = rowsToByDevice(rows, 'kipling');
  assert.deepEqual(result, [
    { date: '2026-01-15', storeId: 'kipling', deviceCategory: 'mobile', sessions: 200, totalUsers: 180, purchases: 8, gaRevenue: 120000 },
  ]);
});

test('rowsToByLandingPage: mapea dimensión landingPage y las 5 métricas (incluida engagedSessions, para la tasa de rebote) cuando hay 20 o menos páginas en el día', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: '/productos/camisa' }],
      metricValues: [{ value: '30' }, { value: '25' }, { value: '20' }, { value: '2' }, { value: '80000' }],
    },
  ];
  const result = rowsToByLandingPage(rows, 'girbaud');
  assert.deepEqual(result, [
    {
      date: '2026-01-15',
      storeId: 'girbaud',
      landingPage: '/productos/camisa',
      sessions: 30,
      totalUsers: 25,
      engagedSessions: 20,
      purchases: 2,
      gaRevenue: 80000,
    },
  ]);
});

test('rowsToByLandingPage: con más de 20 páginas en un día, conserva el Top 20 por sesiones y agrupa el resto (incluida engagedSessions) en "(otros)"', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    dimensionValues: [{ value: '20260115' }, { value: `/pagina-${i}` }],
    // Sesiones descendentes: pagina-0 tiene 100, pagina-24 tiene 76 — las últimas 5 (índices 20-24) quedan fuera del Top 20.
    metricValues: [{ value: String(100 - i) }, { value: '1' }, { value: '1' }, { value: '0' }, { value: '0' }],
  }));
  const result = rowsToByLandingPage(rows, 'pilatos');

  assert.equal(result.length, 21); // 20 páginas + 1 fila "(otros)"
  const other = result.find((r) => r.landingPage === '(otros)');
  assert.ok(other);
  // Sesiones de las 5 páginas excluidas (índices 20-24: 80+79+78+77+76).
  assert.equal(other!.sessions, 80 + 79 + 78 + 77 + 76);
  assert.equal(other!.totalUsers, 5);
  assert.equal(other!.engagedSessions, 5);
  assert.ok(result.every((r) => r.landingPage !== '/pagina-20' && r.landingPage !== '/pagina-24'));
  assert.ok(result.some((r) => r.landingPage === '/pagina-0'));
});

test('rowsToByCity: mapea dimensión city y las 4 métricas cuando hay 20 o menos ciudades en el día', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: 'Bogotá' }],
      metricValues: [{ value: '500' }, { value: '450' }, { value: '12' }, { value: '900000' }],
    },
  ];
  const result = rowsToByCity(rows, 'kipling');
  assert.deepEqual(result, [
    { date: '2026-01-15', storeId: 'kipling', city: 'Bogotá', sessions: 500, totalUsers: 450, purchases: 12, gaRevenue: 900000 },
  ]);
});

test('rowsToByCity: con más de 20 ciudades en un día, conserva el Top 20 por sesiones y agrupa el resto en "(otros)"', () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({
    dimensionValues: [{ value: '20260115' }, { value: `Ciudad-${i}` }],
    // Sesiones descendentes: Ciudad-0 tiene 50, Ciudad-22 tiene 28 — las últimas 3 (índices 20-22) quedan fuera del Top 20.
    metricValues: [{ value: String(50 - i) }, { value: '1' }, { value: '0' }, { value: '0' }],
  }));
  const result = rowsToByCity(rows, 'pilatos');

  assert.equal(result.length, 21); // 20 ciudades + 1 fila "(otros)"
  const other = result.find((r) => r.city === '(otros)');
  assert.ok(other);
  // Sesiones de las 3 ciudades excluidas (índices 20-22: 30+29+28).
  assert.equal(other!.sessions, 30 + 29 + 28);
  assert.equal(other!.totalUsers, 3);
  assert.ok(result.every((r) => r.city !== 'Ciudad-20' && r.city !== 'Ciudad-22'));
  assert.ok(result.some((r) => r.city === 'Ciudad-0'));
});

test('rowsToByProduct: mapea itemId/itemName/itemCategory y las 4 métricas de ítem cuando hay 20 o menos productos en el día', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: 'SKU-1' }, { value: 'Camisa azul' }, { value: 'Camisas' }],
      metricValues: [{ value: '300' }, { value: '40' }, { value: '5' }, { value: '450000' }],
    },
  ];
  const result = rowsToByProduct(rows, 'kipling');
  assert.deepEqual(result, [
    {
      date: '2026-01-15',
      storeId: 'kipling',
      itemId: 'SKU-1',
      itemName: 'Camisa azul',
      itemCategory: 'Camisas',
      itemsViewed: 300,
      itemsAddedToCart: 40,
      itemsPurchased: 5,
      itemRevenue: 450000,
    },
  ]);
});

test('rowsToByProduct: con más de 20 productos en un día, conserva el Top 20 por vistas y agrupa el resto en "(otros)"', () => {
  const rows = Array.from({ length: 22 }, (_, i) => ({
    dimensionValues: [{ value: '20260115' }, { value: `SKU-${i}` }, { value: `Producto ${i}` }, { value: 'Categoria' }],
    // Vistas descendentes: SKU-0 tiene 200, SKU-21 tiene 179 — las últimas 2 (índices 20-21) quedan fuera del Top 20.
    metricValues: [{ value: String(200 - i) }, { value: '1' }, { value: '0' }, { value: '0' }],
  }));
  const result = rowsToByProduct(rows, 'pilatos');

  assert.equal(result.length, 21); // 20 productos + 1 fila "(otros)"
  const other = result.find((r) => r.itemId === '(otros)');
  assert.ok(other);
  // Vistas de los 2 productos excluidos (índices 20-21: 180+179).
  assert.equal(other!.itemsViewed, 180 + 179);
  assert.equal(other!.itemsAddedToCart, 2);
  assert.equal(other!.itemName, '(otros)');
  assert.equal(other!.itemCategory, '(otros)');
  assert.ok(result.every((r) => r.itemId !== 'SKU-20' && r.itemId !== 'SKU-21'));
  assert.ok(result.some((r) => r.itemId === 'SKU-0'));
});

test('rowsToByProduct: fusiona filas duplicadas del mismo (día, itemId) con distinto itemName/itemCategory ANTES del Top 20 (confirmado en producción: violaba la llave única al insertar)', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: 'SKU-1' }, { value: 'Camiseta azul' }, { value: 'Camisetas' }],
      metricValues: [{ value: '100' }, { value: '10' }, { value: '2' }, { value: '80000' }],
    },
    {
      // Mismo itemId, pero itemName/itemCategory distintos (ej. catálogo cambió a mitad del día).
      dimensionValues: [{ value: '20260115' }, { value: 'SKU-1' }, { value: 'Camiseta azul talla M' }, { value: 'Ropa' }],
      metricValues: [{ value: '50' }, { value: '5' }, { value: '1' }, { value: '40000' }],
    },
  ];
  const result = rowsToByProduct(rows, 'pilatos');

  assert.equal(result.length, 1); // una sola fila fusionada, no dos (no debe romper la PK (date, store_id, item_id))
  assert.equal(result[0].itemsViewed, 150);
  assert.equal(result[0].itemsAddedToCart, 15);
  assert.equal(result[0].itemsPurchased, 3);
  assert.equal(result[0].itemRevenue, 120000);
  // Se queda con el nombre/categoría de la variante con MÁS vistas (100 > 50).
  assert.equal(result[0].itemName, 'Camiseta azul');
  assert.equal(result[0].itemCategory, 'Camisetas');
});

test('rowsToByUserType: mapea dimensión newVsReturning y las 4 métricas, sin tope ni agrupación en "(otros)"', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: 'new' }],
      metricValues: [{ value: '50' }, { value: '50' }, { value: '3' }, { value: '90000' }],
    },
    {
      dimensionValues: [{ value: '20260115' }, { value: 'returning' }],
      metricValues: [{ value: '40' }, { value: '35' }, { value: '5' }, { value: '150000' }],
    },
  ];
  const result = rowsToByUserType(rows, 'kipling');
  assert.deepEqual(result, [
    { date: '2026-01-15', storeId: 'kipling', userType: 'new', sessions: 50, totalUsers: 50, purchases: 3, gaRevenue: 90000 },
    { date: '2026-01-15', storeId: 'kipling', userType: 'returning', sessions: 40, totalUsers: 35, purchases: 5, gaRevenue: 150000 },
  ]);
});

test('rowsToByUserType: un string VACÍO literal de GA4 para newVsReturning (confirmado en producción) se normaliza a "(not set)"', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20260115' }, { value: '' }],
      metricValues: [{ value: '20' }, { value: '18' }, { value: '1' }, { value: '30000' }],
    },
  ];
  const result = rowsToByUserType(rows, 'pilatos');
  assert.equal(result[0].userType, '(not set)');
});

test('rowsToByCampaign: mapea campaña + fuente/medio y las 5 métricas de embudo, SIN tope ni agrupación "(otros)" aunque haya muchas filas el mismo día', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    dimensionValues: [{ value: '20261009' }, { value: `campana-${i}` }, { value: 'woowup / email' }],
    metricValues: [{ value: '10' }, { value: '3' }, { value: '2' }, { value: '1' }, { value: '50000' }],
  }));
  const result = rowsToByCampaign(rows, 'pilatos');
  assert.equal(result.length, 30); // las 30 campañas quedan, ninguna se funde en "(otros)" (a diferencia de landing pages/ciudades/productos).
  assert.deepEqual(result[0], {
    date: '2026-10-09',
    storeId: 'pilatos',
    campaignName: 'campana-0',
    sourceMedium: 'woowup / email',
    sessions: 10,
    addToCarts: 3,
    checkouts: 2,
    purchases: 1,
    gaRevenue: 50000,
  });
});

test('rowsToByCampaign: fusiona filas duplicadas del mismo (día, campaña, fuente/medio) por seguridad, aunque GA4 no debería repetirlas', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20261009' }, { value: 'pilatos-bazar' }, { value: 'facebook / ads' }],
      metricValues: [{ value: '100' }, { value: '30' }, { value: '10' }, { value: '5' }, { value: '200000' }],
    },
    {
      dimensionValues: [{ value: '20261009' }, { value: 'pilatos-bazar' }, { value: 'facebook / ads' }],
      metricValues: [{ value: '50' }, { value: '10' }, { value: '4' }, { value: '2' }, { value: '80000' }],
    },
  ];
  const result = rowsToByCampaign(rows, 'pilatos');
  assert.equal(result.length, 1);
  assert.equal(result[0].sessions, 150);
  assert.equal(result[0].addToCarts, 40);
  assert.equal(result[0].checkouts, 14);
  assert.equal(result[0].purchases, 7);
  assert.equal(result[0].gaRevenue, 280000);
});

test('rowsToByCampaign: un string VACÍO literal de GA4 en campaña o fuente/medio se normaliza a "(not set)" (mismo tráfico orgánico/directo sin UTM)', () => {
  const rows = [
    {
      dimensionValues: [{ value: '20261009' }, { value: '' }, { value: '(direct) / (none)' }],
      metricValues: [{ value: '500' }, { value: '20' }, { value: '5' }, { value: '2' }, { value: '100000' }],
    },
  ];
  const result = rowsToByCampaign(rows, 'pilatos');
  assert.equal(result[0].campaignName, '(not set)');
  assert.equal(result[0].sourceMedium, '(direct) / (none)');
});

test('fillMissingDays: rellena en cero cada día del rango que GA no reportó', () => {
  const existing = [
    {
      date: '2026-01-02',
      storeId: 'pilatos',
      sessions: 50,
      totalUsers: 40,
      newUsers: 10,
      engagedSessions: 30,
      itemViews: 20,
      addToCarts: 5,
      checkouts: 2,
      purchases: 1,
      gaRevenue: 90000,
    },
  ];
  const result = fillMissingDays('2026-01-01', '2026-01-03', 'pilatos', existing);
  assert.equal(result.length, 3);
  assert.equal(result[0].date, '2026-01-01');
  assert.equal(result[0].sessions, 0);
  assert.equal(result[1].date, '2026-01-02');
  assert.equal(result[1].sessions, 50);
  assert.equal(result[2].date, '2026-01-03');
  assert.equal(result[2].sessions, 0);
});

test('fillMissingDays: un día en cero real (GA sí lo reportó, con todo en 0) no se confunde con uno faltante', () => {
  const existing = [
    {
      date: '2026-01-01',
      storeId: 'pilatos',
      sessions: 0,
      totalUsers: 0,
      newUsers: 0,
      engagedSessions: 0,
      itemViews: 0,
      addToCarts: 0,
      checkouts: 0,
      purchases: 0,
      gaRevenue: 0,
    },
  ];
  const result = fillMissingDays('2026-01-01', '2026-01-01', 'pilatos', existing);
  // Mismo resultado objeto-a-objeto que si se hubiera rellenado por ausencia — la distinción
  // real vive en que la fila SÍ existe en `ga_daily` después de esto, no en su contenido.
  assert.deepEqual(result, existing);
});
