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

export interface ErpSalesSyncResult {
  saved: number;
  excluded: Record<string, number>;
}
