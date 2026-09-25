/**
 * Formas de datos compartidas entre el cron de VTEX
 * (`vtex-sync-cron.service.ts`) y el importador de Excel
 * (`cli/import-historical-orders.ts`) — ambos alimentan el MISMO
 * `daily-aggregator.ts` para no duplicar reglas de negocio entre las dos
 * fuentes. Todo campo aquí ya viene resuelto/normalizado (ciudad,
 * categoría, marca, colección, descuento) — el agregador solo suma, no
 * enriquece ni clasifica contra catálogo.
 */

export interface EnrichedOrderItem {
  skuId: string;
  ean: string;
  /** Ya resuelta, nunca vacía — "Sin categoría" si no se pudo determinar. */
  category: string;
  /** Ya resuelta, nunca vacía — "Sin marca" si no se pudo determinar. */
  brand: string;
  /** Ya resuelta, nunca vacía — "Sin colección" si el SKU no está en ninguna colección configurada. */
  collectionName: string;
  quantity: number;
  /** Precio de lista normalizado (misma unidad que `sellingPrice`/`totalValue`). */
  listPrice: number;
  /** Precio de venta normalizado. */
  sellingPrice: number;
  /** Ya redondeado al múltiplo de 5 más cercano — ver `computeDiscountPercentage`. */
  discountPercentage: number;
}

export interface EnrichedOrder {
  orderId: string;
  storeId: string;
  /** Día calendario de Colombia (YYYY-MM-DD) — ver `date-range.util.ts`. */
  dayBucket: string;
  status: string;
  statusDescription?: string | null;
  /** Valor total de la orden, ya normalizado a pesos reales. */
  totalValue: number;
  /** Tal cual lo entrega VTEX/Excel — puede traer varios separados por coma. */
  paymentNames?: string | null;
  /** Ya resuelta, nunca vacía — "Sin ciudad" si VTEX no reportó ciudad de envío. */
  city: string;
  items: EnrichedOrderItem[];
  /** Nombres de campaña de descuento a nivel de ORDEN completa (puede venir vacío). */
  discountCampaignNames: string[];
  /**
   * Nombre comercial del seller (ej. "Disandina S.A.S"), ya comparado
   * contra `store.extraSegments.sellers` — `null` si la orden no
   * corresponde a ningún seller configurado (incluye el caso "no es
   * Pilatos" o "es la marca propia, no un seller externo").
   */
  sellerLabel?: string | null;
  /**
   * Label del canal de marketplace (ej. "Dafiti"), determinado por CUÁL
   * fuente de VTEX devolvió esta orden (consulta filtrada por
   * `salesChannelId`) — `null` si la orden no vino de ninguna fuente de
   * marketplace configurada.
   */
  marketplaceLabel?: string | null;
  /**
   * `marketingData.utmiCampaign` de VTEX — identifica al vendedor del
   * canal SmartSale que originó la orden, o `null` si no vino de ese
   * canal (ver `config/smartsale.config.ts`). Sin histórico a propósito:
   * nunca se guardó antes de agregar este campo, así que solo existe
   * para órdenes sincronizadas de aquí en adelante.
   */
  utmiCampaign: string | null;
}

/** Fila de `sales_daily` — sin columnas revenue_*, ver nota en la migración. */
export interface SalesDailyRow {
  date: string;
  storeId: string;
  orders: number;
  units: number;
  sales: number;
  discounts: number;
  /**
   * "Compras reales": `orders` deduplicado agrupando fragmentos de una
   * misma compra que VTEX partió por logística de envío (mismo número
   * base, sufijo `-01`/`-02`... distinto) — ver `extractOrderBaseId` en
   * `daily-aggregator.ts`. Solo se usa en la card de cada tienda, nunca
   * reemplaza `orders` en ninguna otra tabla/cálculo.
   */
  realOrders: number;
  /** Igual que `realOrders`, pero solo los grupos donde ALGÚN fragmento calificó como venta contabilizada. */
  realRevenueOrders: number;
}

export interface SalesDailyByStatusRow {
  date: string;
  storeId: string;
  status: string;
  orders: number;
  sales: number;
}

export interface SalesDailyByPaymentRow {
  date: string;
  storeId: string;
  paymentMethod: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

export interface SalesDailyByCityRow {
  date: string;
  storeId: string;
  city: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

export interface SalesDailyByCategoryRow {
  date: string;
  storeId: string;
  categoryName: string;
  units: number;
  sales: number;
  revenueUnits: number;
  revenueSales: number;
}

export interface SalesDailyByBrandRow {
  date: string;
  storeId: string;
  brandName: string;
  units: number;
  sales: number;
  revenueUnits: number;
  revenueSales: number;
}

export interface SalesDailyByCollectionRow {
  date: string;
  storeId: string;
  collectionName: string;
  units: number;
  sales: number;
  revenueUnits: number;
  revenueSales: number;
}

export interface SalesDailyByDiscountCampaignRow {
  date: string;
  storeId: string;
  campaignName: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

/**
 * Una orden aporta a UNA sola fila de esta tabla: la de la combinación
 * EXACTA de campañas que tuvo (ordenadas y sin repetir, ver
 * `buildCampaignComboKey`), no una fila por cada campaña individual como
 * `SalesDailyByDiscountCampaignRow`. Por construcción, cada orden cae en
 * EXACTAMENTE un combo — así, sumar `orders`/`sales` de todos los combos
 * que contienen ALGUNA campaña de un conjunto elegido (`campaignNames &&
 * seleccionadas`) da el total REAL de esas campañas, sin doble conteo,
 * sin importar cuántas campañas de la selección tenga cada combo.
 */
export interface SalesDailyByCampaignComboRow {
  date: string;
  storeId: string;
  /** Clave canónica estable (nombres ordenados y unidos) — PK junto con date/storeId, ver migración 0005. */
  comboKey: string;
  /** Mismos nombres que `comboKey`, como arreglo — para consultar con el operador `&&` de Postgres. */
  campaignNames: string[];
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

export interface SalesDailyByDiscountBucketRow {
  date: string;
  storeId: string;
  discountPercentage: number;
  units: number;
  sales: number;
}

export interface SalesDailyByCategoryBrandRow {
  date: string;
  storeId: string;
  categoryName: string;
  brandName: string;
  units: number;
  sales: number;
}

/** Cruce colección × categoría (ej. "Rack" × "Camisetas") — aplica a TODAS las tiendas, no solo multimarca. */
export interface SalesDailyByCollectionCategoryRow {
  date: string;
  storeId: string;
  collectionName: string;
  categoryName: string;
  units: number;
  sales: number;
}

export interface SalesDailyByBrandDiscountBucketRow {
  date: string;
  storeId: string;
  brandName: string;
  discountPercentage: number;
  units: number;
  sales: number;
}

export interface SalesDailyBySellerRow {
  date: string;
  storeId: string;
  sellerName: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

export interface SalesDailyByMarketplaceRow {
  date: string;
  storeId: string;
  marketplaceName: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

/**
 * Filas del canal SmartSale (`config/smartsale.config.ts`) — mismo shape
 * que su tabla `by_*` general correspondiente, pero solo para órdenes
 * cuyo `utmiCampaign` coincide con un vendedor configurado. Tablas
 * PARALELAS, no una columna nueva en las generales — ver migración 0007.
 */
export interface SmartSaleByPersonRow {
  date: string;
  storeId: string;
  utmiCampaign: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}
export interface SmartSaleByDiscountBucketRow {
  date: string;
  storeId: string;
  discountPercentage: number;
  units: number;
  sales: number;
}
export interface SmartSaleByDiscountCampaignRow {
  date: string;
  storeId: string;
  campaignName: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}
export interface SmartSaleByCategoryRow {
  date: string;
  storeId: string;
  categoryName: string;
  units: number;
  sales: number;
  revenueUnits: number;
  revenueSales: number;
}
export interface SmartSaleByCategoryBrandRow {
  date: string;
  storeId: string;
  categoryName: string;
  brandName: string;
  units: number;
  sales: number;
}
export interface SmartSaleByCityRow {
  date: string;
  storeId: string;
  city: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}
export interface SmartSaleBySellerRow {
  date: string;
  storeId: string;
  sellerName: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}
export interface SmartSaleByMarketplaceRow {
  date: string;
  storeId: string;
  marketplaceName: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

/** Igual que `SalesDailyByCampaignComboRow`, pero solo para órdenes del canal SmartSale — ver migración 0008. */
export interface SmartSaleByCampaignComboRow {
  date: string;
  storeId: string;
  comboKey: string;
  campaignNames: string[];
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

/** Todas las filas producidas por `aggregateDailyRows` para un lote de órdenes. */
export interface DailyAggregationResult {
  salesDaily: SalesDailyRow[];
  byStatus: SalesDailyByStatusRow[];
  byPayment: SalesDailyByPaymentRow[];
  byCity: SalesDailyByCityRow[];
  byCategory: SalesDailyByCategoryRow[];
  byBrand: SalesDailyByBrandRow[];
  byCategoryBrand: SalesDailyByCategoryBrandRow[];
  byCollectionCategory: SalesDailyByCollectionCategoryRow[];
  byCollection: SalesDailyByCollectionRow[];
  byDiscountCampaign: SalesDailyByDiscountCampaignRow[];
  byCampaignCombo: SalesDailyByCampaignComboRow[];
  byDiscountBucket: SalesDailyByDiscountBucketRow[];
  byBrandDiscountBucket: SalesDailyByBrandDiscountBucketRow[];
  bySeller: SalesDailyBySellerRow[];
  byMarketplace: SalesDailyByMarketplaceRow[];
  /** Canal SmartSale — ver `SmartSaleByPersonRow` y migración 0007. */
  smartSaleByPerson: SmartSaleByPersonRow[];
  smartSaleByDiscountBucket: SmartSaleByDiscountBucketRow[];
  smartSaleByDiscountCampaign: SmartSaleByDiscountCampaignRow[];
  smartSaleByCategory: SmartSaleByCategoryRow[];
  smartSaleByCategoryBrand: SmartSaleByCategoryBrandRow[];
  smartSaleByCity: SmartSaleByCityRow[];
  smartSaleBySeller: SmartSaleBySellerRow[];
  smartSaleByMarketplace: SmartSaleByMarketplaceRow[];
  smartSaleByCampaignCombo: SmartSaleByCampaignComboRow[];
}
