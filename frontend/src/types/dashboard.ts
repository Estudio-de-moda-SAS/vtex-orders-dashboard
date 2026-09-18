export interface StoreInfo {
  id: string;
  name: string;
  color: string;
  configured: boolean;
}

export interface PaymentMethodBreakdown {
  count: number;
  percentage: number;
}

/**
 * Órdenes y valor generado por una ciudad de envío (`shippingData.address.city`
 * de VTEX), considerando TODAS las órdenes (igual que `paymentMethods`,
 * sin filtrar por status de revenue) — por eso la suma de `totalValue` de
 * todas las ciudades no tiene por qué coincidir con `revenueTotalValue`;
 * se prioriza cobertura completa (incluyendo órdenes recientes que
 * todavía no llegan a un status "contabilizado") sobre esa coincidencia
 * exacta. `percentage` es sobre ese VALOR total (no sobre el conteo de
 * órdenes), ya que el objetivo es "cuánto genera a la venta esa ciudad".
 * Las órdenes sin ciudad resuelta (todavía no enriquecidas, o sin
 * `shippingData.address` en VTEX — ej. retiro en tienda) se agrupan bajo la
 * key "Sin ciudad".
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
 * ciudades aquí SÍ coincide con `revenueTotalValue`. Se usa para comparar
 * el aporte de una ciudad contra "lo que realmente se vendió" (ej. el
 * recuadro de aporte general por ciudad), a diferencia de `cityBreakdown`
 * (cobertura completa, incluye órdenes recientes que todavía no llegan a
 * un status contabilizado).
 */
export type CityRevenueBreakdown = CityBreakdown;

/** Órdenes y valor acumulado para un estado "contabilizado" (invoiced, payment-approved, handling, checking-invoice). */
export interface RevenueStatusBreakdown {
  orders: number;
  value: number;
}

export interface StoreDashboardData {
  totalOrders: number;
  /** Órdenes cuyo status está entre los "contabilizados": invoiced, payment-approved, handling, checking-invoice. */
  revenueOrders: number;
  /** Suma de `totalValue` de esas mismas órdenes contabilizadas. */
  revenueTotalValue: number;
  /** Desglose de `revenueOrders`/`revenueTotalValue` por cada estado "contabilizado", indexado por su key. */
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
   * `true` solo si la corrida MÁS RECIENTE del cron de sincronización
   * para esta tienda tuvo éxito (`lastSyncStatus === 'success'`). Si la
   * última corrida falló, esto da `false` — los datos no son parciales
   * (siempre reflejan la última corrida exitosa), pero pueden no estar
   * tan frescos como se espera.
   */
  isComplete: boolean;
  /** `finished_at` de la última corrida EXITOSA del cron para esta tienda, o `null` si nunca hubo una. */
  lastSyncedAt: string | null;
  /** Status de la corrida más reciente del cron (exitosa o no), o `null` si nunca corrió. */
  lastSyncStatus: 'success' | 'error' | 'partial' | null;
}

/** Forma reducida de `StoreDashboardData` para segmentos (sellers/marketplaces) — todo lo que `SegmentComparisonTable` necesita. */
export interface SegmentDashboardData {
  totalOrders: number;
  revenueOrders: number;
  revenueTotalValue: number;
}

export interface StoreDashboardResult {
  id: string;
  name: string;
  color: string;
  success: boolean;
  error?: string;
  data?: StoreDashboardData;
}

/** Desglose por vendedor (seller) o canal de marketplace dentro de una tienda. */
export interface SegmentDashboardResult {
  id: string;
  storeId: string;
  label: string;
  type: 'seller' | 'marketplace';
  success: boolean;
  error?: string;
  data?: SegmentDashboardData;
}

export interface GlobalSummary {
  totalOrders: number;
  totalRevenueOrders: number;
  totalRevenueValue: number;
  /** Suma, entre todas las tiendas, del desglose por estado "contabilizado". */
  totalRevenueBreakdown: Record<string, RevenueStatusBreakdown>;
  storesQueried: number;
  storesWithErrors: number;
  /** Tiendas cuya última corrida del cron falló (ver `StoreDashboardData.isComplete`/`lastSyncStatus`). */
  storesWithIncompleteData: number;
}

export interface DashboardResponse {
  filters: {
    startDate: string;
    endDate: string;
  };
  summary: GlobalSummary;
  stores: StoreDashboardResult[];
  segments: SegmentDashboardResult[];
  generatedAt: string;
}

export type DashboardRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DashboardResponse }
  | { status: 'error'; message: string };
