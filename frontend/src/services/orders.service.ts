import { DashboardResponse, StoreInfo } from '@/types/dashboard';
import {
  CampaignComboTotalsByStore,
  CategoryBrandRankingByStore,
  CategoryContributionResponse,
  CategoryRankingByStore,
  DiscountAnalyticsResponse,
  StoreHighlightsByStore,
} from '@/types/product-analytics';
import { PilatosMixResponse } from '@/types/pilatos-mix';
import { TrendsResponse } from '@/types/trends';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Cliente HTTP centralizado hacia el backend. Los componentes de React
 * nunca deben construir URLs ni llamar `fetch` directamente: siempre
 * pasan por este servicio. El backend es el único que conoce las
 * credenciales de VTEX; este cliente solo habla con nuestro propio backend.
 */
async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'No fue posible conectarse con el backend. Verifique que esté en ejecución y que NEXT_PUBLIC_API_BASE_URL sea correcta.',
    );
  }

  if (!response.ok) {
    const body = await safeParseJson(response);
    const message = extractErrorMessage(body) ?? `Error ${response.status} consultando el backend`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/** Igual que `request`, pero POST sin body — usado por `resync`, que puede tardar varios minutos (recalcula EN VIVO contra VTEX), así que no lleva timeout propio: se deja correr hasta que el backend responda. */
async function postRequest<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'No fue posible conectarse con el backend. Verifique que esté en ejecución y que NEXT_PUBLIC_API_BASE_URL sea correcta.',
    );
  }

  if (!response.ok) {
    const body = await safeParseJson(response);
    const message = extractErrorMessage(body) ?? `Error ${response.status} consultando el backend`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  return undefined;
}

export const ordersService = {
  /**
   * Obtiene la información consolidada del dashboard para el rango de
   * fechas dado. Las fechas se envían en formato `YYYY-MM-DD`; el backend
   * se encarga de la conversión a UTC. El backend NUNCA consulta VTEX en
   * esta llamada — lee agregados pre-calculados por el cron de
   * sincronización, con la frescura de su última corrida
   * (`lastSyncedAt`/`lastSyncStatus` por tienda).
   */
  getDashboardData(startDate: string, endDate: string): Promise<DashboardResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    return request<DashboardResponse>(`/api/orders/dashboard?${params.toString()}`);
  },

  getStores(): Promise<StoreInfo[]> {
    return request<StoreInfo[]>('/api/stores');
  },

  /** Distribución de descuentos (global + por tienda) para el rango dado. */
  getDiscountAnalytics(startDate: string, endDate: string): Promise<DiscountAnalyticsResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    return request<DiscountAnalyticsResponse>(`/api/analytics/discounts?${params.toString()}`);
  },

  /** Ranking de categorías por tienda (todas las órdenes, sin filtrar por status) — "Categoría top" de cada `StoreCard`. */
  getCategoryRanking(startDate: string, endDate: string): Promise<CategoryRankingByStore> {
    const params = new URLSearchParams({ startDate, endDate });
    return request<CategoryRankingByStore>(`/api/analytics/categories?${params.toString()}`);
  },

  /** Aporte de cada categoría sobre el total de ventas contabilizadas (general + por tienda) — para el recuadro de aporte general y su filtro. */
  getCategoryContribution(startDate: string, endDate: string): Promise<CategoryContributionResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    return request<CategoryContributionResponse>(`/api/analytics/category-contribution?${params.toString()}`);
  },

  /** Para cada tienda, la marca top dentro de cada categoría (solo aplica a tiendas multimarca — ver `CategoryBrandRankingResult`). */
  getCategoryBrandRanking(startDate: string, endDate: string): Promise<CategoryBrandRankingByStore> {
    const params = new URLSearchParams({ startDate, endDate });
    return request<CategoryBrandRankingByStore>(`/api/analytics/category-brands?${params.toString()}`);
  },

  /** Para cada tienda, la campaña de descuento más usada y el estado de venta contabilizado más común. */
  getStoreHighlights(startDate: string, endDate: string): Promise<StoreHighlightsByStore> {
    const params = new URLSearchParams({ startDate, endDate });
    return request<StoreHighlightsByStore>(`/api/analytics/store-highlights?${params.toString()}`);
  },

  /**
   * Total REAL (sin doble conteo) de las campañas de descuento dadas, por
   * tienda — a diferencia de sumar filas de `getStoreHighlights`, esto sí
   * es exacto aunque una orden haya calificado para varias campañas a la
   * vez. `campaignNames` no puede venir vacío (ver `CampaignComboQueryDto`).
   *
   * `campaigns` va como UN SOLO parámetro con el arreglo codificado en
   * JSON — ni unido por comas (varios nombres reales traen una coma
   * dentro de sí, ej. "BAZAR bermudas girbaud $69,900") ni repetido como
   * `campaigns=A&campaigns=B` (con más de 20 valores, `qs` — el parser de
   * query strings de Express — los convierte en un objeto con índices en
   * vez de un arreglo). Ambos casos confirmados como bugs reales en
   * producción con el filtro "bazar" (27 campañas).
   */
  getCampaignComboTotal(startDate: string, endDate: string, campaignNames: string[]): Promise<CampaignComboTotalsByStore> {
    const params = new URLSearchParams({ startDate, endDate, campaigns: JSON.stringify(campaignNames) });
    return request<CampaignComboTotalsByStore>(`/api/analytics/campaign-combo-total?${params.toString()}`);
  },

  /** Comparativo año contra año (módulo `/tendencias`) — `startMonth`/`endMonth`/`storeId` opcionales (`startMonth === endMonth` aísla un solo mes). */
  getTrends(year: number, startMonth?: number, endMonth?: number, storeId?: string): Promise<TrendsResponse> {
    const params = new URLSearchParams({ year: String(year) });
    if (startMonth) params.set('startMonth', String(startMonth));
    if (endMonth) params.set('endMonth', String(endMonth));
    if (storeId) params.set('storeId', storeId);
    return request<TrendsResponse>(`/api/analytics/trends?${params.toString()}`);
  },

  /** Mezcla de venta directa vs. sellers/marketplaces en el tiempo (módulo `/pilatos`) — exclusivo Pilatos. */
  getPilatosMix(startDate: string, endDate: string): Promise<PilatosMixResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    return request<PilatosMixResponse>(`/api/analytics/pilatos-mix?${params.toString()}`);
  },

  /**
   * Recalcula EN VIVO (todas las tiendas) el rango de fechas dado —
   * escape manual para cuando el conteo de VTEX no cuadra con el
   * dashboard (ver `SyncStatusController.resync`). Puede tardar varios
   * minutos en rangos largos; el caller debe mostrar un estado de carga.
   */
  resync(startDate: string, endDate: string): Promise<{ ok: true }> {
    const params = new URLSearchParams({ startDate, endDate });
    return postRequest<{ ok: true }>(`/api/sync/resync?${params.toString()}`);
  },
};
