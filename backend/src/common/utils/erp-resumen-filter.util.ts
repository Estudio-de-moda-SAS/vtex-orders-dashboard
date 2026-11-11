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
