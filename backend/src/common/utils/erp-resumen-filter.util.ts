import { normalizeText } from './text-normalize.util';

/**
 * Filtros del "Resumen" de `/presupuesto` (tienda, marca, tipo — selección
 * múltiple). Reglas definidas por el usuario:
 * - Marca solo aplica a Pilatos (marcas reales del ERP dentro de la
 *   tienda); para las otras tiendas la marca es "N/A" y se ven completas.
 * - Con un filtro de tipo activo, la venta VTEX es "N/A": VTEX no usa los
 *   mismos tipos que el ERP (el usuario enviará la equivalencia después).
 * Pruebas en `erp-resumen-filter.util.test.ts`.
 */

export interface ErpResumenFilters {
  /** Vacío = todas las tiendas. */
  storeIds: string[];
  /** Marcas ERP dentro de Pilatos (ej. "DSA - DIESEL ADULTO"). Vacío = todas. */
  marcas: string[];
  /** Tipos ERP (ej. "101 - CAMISETA"). Vacío = todos. */
  tipos: string[];
}

/** Lee un arreglo JSON de strings (mismo formato que `campaigns` — ver `CampaignComboQueryDto`); `undefined`/vacío → []. Lanza si no es válido. */
export function parseFilterList(raw: string | undefined, name: string): string[] {
  if (raw === undefined || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} debe ser un arreglo JSON de strings, ej. ["A","B"]`);
  }
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
    throw new Error(`${name} debe ser un arreglo JSON de strings`);
  }
  return Array.from(new Set(parsed.map((v) => v.trim()).filter(Boolean)));
}

/** "DSA - DIESEL ADULTO" → "diesel adulto" (sin código, minúscula, sin tildes). */
function erpBrandKey(erpMarca: string): string {
  return normalizeText(erpMarca.replace(/^\S+\s+-\s+/, '')).replace(/\s+/g, ' ');
}

/**
 * Marca VTEX equivalente a una marca ERP de Pilatos: primero igualdad del
 * nombre sin código ("MFG - MARITHE FRANCOIS GIRBAUD" = "Marithe Francois
 * Girbaud"); si no, primera palabra ("DSA - DIESEL ADULTO" → "Diesel") con
 * al menos 4 letras para no unir por coincidencias cortas. `null` si no hay
 * equivalencia — nunca se adivina una marca distinta.
 */
export function matchErpMarcaToVtexBrand(erpMarca: string, vtexBrands: string[]): string | null {
  const key = erpBrandKey(erpMarca);
  if (!key) return null;
  const exact = vtexBrands.find((b) => normalizeText(b).replace(/\s+/g, ' ') === key);
  if (exact) return exact;
  const firstWord = key.split(' ')[0];
  if (firstWord.length < 4) return null;
  const candidates = vtexBrands.filter((b) => normalizeText(b).split(/\s+/)[0] === firstWord);
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Venta VTEX de Pilatos para las marcas ERP seleccionadas — suma de las
 * marcas VTEX equivalentes; `unmatched` = marcas ERP sin equivalencia (su
 * venta VTEX no se suma, se avisa en pantalla).
 */
export function vtexSalesForErpMarcas(
  selectedErpMarcas: string[],
  vtexSalesByBrand: Record<string, number>,
): { sales: number; matched: { erpMarca: string; vtexBrand: string }[]; unmatched: string[] } {
  const vtexBrands = Object.keys(vtexSalesByBrand);
  const matched: { erpMarca: string; vtexBrand: string }[] = [];
  const unmatched: string[] = [];
  const counted = new Set<string>();
  let sales = 0;
  for (const erpMarca of selectedErpMarcas) {
    const vtexBrand = matchErpMarcaToVtexBrand(erpMarca, vtexBrands);
    if (!vtexBrand) {
      unmatched.push(erpMarca);
      continue;
    }
    matched.push({ erpMarca, vtexBrand });
    if (!counted.has(vtexBrand)) {
      counted.add(vtexBrand);
      sales += vtexSalesByBrand[vtexBrand];
    }
  }
  return { sales, matched, unmatched };
}

/** Una combinación (tienda, marca, tipo) con su venta — insumo de las opciones de los filtros. */
export interface FilterComboRow {
  storeId: string;
  marca: string;
  tipo: string;
  sales: number;
}

export interface ResumenFilterOptions {
  /** Tiendas con venta que cumplen los filtros de marca y tipo. */
  storeIds: string[];
  /** Marcas con venta que cumplen los filtros de tienda y tipo — ordenadas por venta. */
  marcas: string[];
  /** Tipos con venta que cumplen los filtros de tienda y marca — ordenados por venta. */
  tipos: string[];
  /** Marcas ERP que vende cada tienda en el rango (sin filtros) — para decidir si la venta VTEX de la tienda aplica. */
  storeMarcas: Record<string, string[]>;
}

/**
 * Opciones COMBINADAS de los filtros: cada lista se arma con los OTROS
 * dos filtros aplicados (ej. con marca "DSA - DIESEL ADULTO", tipo solo
 * lista los tipos que vende Diesel Adulto). Así nunca se ofrece una
 * opción que deje el resumen vacío. Solo líneas de producto (las da el
 * repositorio ya filtradas).
 */
export function buildResumenFilterOptions(rows: FilterComboRow[], filters: ErpResumenFilters): ResumenFilterOptions {
  const inStores = (r: FilterComboRow) => filters.storeIds.length === 0 || filters.storeIds.includes(r.storeId);
  const inMarcas = (r: FilterComboRow) => filters.marcas.length === 0 || filters.marcas.includes(r.marca);
  const inTipos = (r: FilterComboRow) => filters.tipos.length === 0 || filters.tipos.includes(r.tipo);

  const ranked = (filtered: FilterComboRow[], key: (r: FilterComboRow) => string) => {
    const totals = new Map<string, number>();
    for (const r of filtered) totals.set(key(r), (totals.get(key(r)) ?? 0) + r.sales);
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  };

  const storeMarcas: Record<string, string[]> = {};
  for (const r of rows) {
    const list = (storeMarcas[r.storeId] ??= []);
    if (!list.includes(r.marca)) list.push(r.marca);
  }

  return {
    storeIds: ranked(rows.filter((r) => inMarcas(r) && inTipos(r)), (r) => r.storeId),
    marcas: ranked(rows.filter((r) => inStores(r) && inTipos(r)), (r) => r.marca),
    tipos: ranked(rows.filter((r) => inStores(r) && inMarcas(r)), (r) => r.tipo),
    storeMarcas,
  };
}

/**
 * Venta VTEX de una tienda de una sola marca con filtro de marca: aplica
 * (la venta VTEX completa de la tienda) solo si TODAS las marcas ERP que
 * vende esa tienda en el rango están seleccionadas — si vende otra que no
 * se eligió (ej. Girbaud también vende Converse), VTEX no separa esa venta
 * → `false` (se muestra "N/A").
 */
export function singleBrandStoreVtexApplies(storeMarcas: string[], selectedMarcas: string[]): boolean {
  return storeMarcas.length > 0 && storeMarcas.every((m) => selectedMarcas.includes(m));
}
