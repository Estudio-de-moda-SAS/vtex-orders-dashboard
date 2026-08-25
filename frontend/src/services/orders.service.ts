import { DashboardResponse, StoreInfo, SyncJob } from '@/types/dashboard';

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
   * se encarga de la conversión a UTC. Internamente el backend combina
   * caché histórico local + consulta en vivo; si hay un backfill grande
   * pendiente, la respuesta llega con `syncInProgress: true` en las
   * tiendas afectadas y un `syncJobId` para hacer seguimiento.
   *
   * `forceRefresh` ignora el caché para el rango pedido (botón de
   * "forzar actualización").
   */
  getDashboardData(
    startDate: string,
    endDate: string,
    forceRefresh = false,
  ): Promise<DashboardResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (forceRefresh) params.set('forceRefresh', 'true');
    return request<DashboardResponse>(`/api/orders/dashboard?${params.toString()}`);
  },

  getStores(): Promise<StoreInfo[]> {
    return request<StoreInfo[]>('/api/stores');
  },

  /** Consulta el progreso de un job de sincronización en segundo plano. */
  getSyncJobStatus(jobId: string): Promise<SyncJob> {
    return request<SyncJob>(`/api/sync/jobs/${jobId}`);
  },
};
