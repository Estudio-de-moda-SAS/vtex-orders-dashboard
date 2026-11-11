/**
 * Reglas de negocio de las facturas e-commerce del ERP ("Conní",
 * consulta `estudiodemoda_Facuras_Ecommerce`) — todas confirmadas por el
 * usuario. Funciones puras (con pruebas en `erp-sales.util.test.ts`) para
 * que el sync y cualquier consulta futura apliquen exactamente lo mismo.
 */

import { resolvePosStoreIdFromMarca } from './pos-sales.util';

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

/**
 * CO 810 = POS físico de SmartSale. Son los MISMOS documentos que trae la
 * consulta de ventas POS (validado documento por documento, nov-2026), pero
 * esta consulta trae además subtotal sin IVA y costo. Se guardan como canal
 * 'pos' SOLO para calcular el margen POS del Resumen de SmartSale — nunca
 * se muestran como venta (la venta POS sigue saliendo de `pos_sales`).
 * Ojo: esta consulta trae tarde los documentos del día (se completa con el
 * sync de 3 días).
 */
export const ERP_POS_CO = '810';

/**
 * CO que se excluyen a propósito mientras el usuario los valida (no son
 * venta de la tienda virtual, o aún no se sabe a qué canal pertenecen):
 * - 956 "REPLAY EDEN BOGOTA" — apareció en las facturas de nov-2026.
 * Se reportan aparte en el sync ("pending-co") para seguirlos; si se
 * confirma que alguno es de una marca, pasarlo a `ERP_CO_TO_STORE` y
 * re-sincronizar el rango.
 */
const PENDING_VALIDATION_COS = new Set(['956']);

/**
 * 'advertising' = material publicitario (tipo "801 - MATERIAL
 * PUBLICITARIO": portadocumentos, pines, muestras) — facturado en $0 con
 * costo; como flete y empaque, NO es producto (no entra a margen, utilidad,
 * tipos ni unidades).
 */
export type ErpLineKind = 'product' | 'freight' | 'packaging' | 'advertising';

/**
 * 'ecommerce' = tiendas virtuales (`/presupuesto`); 'smartsale' = vendedores
 * SmartSale (`/smartsale` → "Ventas ERP"); 'pos' = POS físico (CO 810), solo
 * para el margen POS — ver `ERP_POS_CO`.
 */
export type ErpChannel = 'ecommerce' | 'smartsale' | 'pos';

export type ErpExclusionReason = 'pending-co' | 'unknown-co';

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function resolveErpStoreIdFromCo(co: string | null | undefined): string | null {
  return ERP_CO_TO_STORE[(co ?? '').trim()] ?? null;
}

/**
 * "NVF-..." = nota crédito e-commerce/SmartSale; "NPE-..." = nota crédito
 * del POS (CO 810). Valor y cantidad vienen NEGATIVOS. Se guarda
 * con `is_credit_note = true` pero NUNCA entra en la venta: todas las
 * consultas de venta la excluyen (no se resta — decisión del usuario).
 * Solo se muestra aparte en "Ventas ERP" de `/smartsale` (cantidad y valor
 * por marca y vendedor); las de e-commerce ya tienen su propia pestaña.
 */
export function isErpCreditNoteDoc(nroDocumento: string | null | undefined): boolean {
  const doc = norm(nroDocumento);
  return doc.startsWith('NVF') || doc.startsWith('NPE');
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

/**
 * Canal y tienda de una línea que SÍ se guarda (ver `erpExclusionReason`):
 * - CO 810 → canal 'pos'; tienda con la MISMA regla de "Ventas POS"
 *   (`resolvePosStoreIdFromMarca` sobre la marca sin código: "DSA - DIESEL
 *   ADULTO" → "DIESEL ADULTO" → diesel; lo no listado cae en Pilatos), para
 *   que el margen POS caiga en la misma tienda que su venta POS.
 * - Vendedor 082P/168A → 'smartsale'; el resto → 'ecommerce'; tienda por CO.
 */
export function resolveErpTarget(row: {
  co: string | null | undefined;
  codigo_vendedor: string | null | undefined;
  marca: string | null | undefined;
}): { channel: ErpChannel; storeId: string } | null {
  if ((row.co ?? '').trim() === ERP_POS_CO) {
    const marca = (row.marca ?? '').trim().replace(/^\S+\s+-\s+/, '');
    return { channel: 'pos', storeId: resolvePosStoreIdFromMarca(marca) };
  }
  const storeId = resolveErpStoreIdFromCo(row.co);
  if (storeId === null) return null;
  return { channel: erpSmartSaleSellerName(row.codigo_vendedor) !== null ? 'smartsale' : 'ecommerce', storeId };
}

/**
 * Motivo por el que una línea NO se guarda en ningún canal, o `null` si
 * sí se guarda (el canal lo decide `resolveErpChannel`; las notas crédito
 * SÍ se guardan, marcadas con `isErpCreditNoteDoc`). Aplica igual a
 * facturas y a notas crédito.
 */
export function erpExclusionReason(row: { co: string | null | undefined }): ErpExclusionReason | null {
  const co = (row.co ?? '').trim();
  if (co === ERP_POS_CO) return null;
  if (PENDING_VALIDATION_COS.has(co)) return 'pending-co';
  if (resolveErpStoreIdFromCo(co) === null) return 'unknown-co';
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
  if (t.startsWith('801')) return 'advertising';
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
