/**
 * Representa una orden tal como la retorna VTEX en el listado
 * `/api/oms/pvt/orders`. Solo se tipan los campos que la aplicación
 * utiliza; VTEX puede retornar campos adicionales.
 */
export interface VtexOrder {
  orderId: string;
  creationDate: string;
  clientName?: string;
  totalValue: number;
  paymentNames?: string;
  status: string;
  statusDescription?: string;
  sequence?: string;
  salesChannel?: string;
  affiliateId?: string;
  origin?: string;
  orderIsComplete?: boolean;
  totalItems?: number;
  currencyCode?: string;
  hostname?: string;
  invoiceOutput?: string[];
  /**
   * Ciudad de envío, ya normalizada (ver `city-normalize.util.ts`). El
   * listado `/api/oms/pvt/orders` NUNCA trae este campo — solo aparece
   * aquí cuando el pedido se leyó del caché local DESPUÉS de que
   * `OrderCityEnrichmentService` lo enriqueció consultando el detalle de
   * la orden en VTEX (ver `OrdersCacheRepository.getOrdersInRange`).
   * `undefined` mientras no se haya revisado; `''` si ya se revisó pero
   * VTEX no reportó ciudad (ej. retiro en tienda) — `groupByCity` trata
   * ambos casos igual, como "Sin ciudad".
   */
  city?: string;
}

/** Un producto dentro de `VtexOrderDetailResponse.items`. */
export interface VtexOrderDetailItem {
  id?: string;
  ean?: string | null;
  name?: string;
  quantity?: number;
  /** Precio de lista (unidad cruda de VTEX, sin normalizar — ver `VtexOrdersService.normalizeMoney`). */
  price?: number;
  /** Precio de venta real, ya con descuento aplicado (unidad cruda de VTEX). */
  sellingPrice?: number;
  additionalInfo?: {
    brandName?: string | null;
    /**
     * De más específica a más general (ej. ["Gorras", "Accesorios",
     * "Hombre"]) — el primer elemento es la categoría de más bajo nivel,
     * la que se usa para el análisis de categorías (ver
     * `ProductAnalyticsService`).
     */
    categories?: { id?: number; name?: string }[] | null;
  } | null;
}

/**
 * Una campaña/beneficio de descuento aplicado a la orden completa (no a
 * un ítem). El nombre en `name` coincide carácter por carácter con la
 * columna `Discounts Names` del Excel histórico — confirmado con una
 * respuesta real de VTEX vía Postman.
 */
export interface VtexRateAndBenefitsIdentifier {
  name?: string;
}

/**
 * Subconjunto del detalle de una orden (`GET /api/oms/pvt/orders/{orderId}`)
 * que la aplicación necesita: ciudad de envío + los datos de producto
 * usados por el agregador diario (descuento, categoría, marca, campaña de
 * descuento). Deliberadamente NO se tipan `clientProfileData` ni el resto
 * de `shippingData.address` (calle, destinatario, teléfono) — esos campos
 * nunca deben leerse ni persistirse, ver `order-item-extract.util.ts`.
 *
 * La clasificación de seller/marketplace NO usa el detalle de la orden:
 * se resuelve por CUÁL consulta de listado filtrada (`f_sellerNames`/
 * `salesChannelId`) la devolvió — ver `source-definitions.util.ts` y
 * `vtex-sync-cron.service.ts`.
 */
export interface VtexOrderDetailResponse {
  orderId?: string;
  shippingData?: {
    address?: {
      city?: string | null;
    } | null;
  } | null;
  items?: VtexOrderDetailItem[] | null;
  ratesAndBenefitsData?: {
    rateAndBenefitsIdentifiers?: VtexRateAndBenefitsIdentifier[] | null;
  } | null;
}

/** Un nodo del árbol de categorías (`catalog_system/pub/category/tree`). Aplanado recursivamente por `fetchCategoryTree`. */
export interface VtexCategoryTreeNode {
  id: number;
  name: string;
  children?: VtexCategoryTreeNode[] | null;
}

export interface VtexPaging {
  total: number;
  pages: number;
  currentPage: number;
  perPage: number;
}

export interface VtexOrdersResponse {
  list: VtexOrder[];
  paging: VtexPaging;
}
