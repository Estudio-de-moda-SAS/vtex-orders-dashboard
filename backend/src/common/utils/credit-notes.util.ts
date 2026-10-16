/**
 * Casos confirmados donde `marca` (API de notas crédito) NO coincide con
 * el nombre de la tienda en `stores.config.ts` — el ERP identifica a
 * Girbaud internamente como "MFG". Se revisa ANTES que la comparación por
 * nombre. Agregar acá cualquier otro alias que se confirme a futuro.
 */
const MARCA_ALIASES: Record<string, string> = {
  MFG: 'girbaud',
};

/**
 * Resuelve `marca` (ej. "PILATOS") de una nota crédito a un `storeId`
 * interno (ej. "pilatos") — primero contra `MARCA_ALIASES` (casos donde el
 * ERP usa un nombre distinto), luego comparando contra el NOMBRE de cada
 * tienda configurada. `null` si no coincide con ninguna tienda conocida
 * (ej. "Broken Chains", "Chopper" — marcas reales del ERP que no están en
 * este dashboard): la nota crédito se guarda igual, solo sin tienda
 * asociada (ver `CreditNotesSyncService`).
 */
export function resolveStoreIdFromMarca(marca: string, storeNames: { id: string; name: string }[]): string | null {
  const normalized = marca.trim().toUpperCase();
  if (MARCA_ALIASES[normalized]) return MARCA_ALIASES[normalized];
  const match = storeNames.find((s) => s.name.trim().toUpperCase() === normalized);
  return match?.id ?? null;
}
