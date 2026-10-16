import { CreditNotesSummaryResponse } from '@/types/credit-notes';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/** Mismo patrón `request`/`safeParseJson`/`extractErrorMessage` que el resto de los servicios (ver `orders.service.ts`). */
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

export const creditNotesService = {
  /** Resumen de notas crédito (por día, por marca, detalle) — lectura SQL pura, nunca llama a la API del ERP en vivo (eso requiere VPN, ver README). `storeId` opcional. */
  getSummary(startDate: string, endDate: string, storeId?: string): Promise<CreditNotesSummaryResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) params.set('storeId', storeId);
    return request<CreditNotesSummaryResponse>(`/api/credit-notes/summary?${params.toString()}`);
  },
};
