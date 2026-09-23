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
  /**
   * "Compras reales": VTEX parte una misma compra en varias órdenes
   * cuando sus productos se despachan por separado (mismo número base de
   * orden, sufijo final `-01`/`-02`... distinto — confirmado con datos
   * reales). Este número agrupa esos fragmentos en UNA sola compra, así
   * que es menor o igual a `totalOrders` — útil para ver el tamaño real
   * de la canasta (¿compran más de un producto por compra?). NO
   * reemplaza `totalOrders`/`revenueOrders` en ningún otro cálculo del
   * dashboard, es un número aparte solo para esta card.
   */
  realOrders: number;
  /** Igual que `realOrders`, pero solo las compras donde ALGÚN fragmento calificó como venta contabilizada. */
  realRevenueOrders: number;
  responseTimeMs: number;
  isConsistent: boolean;
  /**
   * Derivado de `sync_logs`: `true` solo si la corrida MÁS RECIENTE del
   * cron para esta tienda tuvo `status = 'success'` (`lastSyncStatus`).
   * Nunca se hardcodea — si la última corrida falló, esto da `false` para
   * que el frontend siga mostrando la advertencia de datos no refrescados,
   * aunque haya habido una corrida exitosa antes.
   */
  isComplete: boolean;
  /** `finished_at` de la última corrida EXITOSA del cron para esta tienda (`source = 'vtex_api'`), o `null` si nunca hubo una. */
  lastSyncedAt: string | null;
  /** Status de la corrida más RECIENTE del cron para esta tienda (exitosa o no), o `null` si nunca corrió. */
  lastSyncStatus: 'success' | 'error' | 'partial' | null;
  /**
   * Días (YYYY-MM-DD) DENTRO del rango consultado (`filters.startDate`–
   * `filters.endDate`) cuya última sincronización no logró obtener el
   * conteo completo que VTEX reportó — a diferencia de `lastSyncStatus`
   * (que es sobre la corrida más reciente de TODA la tienda, sin importar
   * si tocó estas fechas), esto está ligado exactamente al rango que se
   * está mostrando. Vacío = sin duda conocida para estas fechas
   * específicas (puede seguir habiendo un desfase si nunca se detectó,
   * pero no hay evidencia positiva de uno).
   */
  incompleteDays: string[];
}

/** Forma reducida de `StoreDashboardData` usada por los segmentos (sellers/marketplaces) — es todo lo que `SegmentComparisonTable` necesita. */
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
  /**
   * Segmentos adicionales (vendedores/marketplaces) de las tiendas que los
   * tengan configurados. Sus órdenes YA están incluidas dentro del total
   * de la tienda correspondiente en `stores`; este arreglo es solo para
   * mostrar el desglose por vendedor/marketplace, no se debe volver a sumar
   * al resumen global.
   */
  segments: SegmentDashboardResult[];
  generatedAt: string;
  /** Cada cuántas horas corre el cron de sincronización — el frontend lo usa para estimar la próxima sincronización a partir de `lastSyncedAt` de cada tienda. */
  cronIntervalHours: number;
}
