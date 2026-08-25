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

/**
 * Subconjunto MÍNIMO del detalle de una orden
 * (`GET /api/oms/pvt/orders/{orderId}`) que la aplicación necesita: solo la
 * ciudad de envío. Deliberadamente no se tipan `clientProfileData` ni el
 * resto de `shippingData.address` (calle, destinatario, teléfono) — esos
 * campos nunca deben leerse ni persistirse, ver `OrderCityEnrichmentService`.
 */
export interface VtexOrderDetailResponse {
  orderId?: string;
  shippingData?: {
    address?: {
      city?: string | null;
    } | null;
  } | null;
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
