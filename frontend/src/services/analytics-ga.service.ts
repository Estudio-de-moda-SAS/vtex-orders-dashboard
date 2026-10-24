import {
  GaCampaignsResponse,
  GaChannelsResponse,
  GaCitiesResponse,
  GaDevicesResponse,
  GaLandingPagesResponse,
  GaOverviewResponse,
  GaProductsResponse,
  GaSyncStatusResponse,
  GaUserTypesResponse,
} from '@/types/ga-analytics';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Cliente HTTP del módulo GA4 — mismo patrón que `orders.service.ts`
 * (duplica `request`/`safeParseJson`/`extractErrorMessage` a propósito:
 * no existe un `http.ts` compartido en este proyecto todavía, y cada
 * servicio de dominio mantiene su propia copia chica, ver convención
 * existente). El backend es el único que habla con Google; este cliente
 * solo habla con nuestro propio backend.
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

/** Mismo patrón que `request`, en POST — usado por `resyncGa`. */
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

/** Mismo desanidado que `orders.service.ts` — ver ese archivo para el porqué (`AllExceptionsFilter` del backend anida `message.message`). */
function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(', ');
  if (message && typeof message === 'object') {
    const inner = (message as { message?: unknown }).message;
    if (typeof inner === 'string') return inner;
    if (Array.isArray(inner)) return inner.join(', ');
  }
  return undefined;
}

export const analyticsGaService = {
  /** Totales, embudo y serie diaria por tienda (módulo `/analytics`). `storeId` opcional: sin él, las 6 tiendas. */
  getGaOverview(startDate: string, endDate: string, storeId?: string): Promise<GaOverviewResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<GaOverviewResponse>(`/api/analytics/ga/overview?${params.toString()}`);
  },

  /** Desglose por canal de adquisición (`sessionDefaultChannelGroup` de GA4). */
  getGaChannels(startDate: string, endDate: string, storeId?: string): Promise<GaChannelsResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<GaChannelsResponse>(`/api/analytics/ga/channels?${params.toString()}`);
  },

  /** Desglose por tipo de dispositivo, con conversión "según Analytics" (distinta de la conversión real del cruce con ventas). */
  getGaDevices(startDate: string, endDate: string, storeId?: string): Promise<GaDevicesResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<GaDevicesResponse>(`/api/analytics/ga/devices?${params.toString()}`);
  },

  /** Top 20 páginas de entrada por día/tienda (el resto se agrupa en "(otros)", ver backend). */
  getGaLandingPages(startDate: string, endDate: string, storeId?: string): Promise<GaLandingPagesResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<GaLandingPagesResponse>(`/api/analytics/ga/landing-pages?${params.toString()}`);
  },

  /** Desglose por usuarios nuevos vs. recurrentes (`newVsReturning` de GA4), con conversión/ingresos de cada segmento. */
  getGaUserTypes(startDate: string, endDate: string, storeId?: string): Promise<GaUserTypesResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<GaUserTypesResponse>(`/api/analytics/ga/user-types?${params.toString()}`);
  },

  /** Top 20 ciudades por día/tienda, por interacción (el resto se agrupa en "(otros)", ver backend). */
  getGaCities(startDate: string, endDate: string, storeId?: string): Promise<GaCitiesResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<GaCitiesResponse>(`/api/analytics/ga/cities?${params.toString()}`);
  },

  /** Top 20 productos por vistas (el resto se agrupa en "(otros)", ver backend) — con vistas/carrito/compras/ingresos de ESE producto. */
  getGaProducts(startDate: string, endDate: string, storeId?: string): Promise<GaProductsResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<GaProductsResponse>(`/api/analytics/ga/products?${params.toString()}`);
  },

  /** Desglose por campaña (UTM) + fuente/medio — SIN tope Top 20, trae TODAS las campañas del rango (ver backend). */
  getGaCampaigns(startDate: string, endDate: string, storeId?: string): Promise<GaCampaignsResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<GaCampaignsResponse>(`/api/analytics/ga/campaigns?${params.toString()}`);
  },

  /** Última sincronización de GA4 por tienda (`sync_logs`, fuente `ga4_api`) — para mostrar frescura/fallas en `/analytics`. */
  getGaSyncStatus(): Promise<GaSyncStatusResponse> {
    return request<GaSyncStatusResponse>('/api/analytics/ga/sync-status');
  },

  /**
   * Dispara EN VIVO una sincronización de GA4 para el rango dado (las 6
   * tiendas), sin esperar el cooldown normal del cron — escape manual
   * para cuando el cron no corrió a tiempo o falló. A diferencia del
   * resync de VTEX, no expone progreso: GA4 solo trae reportes agregados
   * (sin enriquecer orden por orden), tarda segundos, no minutos.
   */
  resyncGa(startDate: string, endDate: string): Promise<{ ok: true }> {
    const params = new URLSearchParams({ startDate, endDate });
    return postRequest<{ ok: true }>(`/api/analytics/ga/resync?${params.toString()}`);
  },
};
