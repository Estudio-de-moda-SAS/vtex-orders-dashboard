import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalizeVtexCategory, matchPosCategoryToVtex } from './category-normalize.util';

/** Lista real de `category_name` en `smartsale_daily_by_category`, confirmada en producción. */
const REAL_VTEX_CATEGORIES = [
  'Accesorios', 'Bermudas', 'Billeteras', 'Bodys', 'Bolsos', 'Boxer', 'Buzo', 'Buzos', 'Buzos y Chaquetas',
  'Camisas', 'Camisetas', 'Cartucheras', 'Chaquetas', 'Correas', 'Cosmetiqueras', 'Denim', 'Estuches', 'Faldas',
  'Fragancias', 'Gafas', 'Gorras', 'Gorro', 'Gorros', 'Jeans', 'Joyeria', 'Medias', 'Monederos', 'Morrales',
  'Otros Accesorios', 'Pantalones', 'Polo', 'Polos', 'Relojes', 'Riñoneras', 'Ropa de bano', 'Ropa interior',
  'Ropa Interior', 'Sandalias', 'Shorts', 'Shorts y Bermudas', 'Slim', 'Sudaderas', 'Tenis', 'Unisex', 'Vestidos',
  'Zapatos',
];

test('canonicalizeVtexCategory: colapsa los duplicados confirmados de VTEX', () => {
  assert.equal(canonicalizeVtexCategory('Buzo'), 'Buzos');
  assert.equal(canonicalizeVtexCategory('Buzos'), 'Buzos');
  assert.equal(canonicalizeVtexCategory('Gorro'), 'Gorros');
  assert.equal(canonicalizeVtexCategory('Polo'), 'Polos');
  assert.equal(canonicalizeVtexCategory('Ropa interior'), 'Ropa Interior');
  assert.equal(canonicalizeVtexCategory('Ropa Interior'), 'Ropa Interior');
});

test('canonicalizeVtexCategory: una categoría sin alias se devuelve tal cual', () => {
  assert.equal(canonicalizeVtexCategory('Camisetas'), 'Camisetas');
});

test('matchPosCategoryToVtex: casos reales confirmados que SÍ deben emparejar', () => {
  const cases: [string, string][] = [
    ['CAMISETA M/C', 'Camisetas'],
    ['CAMISETA M/L', 'Camisetas'],
    ['CAMISA M/L', 'Camisas'],
    ['JEAN RIGIDO', 'Jeans'],
    ['JEAN STRETCH', 'Jeans'],
    ['CHAQUETA CASUAL', 'Chaquetas'],
    ['CHAQUETA PADDED', 'Chaquetas'],
    ['CHAQUETA ROMPE VIENTOS', 'Chaquetas'],
    ['PANTALON CARGO', 'Pantalones'],
    ['PANTALON CHINO', 'Pantalones'],
    ['BUZO CERRADO', 'Buzos'],
    ['BUZO HOODIE ABIERTO', 'Buzos'],
    ['BUZO HOODIE CERRADO', 'Buzos'],
    ['FALDA CORTA', 'Faldas'],
    ['FALDA DENIM', 'Faldas'],
    ['BERMUDA DENIM', 'Bermudas'],
    ['MORRAL NO PORTATIL', 'Morrales'],
    ['MORRAL PORTATIL', 'Morrales'],
    ['VESTIDO CORTO', 'Vestidos'],
    ['VESTIDO LARGO', 'Vestidos'],
    ['RELOJ DIGITAL', 'Relojes'],
    ['GORRO', 'Gorros'],
    ['RIÑONERA', 'Riñoneras'],
    ['BOLSO', 'Bolsos'],
    ['CARTUCHERA', 'Cartucheras'],
    ['COSMETIQUERA', 'Cosmetiqueras'],
    ['FRAGANCIA', 'Fragancias'],
    ['SUDADERA', 'Sudaderas'],
    ['POLO M/C', 'Polos'],
    ['TENIS', 'Tenis'],
    ['ZAPATOS', 'Zapatos'],
  ];
  for (const [posCategoria, expectedVtex] of cases) {
    assert.equal(matchPosCategoryToVtex(posCategoria, REAL_VTEX_CATEGORIES), expectedVtex, `"${posCategoria}" debería emparejar con "${expectedVtex}"`);
  }
});

test('matchPosCategoryToVtex: "CAMISA M/L" nunca se confunde con "Camisetas" (comparten las primeras 5 letras)', () => {
  assert.equal(matchPosCategoryToVtex('CAMISA M/L', REAL_VTEX_CATEGORIES), 'Camisas');
});

test('matchPosCategoryToVtex: casos reales confirmados SIN equivalencia clara — nunca se fuerza una coincidencia', () => {
  const unmatched = ['TOP', 'CROP TOP', 'BOTAS', 'CASUAL', 'MANOSLIBRES', 'BRIEF'];
  for (const posCategoria of unmatched) {
    assert.equal(matchPosCategoryToVtex(posCategoria, REAL_VTEX_CATEGORIES), null, `"${posCategoria}" no debería emparejar con nada`);
  }
});

test('matchPosCategoryToVtex: nunca empareja con una categoría compuesta ("Buzos y Chaquetas", "Shorts y Bermudas")', () => {
  assert.notEqual(matchPosCategoryToVtex('BUZO CERRADO', REAL_VTEX_CATEGORIES), 'Buzos y Chaquetas');
  assert.notEqual(matchPosCategoryToVtex('BERMUDA DENIM', REAL_VTEX_CATEGORIES), 'Shorts y Bermudas');
});
