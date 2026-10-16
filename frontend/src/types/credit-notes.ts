/**
 * Espejo de `backend/src/modules/credit-notes/credit-notes.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí.
 */

export interface CreditNotesDaySummary {
  date: string;
  count: number;
  totalValue: number;
}

export interface CreditNotesStoreSummary {
  storeId: string | null;
  marca: string;
  count: number;
  totalValue: number;
}

export interface CreditNotesSummaryResponse {
  filters: { startDate: string; endDate: string };
  totalCount: number;
  /** Suma de `vlr_neto` — lo que realmente se acreditó, NO el valor de las facturas originales. */
  totalValue: number;
  /** Ventas contabilizadas del mismo rango/tienda — denominador de "¿qué % de lo vendido se devolvió?". */
  totalSalesValue: number;
  byDay: CreditNotesDaySummary[];
  byStore: CreditNotesStoreSummary[];
}
