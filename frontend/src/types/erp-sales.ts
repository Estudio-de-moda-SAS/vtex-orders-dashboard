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
  /** Tipos de producto, solo producto — lista completa ordenada por venta. */
  byTipo: (ErpSalesBreakdown & { tipo: string })[];
  byStoreTipo: { storeId: string; byTipo: (ErpSalesBreakdown & { tipo: string })[] }[];
  lastSyncedAt: string | null;
  lastDataDay: string | null;
}

/** Margen ERP: utilidad = subtotal SIN IVA − costo (costo unitario × cantidad); margen = utilidad ÷ subtotal. */
export interface ErpMarginFigures {
  subtotal: number;
  cost: number;
  utility: number;
  /** `null` si no hubo venta. */
  marginPercent: number | null;
}

/** "Resumen" de `/presupuesto` — margen y utilidad e-commerce por marca. `channel.marginPercent` es el PONDERADO. */
export interface ErpMarginSummaryResponse {
  filters: { startDate: string; endDate: string };
  byStore: (ErpMarginFigures & { storeId: string })[];
  channel: ErpMarginFigures & { simpleAverageMarginPercent: number | null; storesInSimpleAverage: number };
  freight: { subtotal: number; cost: number; utility: number };
  packaging: { subtotal: number; cost: number; utility: number };
}

/** Un marketplace del cuadro de comisiones: comisión = venta sin IVA × %, utilidad = venta sin IVA − comisión (sin costo). */
export interface ErpMarketplaceRow {
  prefix: string;
  name: string;
  commissionPercent: number;
  vtexSales: number;
  erpSales: number;
  erpSubtotal: number;
  invoices: number;
  commission: number;
  utility: number;
  marginPercent: number | null;
}

export interface ErpMarketplaceSummaryResponse {
  filters: { startDate: string; endDate: string };
  rows: ErpMarketplaceRow[];
  total: {
    vtexSales: number;
    erpSales: number;
    erpSubtotal: number;
    invoices: number;
    commission: number;
    utility: number;
    marginPercent: number | null;
    simpleAverageMarginPercent: number | null;
    marketplacesInSimpleAverage: number;
  };
  /** Prefijos de `docto_referencia` con venta que no están en el cuadro de comisiones (ej. "SLR"). */
  otherPrefixes: { prefix: string; erpSales: number; erpSubtotal: number; invoices: number }[];
}

/** Marcas dentro de Pilatos y ventas por tipo (e-commerce, solo producto) — listas completas ordenadas por venta. */
export interface ErpEcommerceBreakdownResponse {
  filters: { startDate: string; endDate: string };
  pilatosByBrand: (ErpSalesBreakdown & { marca: string })[];
  byTipo: (ErpSalesBreakdown & { tipo: string })[];
  byStore: { storeId: string; byTipo: (ErpSalesBreakdown & { tipo: string })[] }[];
}

/** Resumen filtrado de `/presupuesto` (tienda / marca de Pilatos / tipo, selección múltiple). */
export interface ErpResumenFilteredResponse {
  filters: { startDate: string; endDate: string; storeIds: string[]; marcas: string[]; tipos: string[] };
  byStore: { storeId: string; erpSales: number; subtotal: number; cost: number; utility: number; marginPercent: number | null }[];
  channel: {
    erpSales: number;
    subtotal: number;
    cost: number;
    utility: number;
    marginPercent: number | null;
    simpleAverageMarginPercent: number | null;
    storesInSimpleAverage: number;
  };
  freight: { subtotal: number; cost: number; utility: number };
  packaging: { subtotal: number; cost: number; utility: number };
  marketplaces: Omit<ErpMarketplaceSummaryResponse, 'filters'>;
  vtex: {
    /** Con filtro de tipo, la venta VTEX es N/A (VTEX no usa los tipos del ERP). */
    tipoFilterActive: boolean;
    /** Solo con filtro de marca y Pilatos incluida. */
    pilatosBrands: { sales: number; matched: { erpMarca: string; vtexBrand: string }[]; unmatched: string[] } | null;
  };
  /** Opciones COMBINADAS de los filtros (cada lista con los otros dos aplicados). */
  options: {
    storeIds: string[];
    marcas: string[];
    tipos: string[];
    /** Marcas ERP que vende cada tienda en el rango — para saber si su venta VTEX completa aplica. */
    storeMarcas: Record<string, string[]>;
  };
  /** Notas crédito con los mismos filtros, YA RESTADAS en la venta: por tienda y total (valores negativos). */
  creditNotes: {
    byStore: { storeId: string; count: number; value: number; grossSales: number; netSales: number }[];
    total: { count: number; value: number; grossSales: number; netSales: number };
  };
}
