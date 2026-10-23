import { AssistantChatMessage } from '@/types/assistant';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Consume `POST /api/assistant/chat` (Server-Sent Events) leyendo el
 * `ReadableStream` de `fetch` directo — sin `EventSource` (que solo soporta
 * GET) ni ninguna librería nueva. Llama `onChunk` por cada trozo de texto
 * que llega, en orden, a medida que el backend lo transmite.
 */
export async function streamAssistantChat(
  question: string,
  history: AssistantChatMessage[],
  onChunk: (text: string) => void,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
    });
  } catch {
    throw new Error('No fue posible conectarse con el backend. Verifique que esté en ejecución y que NEXT_PUBLIC_API_BASE_URL sea correcta.');
  }

  if (!response.ok || !response.body) {
    let message = `Error ${response.status} consultando el asistente`;
    try {
      const body = await response.json();
      if (typeof body?.message === 'string') message = body.message;
    } catch {
      // sin body JSON — se deja el mensaje genérico de arriba.
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const payload = line.replace(/^data: /, '').trim();
      if (!payload || payload === '[DONE]') continue;

      let event: { text?: string; error?: string };
      try {
        event = JSON.parse(payload);
      } catch {
        continue; // línea no parseable como JSON — no debería pasar con el formato del backend, se ignora.
      }
      if (event.error) throw new Error(event.error);
      if (event.text) onChunk(event.text);
    }
  }
}
