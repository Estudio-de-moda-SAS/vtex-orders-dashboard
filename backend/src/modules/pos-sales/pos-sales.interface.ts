/** Una fila tal cual la entrega la API "Conní" (`estudiodemoda_Ventas_Smartsale_Pos`). */
export interface PosSaleApiRow {
  fecha: string;
  co: string | null;
  nro_documento: string;
  tipo_docto: string;
  id_tipo: string | null;
  tipo: string | null;
  id_categoria: string | null;
  categoria: string | null;
  id_marca: string | null;
  marca: string;
  id_item: number | null;
  referencia: string | null;
  descripcion_item: string | null;
  nit_vendedor: string | null;
  nombre_vendedor: string | null;
  cantidad_inv: number | null;
  valor_bruto: number | null;
  valor_descuento: number | null;
  valor_neto: number | null;
}

export interface PosSalesSellerSummary {
  nitVendedor: string;
  /** Nombre amigable (`friendlyPosSellerName`), no el crudo de la API. */
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

/** `units` (no `orders`): un documento puede tener varias categorías a la vez — ver comentario de `PosSalesCategoryRow` en el repositorio. */
export interface PosSalesCategorySummary {
  categoria: string;
  units: number;
  sales: number;
}

export interface PosSalesSummaryResponse {
  filters: { startDate: string; endDate: string };
  /** DEFINITIVO: incluye fletes y YA RESTA las notas crédito. */
  totalSales: number;
  /** Subconjunto de `totalSales` — solo informativo. */
  totalFreight: number;
  /** YA incluido (restado) en `totalSales` — se muestra aparte solo como referencia, no hay que restarlo de nuevo. */
  totalCreditNotes: number;
  totalOrders: number;
  averageTicket: number;
  /** Combinando las 6 tiendas — para el cuadro "Total por vendedor". */
  bySeller: PosSalesSellerSummary[];
  byStore: PosSalesStoreSummary[];
  /**
   * Desglose por marca REAL dentro de Pilatos únicamente (la única tienda
   * multimarca) — NO cambia el total de Pilatos en `byStore`, es un corte
   * adicional para ver cuál marca vende más dentro de esa tienda.
   */
  pilatosByBrand: PosSalesBrandSummary[];
  /** Combinando las 6 tiendas — categoría CRUDA de POS, sin normalizar contra las categorías de VTEX. */
  byCategory: PosSalesCategorySummary[];
}
