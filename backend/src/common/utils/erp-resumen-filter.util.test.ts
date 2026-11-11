import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchErpMarcaToVtexBrand, parseFilterList, vtexSalesForErpMarcas } from './erp-resumen-filter.util';

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
