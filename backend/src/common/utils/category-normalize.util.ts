import { normalizeText } from './text-normalize.util';

/**
 * Casos confirmados donde VTEX guarda la MISMA categoría con dos nombres
 * distintos (singular/plural o de mayúscula) — se colapsan a UN solo
 * nombre canónico antes de intentar emparejar con POS, para que no
 * aparezcan como dos líneas separadas en ningún lado. Clave normalizada
 * con `normalizeText` (minúscula, sin tildes).
 */
const VTEX_CATEGORY_ALIASES: Record<string, string> = {
  buzo: 'Buzos',
  gorro: 'Gorros',
  polo: 'Polos',
  'ropa interior': 'Ropa Interior',
};

/**
 * Categorías VTEX compuestas/genéricas — EXCLUIDAS como destino de
 * emparejamiento automático desde POS. "Buzos y Chaquetas" comparte la
 * raíz "buzos" con la categoría simple "Buzos" (ambigüedad); "Otros
 * Accesorios" empieza con una palabra demasiado genérica ("Otros") para
 * que cualquier coincidencia de prefijo tenga sentido real.
 */
const VTEX_CATEGORY_MATCH_EXCLUSIONS = new Set(['Buzos y Chaquetas', 'Shorts y Bermudas', 'Otros Accesorios', 'Ropa de bano']);

/** Mínimo de caracteres de prefijo compartido para aceptar una coincidencia — ver casos reales sin equivalencia (TOP, BOTAS, CASUAL, MANOSLIBRES, BRIEF, CROP TOP) que quedan deliberadamente sin mapear por quedar debajo de esto. */
const MIN_PREFIX_MATCH_LENGTH = 4;

/** Colapsa un nombre de categoría VTEX a su forma canónica (ver `VTEX_CATEGORY_ALIASES`) — si no es un alias conocido, se devuelve tal cual. */
export function canonicalizeVtexCategory(raw: string): string {
  return VTEX_CATEGORY_ALIASES[normalizeText(raw)] ?? raw;
}

function firstWordKey(value: string): string {
  return normalizeText(value).split(/\s+/)[0] ?? '';
}

function longestCommonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

/**
 * Empareja una categoría CRUDA de POS (ej. "CAMISETA M/C") contra la
 * categoría VTEX canónica más parecida — por la primera palabra de cada
 * una, con mayor coincidencia de PREFIJO (no igualdad exacta: evita tener
 * que resolver singular/plural en español, que tiene reglas irregulares
 * — "pantalón"→"pantalones", "reloj"→"relojes", "morral"→"morrales" —
 * comparar solo el prefijo compartido las empareja igual sin necesitar
 * esas reglas). `null` si ninguna categoría VTEX comparte al menos
 * `MIN_PREFIX_MATCH_LENGTH` caracteres de prefijo — NUNCA fuerza una
 * coincidencia débil; esos casos deben mostrarse sin fusionar, no
 * adivinados.
 *
 * Antes de buscar, colapsa duplicados conocidos de VTEX
 * (`canonicalizeVtexCategory`) y descarta las categorías compuestas de
 * `VTEX_CATEGORY_MATCH_EXCLUSIONS` como destino (pueden seguir
 * apareciendo del lado VTEX, solo no reciben ventas de POS por esta vía).
 */
export function matchPosCategoryToVtex(posCategoria: string, vtexCategoryNames: string[]): string | null {
  const candidates = Array.from(new Set(vtexCategoryNames.map(canonicalizeVtexCategory))).filter(
    (name) => !VTEX_CATEGORY_MATCH_EXCLUSIONS.has(name),
  );

  const posKey = firstWordKey(posCategoria);
  let best: { name: string; length: number } | null = null;
  for (const vtexName of candidates) {
    const length = longestCommonPrefixLength(posKey, firstWordKey(vtexName));
    if (length >= MIN_PREFIX_MATCH_LENGTH && (!best || length > best.length)) {
      best = { name: vtexName, length };
    }
  }
  return best?.name ?? null;
}
