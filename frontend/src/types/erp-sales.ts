/** Desglose de venta ERP (`valor_neto`, con IVA). `total` = `product` + `freight` + `packaging` — el presupuesto se mide contra `total`. */
export interface ErpSalesBreakdown {
  total: number;
  freight: number;
  packaging: number;
  product: number;
  invoices: number;
  units: number;
}

export interface ErpSalesSummaryResponse {
  filters: { startDate: string; endDate: string };
  channel: ErpSalesBreakdown;
  byStore: (ErpSalesBreakdown & { storeId: string })[];
  lastSyncedAt: string | null;
  lastDataDay: string | null;
}

/** Notas crédito ("NVF-…") — se muestran aparte, NUNCA se restan de la venta. `value`/`units` vienen negativos. */
export interface ErpCreditNotesSummary {
  count: number;
  value: number;
  units: number;
}

/** Vendedor SmartSale: código del ERP normalizado ("168A") + nombre amigable. */
export interface ErpSmartSaleSellerSummary extends ErpSalesBreakdown {
  code: string;
  name: string;
  creditNotes: ErpCreditNotesSummary;
}

/** Pestaña "Ventas ERP" de `/smartsale` — solo vendedores SmartSale (082P/168A). AVT = total / facturas, UPT = unidades / facturas. */
export interface ErpSmartSaleSummaryResponse {
  filters: { startDate: string; endDate: string };
  channel: ErpSalesBreakdown;
  creditNotes: ErpCreditNotesSummary;
  bySeller: ErpSmartSaleSellerSummary[];
  byStore: (ErpSalesBreakdown & { storeId: string; creditNotes: ErpCreditNotesSummary; bySeller: ErpSmartSaleSellerSummary[] })[];
  pilatosByBrand: (ErpSalesBreakdown & { marca: string })[];
  byCategory: (ErpSalesBreakdown & { categoria: string })[];
  lastSyncedAt: string | null;
  lastDataDay: string | null;
}
