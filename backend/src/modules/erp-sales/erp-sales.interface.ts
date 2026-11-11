/** Una fila tal cual la entrega la API "Conní" (`estudiodemoda_Facuras_Ecommerce`). */
export interface ErpSaleApiRow {
  id_cia?: number | null;
  co: string | null;
  desc_co: string | null;
  docto_referencia: string | null;
  codigo_vendedor: string | null;
  tipo_cliente?: string | null;
  docto_remision: string | null;
  nro_documento: string;
  fecha: string;
  estado_docto: string | null;
  cliente_factura: string | null;
  razon_social_cliente?: string | null;
  bodega: string | null;
  item: number | null;
  referencia: string | null;
  desc_item: string | null;
  um_inv?: string | null;
  cantidad: number | null;
  valor_neto: number | null;
  valor_bruto: number | null;
  valor_descuentos: number | null;
  valor_impuestos: number | null;
  valor_subtotal: number | null;
  estado_item?: string | null;
  marca: string | null;
  margen_promedio?: number | null;
  orden_compra_pedido?: string | null;
  costo_mp?: number | null;
  notas_causal_dev?: string | null;
  categoria: string | null;
  tipo: string | null;
  costo_promedio_uni_inst?: number | null;
  pedido_vtex: string | null;
  costo_promedio_total: number | null;
  utilidad_promedio: number | null;
}

/** Desglose de venta ERP (`valor_neto`, con IVA). `total` = `product` + `freight` + `packaging`; el presupuesto se mide contra `total`. */
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
  /** Siempre las 6 tiendas, en ceros si no tuvieron ventas. */
  byStore: (ErpSalesBreakdown & { storeId: string })[];
  lastSyncedAt: string | null;
  /** Último día con al menos una línea guardada — si es anterior a `endDate`, el rango aún no está sincronizado completo. */
  lastDataDay: string | null;
}

/**
 * Resumen FILTRADO de `/presupuesto` (tienda / marca de Pilatos / tipo,
 * selección múltiple) — ventas ERP, margen, utilidad y marketplaces sobre
 * las líneas que cumplen los filtros. La venta VTEX por tienda la pone el
 * frontend (Dashboard); aquí solo va lo que el filtro cambia del lado VTEX.
 */
export interface ErpResumenFilteredResponse {
  filters: { startDate: string; endDate: string; storeIds: string[]; marcas: string[]; tipos: string[] };
  /**
   * Siempre las tiendas seleccionadas (o las 6), aunque no vendan la
   * combinación de marca/tipo — en ese caso salen en 0.
   */
  byStore: { storeId: string; erpSales: number; subtotal: number; cost: number; utility: number; marginPercent: number | null }[];
  channel: { erpSales: number; subtotal: number; cost: number; utility: number; marginPercent: number | null; simpleAverageMarginPercent: number | null; storesInSimpleAverage: number };
  freight: { subtotal: number; cost: number; utility: number };
  packaging: { subtotal: number; cost: number; utility: number };
  marketplaces: import('../../common/utils/erp-marketplace.util').MarketplaceSummary;
  /**
   * Lado VTEX: `tipoFilterActive` → toda la venta VTEX es "N/A" (VTEX no usa
   * los tipos del ERP). `pilatosBrands` (solo con filtro de marca y Pilatos
   * incluida): venta VTEX de Pilatos de las marcas equivalentes y las que
   * no tienen equivalencia en VTEX.
   */
  vtex: {
    tipoFilterActive: boolean;
    pilatosBrands: { sales: number; matched: { erpMarca: string; vtexBrand: string }[]; unmatched: string[] } | null;
  };
  /** Opciones COMBINADAS de los filtros (cada lista con los otros dos aplicados) — ver `buildResumenFilterOptions`. */
  options: import('../../common/utils/erp-resumen-filter.util').ResumenFilterOptions;
}

export interface ErpSalesSyncResult {
  saved: number;
  /** Líneas de FACTURA guardadas por canal (sin notas crédito). */
  byChannel: { ecommerce: number; smartsale: number; pos: number };
  /** Líneas de nota crédito ("NVF-…") guardadas por canal — no se restan de nada. */
  creditNoteLines: { ecommerce: number; smartsale: number; pos: number };
  excluded: Record<string, number>;
}

/**
 * Notas crédito ("NVF-…") — se MUESTRAN aparte, nunca se restan de la
 * venta. `value` y `units` vienen NEGATIVOS, tal cual el ERP.
 */
export interface ErpCreditNotesSummary {
  /** Notas crédito distintas. */
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

/**
 * Pestaña "Ventas ERP" de `/smartsale` — solo vendedores SmartSale
 * (082P/168A), mismas exclusiones que el canal e-commerce (NVF, CO 810,
 * CO 956). AVT = `total / invoices`, UPT = `units / invoices` (los calcula
 * el frontend con `formatAverageTicket`/`formatUpt`, igual que POS).
 */
export interface ErpSmartSaleSummaryResponse {
  filters: { startDate: string; endDate: string };
  channel: ErpSalesBreakdown;
  /** Notas crédito del canal (no restadas de `channel`). */
  creditNotes: ErpCreditNotesSummary;
  bySeller: ErpSmartSaleSellerSummary[];
  /** Siempre las 6 tiendas, en ceros si no tuvieron ventas. */
  byStore: (ErpSalesBreakdown & { storeId: string; creditNotes: ErpCreditNotesSummary; bySeller: ErpSmartSaleSellerSummary[] })[];
  /** Solo líneas de producto, por `marca` cruda del ERP (ej. "REP - REPLAY"). */
  pilatosByBrand: (ErpSalesBreakdown & { marca: string })[];
  /** Solo líneas de producto, por `categoria` cruda del ERP, combinando las 6 tiendas. */
  byCategory: (ErpSalesBreakdown & { categoria: string })[];
  /** Tipos de producto ("208 - TENIS"), solo producto, combinando las 6 tiendas — lista completa ordenada por venta. */
  byTipo: (ErpSalesBreakdown & { tipo: string })[];
  /** Tipos por tienda — siempre las 6 tiendas. */
  byStoreTipo: { storeId: string; byTipo: (ErpSalesBreakdown & { tipo: string })[] }[];
  lastSyncedAt: string | null;
  lastDataDay: string | null;
}

/**
 * Desglose adicional del canal e-commerce (pestaña "Presupuesto y ventas
 * ERP" de `/presupuesto`), SOLO líneas de producto — flete y empaque no
 * son marca ni tipo de producto. Listas COMPLETAS ordenadas por venta
 * (con IVA) descendente; la pantalla muestra el top 10 y el "Resumen"
 * podrá filtrarlas después.
 */
export interface ErpEcommerceBreakdownResponse {
  filters: { startDate: string; endDate: string };
  /** Marcas reales del ERP (`marca`) dentro de Pilatos — todas. */
  pilatosByBrand: (ErpSalesBreakdown & { marca: string })[];
  /** Tipos de producto (`tipo`, ej. "101 - CAMISETA") sumando las 6 marcas. */
  byTipo: (ErpSalesBreakdown & { tipo: string })[];
  /** Tipos por marca — siempre las 6 marcas, cada una con su lista completa. */
  byStore: { storeId: string; byTipo: (ErpSalesBreakdown & { tipo: string })[] }[];
}
