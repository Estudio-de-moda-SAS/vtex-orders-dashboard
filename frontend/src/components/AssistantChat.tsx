'use client';

import { FormEvent, useRef, useState } from 'react';

import { streamAssistantChat } from '@/services/assistant.service';
import { AssistantChatMessage } from '@/types/assistant';
import { AssistantMarkdown } from '@/components/AssistantMarkdown';

/**
 * Chat del asistente — sin estado en el servidor entre preguntas: el
 * frontend reenvía TODO el historial en cada pregunta (ver
 * `assistant.service.ts`). El texto de la respuesta se va pintando a
 * medida que llega por SSE, no se espera a que termine completa. Vive
 * dentro de `AssistantWidget` (botón flotante en toda la app) — llena
 * el alto que le da su contenedor, no tiene uno propio fijo.
 */
export function AssistantChat() {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || isStreaming) return;

    const historyForRequest = messages;
    setMessages((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setIsStreaming(true);

    try {
      await streamAssistantChat(question, historyForRequest, (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado consultando al asistente.');
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 text-sm text-ink-muted">
            <p>
              Soy Vico. Pregúntame por ventas, presupuesto o notas crédito de cualquier tienda — por ejemplo
              &ldquo;¿cuánto vendió Pilatos ayer?&rdquo; o &ldquo;¿cómo va Kipling este mes contra el presupuesto?&rdquo;
            </p>
            <p className="text-xs text-ink-faint">
              Por ahora no responde preguntas sobre campañas, el diagnóstico de tráfico/conversión/ticket de{' '}
              <span className="font-medium">/resumen</span>, ni cortes de Analytics — esas llegan en una fase futura.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-2 text-sm ${
                  message.role === 'user' ? 'whitespace-pre-wrap bg-accent text-white' : 'bg-surface text-ink'
                }`}
              >
                {message.role === 'assistant' ? (
                  <AssistantMarkdown text={message.content || (isStreaming && index === messages.length - 1 ? '…' : '')} />
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {error && <p className="border-t border-surface-border px-4 py-2 text-sm text-red-600 sm:px-6">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-surface-border p-3 sm:p-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta..."
          disabled={isStreaming}
          className="flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {isStreaming ? 'Pensando…' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}
