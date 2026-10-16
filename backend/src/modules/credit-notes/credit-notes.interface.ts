/**
 * Respuestas de `GET /api/credit-notes/*` — lectura SQL pura sobre
 * `credit_notes` (nunca llama a la API del ERP en vivo, esa parte es
 * exclusiva de `CreditNotesSyncService`/`cli/credit-notes-sync.ts`).
 * Espejo en `frontend/src/types/credit-notes.ts`.
 */

/** Fila cruda tal cual la entrega la API "Conní" del ERP — ver ejemplo real en el README. */
export interface CreditNoteApiRow {
  rowid_nc: number;
  nota_credito: string;
  fecha_nc: string;
  fecha_creacion_nc: string;
  id_cia: number;
  id_co: string;
  tienda: string;
  marca: string;
  factura_erp: string;
  fecha_factura: string;
  vlr_neto_factura: number;
  pedido_erp: string;
  orden_vtex: string;
  razon_nc: string;
  vlr_bruto: number;
  vlr_dscto: number;
  vlr_impuestos: number;
  vlr_neto: number;
  total_nc_factura: number;
}

/** Un día del rango — `count`/`totalValue` en 0 si ese día no tuvo notas crédito (nunca se omite el día). */
export interface CreditNotesDaySummary {
  date: string;
  count: number;
  totalValue: number;
}

export interface CreditNotesStoreSummary {
  /** `null` si `marca` no coincidió con ninguna tienda configurada. */
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
  /** Ventas contabilizadas (mismo criterio que el resto del dashboard) del mismo rango/tienda — denominador de "¿qué % de lo vendido se devolvió?". */
  totalSalesValue: number;
  byDay: CreditNotesDaySummary[];
  byStore: CreditNotesStoreSummary[];
}
