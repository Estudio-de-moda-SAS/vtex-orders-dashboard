import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildResumenFilterOptions,
  matchErpMarcaToVtexBrand,
  parseFilterList,
  singleBrandStoreVtexApplies,
  vtexSalesForErpMarcas,
} from './erp-resumen-filter.util';

const VTEX_BRANDS = ['Diesel', 'Marithe Francois Girbaud', 'Superdry', 'New Balance', 'Nike', 'Oakley', 'Replay', 'Le Coq Sportif'];

test('parseFilterList: arreglo JSON, vacío y sin duplicados', () => {
  assert.deepEqual(parseFilterList(undefined, 'x'), []);
  assert.deepEqual(parseFilterList('', 'x'), []);
  assert.deepEqual(parseFilterList('["101 - CAMISETA"," 208 - TENIS ","101 - CAMISETA"]', 'x'), ['101 - CAMISETA', '208 - TENIS']);
  assert.throws(() => parseFilterList('101 - CAMISETA', 'tipos'));
  assert.throws(() => parseFilterList('[1,2]', 'tipos'));
});

test('matchErpMarcaToVtexBrand: igualdad sin código y primera palabra', () => {
  assert.equal(matchErpMarcaToVtexBrand('MFG - MARITHE FRANCOIS GIRBAUD', VTEX_BRANDS), 'Marithe Francois Girbaud');
  assert.equal(matchErpMarcaToVtexBrand('NWB - NEW BALANCE', VTEX_BRANDS), 'New Balance');
  assert.equal(matchErpMarcaToVtexBrand('DSA - DIESEL ADULTO', VTEX_BRANDS), 'Diesel');
  assert.equal(matchErpMarcaToVtexBrand('SRY - SUPERDRY', VTEX_BRANDS), 'Superdry');
  assert.equal(matchErpMarcaToVtexBrand('NIKE - NIKE', VTEX_BRANDS), 'Nike');
  assert.equal(matchErpMarcaToVtexBrand('LCO - LE COQ SPORTIF', VTEX_BRANDS), 'Le Coq Sportif');
  assert.equal(matchErpMarcaToVtexBrand('GRIN - GOORIN BROS', VTEX_BRANDS), null);
  assert.equal(matchErpMarcaToVtexBrand('ON - ON', VTEX_BRANDS), null);
});

test('vtexSalesForErpMarcas suma las equivalentes y separa las que no tienen', () => {
  const r = vtexSalesForErpMarcas(['DSA - DIESEL ADULTO', 'NIKE - NIKE', 'GRIN - GOORIN BROS'], { Diesel: 100, Nike: 20, Oakley: 5 });
  assert.equal(r.sales, 120);
  assert.deepEqual(r.unmatched, ['GRIN - GOORIN BROS']);
  assert.equal(r.matched.length, 2);
});

const COMBOS = [
  { storeId: 'pilatos', marca: 'DSA - DIESEL ADULTO', tipo: '101 - CAMISETA', sales: 50 },
  { storeId: 'pilatos', marca: 'DSA - DIESEL ADULTO', tipo: '201 - JEAN', sales: 40 },
  { storeId: 'pilatos', marca: 'SRY - SUPERDRY', tipo: '101 - CAMISETA', sales: 30 },
  { storeId: 'diesel', marca: 'DSA - DIESEL ADULTO', tipo: '101 - CAMISETA', sales: 20 },
  { storeId: 'superdry', marca: 'SRY - SUPERDRY', tipo: '101 - CAMISETA', sales: 25 },
  { storeId: 'girbaud', marca: 'MFG - MARITHE FRANCOIS GIRBAUD', tipo: '101 - CAMISETA', sales: 10 },
  { storeId: 'girbaud', marca: 'CVS - CONVERSE', tipo: '208 - TENIS', sales: 5 },
];

test('buildResumenFilterOptions: marca Diesel Adulto + camiseta solo deja Pilatos y Diesel (no Superdry)', () => {
  const o = buildResumenFilterOptions(COMBOS, { storeIds: [], marcas: ['DSA - DIESEL ADULTO'], tipos: ['101 - CAMISETA'] });
  assert.deepEqual(o.storeIds, ['pilatos', 'diesel']);
  // Tipos que vende Diesel Adulto (sin filtrar por tipo): camiseta y jean.
  assert.deepEqual(o.tipos, ['101 - CAMISETA', '201 - JEAN']);
  // Marcas que venden camiseta (sin filtrar por marca).
  assert.deepEqual(o.marcas, ['DSA - DIESEL ADULTO', 'SRY - SUPERDRY', 'MFG - MARITHE FRANCOIS GIRBAUD']);
});

test('buildResumenFilterOptions: solo tipo camiseta → todas las tiendas que venden camiseta', () => {
  const o = buildResumenFilterOptions(COMBOS, { storeIds: [], marcas: [], tipos: ['101 - CAMISETA'] });
  assert.deepEqual(o.storeIds, ['pilatos', 'superdry', 'diesel', 'girbaud']);
  assert.deepEqual(o.storeMarcas.girbaud, ['MFG - MARITHE FRANCOIS GIRBAUD', 'CVS - CONVERSE']);
});

test('singleBrandStoreVtexApplies: solo si todas las marcas de la tienda están elegidas', () => {
  assert.equal(singleBrandStoreVtexApplies(['DSA - DIESEL ADULTO'], ['DSA - DIESEL ADULTO', 'NIKE - NIKE']), true);
  assert.equal(singleBrandStoreVtexApplies(['MFG - MARITHE FRANCOIS GIRBAUD', 'CVS - CONVERSE'], ['MFG - MARITHE FRANCOIS GIRBAUD']), false);
  assert.equal(singleBrandStoreVtexApplies([], ['X']), false);
});
