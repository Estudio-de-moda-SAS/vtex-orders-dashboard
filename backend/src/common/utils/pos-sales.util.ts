/**
 * `marca` tal cual la entrega la API de ventas POS ("Conní") → `storeId`
 * interno. A diferencia de `credit-notes.util.ts` (que compara contra el
 * NOMBRE de cada tienda y devuelve `null` si no coincide), acá el usuario
 * confirmó que CUALQUIER marca no listada pertenece a Pilatos (es un
 * marketplace multimarca) — nunca hay un valor sin tienda.
 */
const POS_MARCA_TO_STORE: Record<string, string> = {
  'DIESEL ADULTO': 'diesel',
  'MARITHE FRANCOIS GIRBAUD': 'girbaud',
  REPLAY: 'replay',
  SUPERDRY: 'superdry',
  KIPLING: 'kipling',
};

const PILATOS_STORE_ID = 'pilatos';

export function resolvePosStoreIdFromMarca(marca: string): string {
  const normalized = marca.trim().toUpperCase();
  return POS_MARCA_TO_STORE[normalized] ?? PILATOS_STORE_ID;
}

/**
 * Una línea es flete cuando su `referencia` contiene "FLETE" (ej. "FLETE
 * TIENDA VIRTUAL 5000") — confirmado por el usuario como el campo
 * correcto (no `categoria`, que también usa "NO APLICA" para otras cosas).
 * Cuenta igual dentro del total de ventas, pero se muestra aparte.
 */
export function isPosFreightLine(referencia: string): boolean {
  return referencia.trim().toUpperCase().includes('FLETE');
}

/** `tipo_docto = "NPE"` identifica una nota crédito POS (vs. "FPE" para una venta). */
export function isPosCreditNoteDoc(tipoDocto: string): boolean {
  return tipoDocto.trim().toUpperCase() === 'NPE';
}

/**
 * Mapa manual nombre-crudo→nombre-amigable, provisto por el usuario caso a
 * caso (ej. "RENGIFO OSORIO ANDRES FELIPE" → "Felipe Rengifo") — los
 * nombres colombianos (2 apellidos + 2 nombres) no siguen una regla fija
 * de cuál combinación mostrar, así que NO se adivina. Mientras un vendedor
 * nuevo no esté acá, se muestra en "Nombre Apellido" genérico (ver
 * `titleCaseFallback`) en vez del nombre crudo en mayúsculas.
 */
const POS_SELLER_FRIENDLY_NAMES: Record<string, string> = {
  'PINILLA LONDOÑO JUANA SOFIA': 'Juana Pinilla',
  'RENGIFO OSORIO ANDRES FELIPE': 'Felipe Rengifo',
};

function titleCaseFallback(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function friendlyPosSellerName(nombreVendedor: string): string {
  const normalized = nombreVendedor.trim().toUpperCase();
  return POS_SELLER_FRIENDLY_NAMES[normalized] ?? titleCaseFallback(nombreVendedor);
}
