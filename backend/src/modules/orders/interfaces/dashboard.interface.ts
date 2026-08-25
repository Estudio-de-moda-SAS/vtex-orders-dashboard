/**
 * Estructuras de la respuesta consolidada que el backend entrega al frontend.
 * Estas interfaces son el "contrato" entre backend y frontend: cualquier
 * cambio aquí debe reflejarse en `frontend/src/types`.
 */

export interface PaymentMethodBreakdown {
  count: number;
  percentage: number;
}

/** Órdenes y valor acumulado para un estado "contabilizado" (ver `revenue-status.config.ts`). */
export interface RevenueStatusBreakdown {
  orders: number;
  value: number;
}

/**
 * Órdenes y valor generado por una ciudad de envío, considerando TODAS
 * las órdenes obtenidas (igual que `paymentMethods`, sin filtrar por
 * status de revenue) — por eso la suma de `totalValue` de todas las
 * ciudades no tiene por qué coincidir con `revenueTotalValue`: se
 * prioriza mostrar cobertura completa (incluyendo órdenes recientes que
 * todavía no llegan a un status "contabilizado") sobre esa coincidencia
 * exacta. `percentage` es sobre ese VALOR total (no sobre el conteo de
 * órdenes), ya que el objetivo es "cuánto genera a la venta esa ciudad".
 * Las órdenes sin ciudad resuelta (no enriquecidas todavía, o sin
 * `shippingData.address` en VTEX) se agrupan bajo la key "Sin ciudad".
 */
export interface CityBreakdown {
  count: number;
  totalValue: number;
  percentage: number;
}

/**
 * Igual forma que `CityBreakdown`, pero considerando ÚNICAMENTE las
 * órdenes "contabilizadas" (las mismas que `revenueOrders`/
 * `revenueTotalValue`) — por eso la suma de `totalValue` de todas las
 * ciudades aquí SÍ coincide con `revenueTotalValue`. Se usa donde hace
 * falta comparar el aporte de una ciudad contra "lo que realmente se
 * vendió" (ej. el recuadro de aporte general por ciudad del frontend),
 * a diferencia de `cityBreakdown` (cobertura completa, incluye órdenes
 * recientes que todavía no llegan a un status contabilizado).
 */
export type CityRevenueBreakdown = CityBreakdown;

export interface StoreDashboardData {
  /** Total de órdenes (todas las órdenes obtenidas, sin importar el status). */
  totalOrders: number;
  /**
   * Cantidad de órdenes cuyo status está en la lista "contabilizada"
   * (invoiced, payment-approved, handling, checking-invoice). Ver
   * `config/revenue-status.config.ts`.
   */
  revenueOrders: number;
  /** Suma de `totalValue` de esas mismas órdenes contabilizadas. */
  revenueTotalValue: number;
  /** Desglose de `revenueOrders`/`revenueTotalValue` por cada estado "contabilizado", indexado por `key` (invoiced, payment-approved, handling, checking-invoice). */
  revenueBreakdown: Record<string, RevenueStatusBreakdown>;
  currencyCode: string;
  statusCounts: Record<string, number>;
  paymentMethods: Record<string, PaymentMethodBreakdown>;
  /** Desglose por ciudad de envío, indexado por nombre de ciudad normalizado (o "Sin ciudad"). */
  cityBreakdown: Record<string, CityBreakdown>;
  /** Igual que `cityBreakdown`, pero solo con órdenes "contabilizadas" — ver `CityRevenueBreakdown`. */
  cityRevenueBreakdown: Record<string, CityRevenueBreakdown>;
  responseTimeMs: number;
  isConsistent: boolean;
  /**
   * `false` si todavía hay días "cerrados" (fuera de la ventana de
   * inmutabilidad) que nunca se han sincronizado al caché local, o si la
   * consulta en vivo de la ventana mutable (los últimos días) falló. El
   * frontend debe mostrar una advertencia visible cuando esto ocurra, en
   * vez de mostrar un total silenciosamente parcial.
   */
  isComplete: boolean;
  /** `true` si hay un job de sincronización en segundo plano trayendo días pendientes para esta tienda. */
  syncInProgress: boolean;
  /** Id del job de sincronización en curso, si `syncInProgress` es `true` (para poder consultar su progreso). */
  syncJobId?: string;
  /** Cuántos días históricos ("cerrados") todavía no se han sincronizado al caché local. */
  pendingClosedDays: number;
}

export interface StoreDashboardResult {
  id: string;
  name: string;
  color: string;
  success: boolean;
  error?: string;
  data?: StoreDashboardData;
}

/**
 * Resultado de un segmento adicional dentro de una tienda (por ejemplo,
 * un vendedor/seller o un canal de marketplace en Pilatos). Comparte la
 * misma forma de indicadores que una tienda (`StoreDashboardData`), pero
 * representa un subconjunto de sus órdenes, no una tienda completa.
 */
export interface SegmentDashboardResult {
  /** Identificador único, ej. "pilatos:seller:armo-studio" */
  id: string;
  /** Tienda a la que pertenece este segmento. */
  storeId: string;
  /** Nombre comercial a mostrar. */
  label: string;
  /** Tipo de segmento. */
  type: 'seller' | 'marketplace';
  success: boolean;
  error?: string;
  data?: StoreDashboardData;
}

export interface GlobalSummary {
  totalOrders: number;
  totalRevenueOrders: number;
  totalRevenueValue: number;
  /** Suma, entre todas las tiendas, del desglose por estado "contabilizado". */
  totalRevenueBreakdown: Record<string, RevenueStatusBreakdown>;
  storesQueried: number;
  storesWithErrors: number;
  /** Tiendas que respondieron exitosamente pero con datos incompletos (ver `StoreDashboardData.isComplete`). */
  storesWithIncompleteData: number;
  /** Tiendas con un backfill en segundo plano actualmente en curso. */
  storesSyncing: number;
}

export interface DashboardResponse {
  filters: {
    startDate: string;
    endDate: string;
  };
  summary: GlobalSummary;
  stores: StoreDashboardResult[];
  /**
   * Segmentos adicionales (vendedores/marketplaces) de las tiendas que los
   * tengan configurados. Sus órdenes YA están incluidas dentro del total
   * de la tienda correspondiente en `stores`; este arreglo es solo para
   * mostrar el desglose por vendedor/marketplace, no se debe volver a sumar
   * al resumen global.
   */
  segments: SegmentDashboardResult[];
  generatedAt: string;
}
