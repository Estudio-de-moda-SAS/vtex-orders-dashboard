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
 * Vendedores del canal SmartSale (código del ERP → nombre amigable) — sus
 * facturas vienen con el CO de una marca, pero NO son venta de la tienda
 * virtual: van a la pestaña "Ventas ERP" de `/smartsale`. Comparación sin
 * distinguir mayúsculas/espacios ("168a" = "168A"). Un vendedor nuevo se
 * agrega A MANO aquí, con el nombre IDÉNTICO al de `pos-sales.util.ts` y
 * `smartsale.config.ts` (el "Resumen" de SmartSale empareja por nombre).
 */
const ERP_SMARTSALE_SELLERS: Record<string, string> = {
  '082P': 'Juana Pinilla',
  '168A': 'Felipe Rengifo',
};

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

/** 'ecommerce' = tiendas virtuales (`/presupuesto`); 'smartsale' = vendedores SmartSale (`/smartsale` → "Ventas ERP"). */
export type ErpChannel = 'ecommerce' | 'smartsale';

export type ErpExclusionReason = 'smartsale-co' | 'pending-co' | 'unknown-co';

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function resolveErpStoreIdFromCo(co: string | null | undefined): string | null {
  return ERP_CO_TO_STORE[(co ?? '').trim()] ?? null;
}

/**
 * "NVF-..." = nota crédito (valor y cantidad vienen NEGATIVOS). Se guarda
 * con `is_credit_note = true` pero NUNCA entra en la venta: todas las
 * consultas de venta la excluyen (no se resta — decisión del usuario).
 * Solo se muestra aparte en "Ventas ERP" de `/smartsale` (cantidad y valor
 * por marca y vendedor); las de e-commerce ya tienen su propia pestaña.
 */
export function isErpCreditNoteDoc(nroDocumento: string | null | undefined): boolean {
  return norm(nroDocumento).startsWith('NVF');
}

/** Nombre amigable del vendedor SmartSale, o `null` si el código no es de SmartSale. */
export function erpSmartSaleSellerName(codigoVendedor: string | null | undefined): string | null {
  return ERP_SMARTSALE_SELLERS[norm(codigoVendedor)] ?? null;
}

/** Código normalizado ("168a " → "168A") — así se guarda, para agrupar sin duplicados por mayúsculas. */
export function normalizeErpSellerCode(codigoVendedor: string | null | undefined): string | null {
  const code = norm(codigoVendedor);
  return code === '' ? null : code;
}

export function resolveErpChannel(codigoVendedor: string | null | undefined): ErpChannel {
  return erpSmartSaleSellerName(codigoVendedor) !== null ? 'smartsale' : 'ecommerce';
}

/**
 * Motivo por el que una línea NO se guarda en ningún canal, o `null` si
 * sí se guarda (el canal lo decide `resolveErpChannel`; las notas crédito
 * SÍ se guardan, marcadas con `isErpCreditNoteDoc`). Aplica igual a
 * facturas y a notas crédito.
 */
export function erpExclusionReason(row: { co: string | null | undefined }): ErpExclusionReason | null {
  if ((row.co ?? '').trim() === ERP_SMARTSALE_CO) return 'smartsale-co';
  if (PENDING_VALIDATION_COS.has((row.co ?? '').trim())) return 'pending-co';
  if (resolveErpStoreIdFromCo(row.co) === null) return 'unknown-co';
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

/**
 * Une filas de venta y de notas crédito por la misma clave (ej. código de
 * vendedor), conservando el orden de las ventas y agregando AL FINAL las
 * claves que solo tienen notas crédito (un vendedor que en el rango solo
 * tuvo devoluciones igual debe aparecer). Pura — la usa
 * `ErpSalesQueryService` para vendedores y vendedores por tienda.
 */
export function mergeSalesWithCreditNotes<S, C>(
  sales: S[],
  creditNotes: C[],
  saleKey: (s: S) => string,
  creditKey: (c: C) => string,
): { key: string; sale: S | null; creditNote: C | null }[] {
  const creditByKey = new Map(creditNotes.map((c) => [creditKey(c), c]));
  const merged: { key: string; sale: S | null; creditNote: C | null }[] = sales.map((s) => ({
    key: saleKey(s),
    sale: s,
    creditNote: creditByKey.get(saleKey(s)) ?? null,
  }));
  const seen = new Set(merged.map((m) => m.key));
  for (const c of creditNotes) {
    const key = creditKey(c);
    if (!seen.has(key)) {
      merged.push({ key, sale: null, creditNote: c });
      seen.add(key);
    }
  }
  return merged;
}
