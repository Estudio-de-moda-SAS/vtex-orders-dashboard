/**
 * Reglas de negocio de las facturas e-commerce del ERP ("Conní",
 * consulta `estudiodemoda_Facuras_Ecommerce`) — todas confirmadas por el
 * usuario. Funciones puras (con pruebas en `erp-sales.util.test.ts`) para
 * que el sync y cualquier consulta futura apliquen exactamente lo mismo.
 */

/** Centro de operación (`co`) → `storeId` interno. Cualquier otro CO se descarta. */
const ERP_CO_TO_STORE: Record<string, string> = {
  '199': 'pilatos',
  '202': 'replay',
  '203': 'kipling',
  '204': 'girbaud',
  '208': 'diesel',
  '209': 'superdry',
};

/**
 * Vendedores del canal SmartSale — sus facturas pueden venir con el CO de
 * una marca, pero NO son venta de la tienda virtual (pendiente validar
 * aparte). Comparación sin distinguir mayúsculas/espacios ("168a" = "168A").
 */
const EXCLUDED_SELLER_CODES = new Set(['082P', '168A']);

/** CO 810 = SmartSale (otro departamento) — ya cae fuera por no estar en `ERP_CO_TO_STORE`, se nombra para que el log lo distinga. */
export const ERP_SMARTSALE_CO = '810';

/**
 * CO que se excluyen a propósito mientras el usuario los valida (no son
 * venta de la tienda virtual, o aún no se sabe a qué canal pertenecen):
 * - 956 "REPLAY EDEN BOGOTA" — apareció en las facturas de nov-2026.
 * Se reportan aparte en el sync ("pending-co") para seguirlos; si se
 * confirma que alguno es de una marca, pasarlo a `ERP_CO_TO_STORE` y
 * re-sincronizar el rango.
 */
const PENDING_VALIDATION_COS = new Set(['956']);

export type ErpLineKind = 'product' | 'freight' | 'packaging';

export type ErpExclusionReason = 'credit-note' | 'smartsale-co' | 'pending-co' | 'smartsale-seller' | 'unknown-co';

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function resolveErpStoreIdFromCo(co: string | null | undefined): string | null {
  return ERP_CO_TO_STORE[(co ?? '').trim()] ?? null;
}

/** "NVF-..." = nota crédito — ya se cubre en la pestaña de notas crédito, aquí se omite. */
export function isErpCreditNoteDoc(nroDocumento: string | null | undefined): boolean {
  return norm(nroDocumento).startsWith('NVF');
}

export function isErpExcludedSeller(codigoVendedor: string | null | undefined): boolean {
  return EXCLUDED_SELLER_CODES.has(norm(codigoVendedor));
}

/**
 * Motivo por el que una línea NO se guarda, o `null` si sí cuenta como
 * venta de la tienda virtual. El orden solo afecta qué motivo se reporta
 * en el log (cualquiera de ellos basta para descartarla).
 */
export function erpExclusionReason(row: {
  co: string | null | undefined;
  codigo_vendedor: string | null | undefined;
  nro_documento: string | null | undefined;
}): ErpExclusionReason | null {
  if (isErpCreditNoteDoc(row.nro_documento)) return 'credit-note';
  if ((row.co ?? '').trim() === ERP_SMARTSALE_CO) return 'smartsale-co';
  if (PENDING_VALIDATION_COS.has((row.co ?? '').trim())) return 'pending-co';
  if (resolveErpStoreIdFromCo(row.co) === null) return 'unknown-co';
  if (isErpExcludedSeller(row.codigo_vendedor)) return 'smartsale-seller';
  return null;
}

/**
 * Clasifica una línea en producto / flete / material de empaque.
 * - Flete: `desc_item` contiene "FLETE" (ej. "FLETE TIENDA VIRTUAL
 *   COORDINADORA") o `tipo` = "NA - NO APLICA".
 * - Empaque: `tipo` = "741 - MATERIAL DE EMPAQUE" o `desc_item` empieza
 *   por "CONSUMO" (ej. "CONSUMO BOLSA KIPLING TIENDA VIRTUAL", de
 *   cualquier marca).
 * La descripción explícita gana sobre `tipo` "NA": una bolsa de consumo
 * que venga con tipo "NA - NO APLICA" es empaque, no flete.
 */
export function classifyErpLine(descItem: string | null | undefined, tipo: string | null | undefined): ErpLineKind {
  const desc = norm(descItem);
  const t = norm(tipo);
  if (desc.includes('FLETE')) return 'freight';
  if (desc.startsWith('CONSUMO') || t.startsWith('741')) return 'packaging';
  if (t === 'NA - NO APLICA' || t === 'NA') return 'freight';
  return 'product';
}

/**
 * Parte `[from, to]` (inclusive, "YYYY-MM-DD") en tramos de a lo sumo
 * `chunkDays` días — la consulta del ERP es pesada y con rangos largos
 * se demora o se cae.
 */
export function splitIntoDayChunks(from: string, to: string, chunkDays = 3): { start: string; end: string }[] {
  if (chunkDays < 1) throw new Error('chunkDays debe ser >= 1');
  const toMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const DAY = 86_400_000;
  const chunks: { start: string; end: string }[] = [];
  const endMs = toMs(to);
  for (let cursor = toMs(from); cursor <= endMs; cursor += chunkDays * DAY) {
    chunks.push({ start: fmt(cursor), end: fmt(Math.min(cursor + (chunkDays - 1) * DAY, endMs)) });
  }
  return chunks;
}
