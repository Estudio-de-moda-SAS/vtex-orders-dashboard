export interface PosSalesSellerSummary {
  nitVendedor: string;
  /** Nombre amigable (ya resuelto en el backend), no el crudo de la API del ERP. */
  name: string;
  orders: number;
  sales: number;
}

export interface PosSalesStoreSummary {
  storeId: string;
  orders: number;
  sales: number;
  /** Vendedores DENTRO de esta tienda únicamente (a diferencia de `bySeller`, que combina las 6). */
  bySeller: PosSalesSellerSummary[];
}

export interface PosSalesBrandSummary {
  marca: string;
  orders: number;
  sales: number;
}

export interface PosSalesSummaryResponse {
  filters: { startDate: string; endDate: string };
  /** DEFINITIVO: incluye fletes y YA RESTA las notas crédito. */
  totalSales: number;
  /** Subconjunto de `totalSales` — solo informativo. */
  totalFreight: number;
  /** YA incluido (restado) en `totalSales` — se muestra aparte solo como referencia, no hay que restarlo de nuevo. Puede ser negativo. */
  totalCreditNotes: number;
  totalOrders: number;
  averageTicket: number;
  /** Combinando las 6 tiendas. */
  bySeller: PosSalesSellerSummary[];
  byStore: PosSalesStoreSummary[];
  /** Desglose por marca real DENTRO de Pilatos (única tienda multimarca) — no cambia el total de Pilatos en `byStore`. */
  pilatosByBrand: PosSalesBrandSummary[];
}
