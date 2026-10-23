'use client';

import { useState } from 'react';
import Image from 'next/image';

import { AssistantChat } from '@/components/AssistantChat';

/**
 * Botón flotante global (estilo widget de WhatsApp) montado una sola vez
 * en `layout.tsx` — el asistente queda accesible desde cualquier página,
 * no es una ruta aparte. El panel queda SIEMPRE montado (se oculta con
 * `hidden`, nunca se desmonta) para que `AssistantChat` conserve su
 * historial tanto al cerrar/abrir como al navegar entre páginas — el
 * widget vive fuera de `{children}` en el layout, así que no se reinicia
 * con la navegación. La conversación solo se pierde al recargar la
 * página (comportamiento esperado, no hay persistencia en el servidor).
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={`fixed bottom-24 right-4 z-50 ${open ? 'flex' : 'hidden'} h-[32rem] max-h-[calc(100vh-7rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-panel shadow-2xl sm:right-6`}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Image
              src="/vico-avatar.png"
              alt="Vico"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-ink">Vico</span>
              <span className="text-[11px] text-ink-faint">Agente con IA de VICA</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar asistente"
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <AssistantChat />
        </div>
      </div>

      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 sm:right-6">
        {!open && (
          <div className="rounded-2xl bg-surface-panel px-3 py-2 text-xs font-medium text-ink shadow-xl">
            ¡Soy Vico! Pregúntame
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
          className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-white shadow-xl transition hover:brightness-110 ${
            open ? '' : 'animate-vico-bounce'
          }`}
        >
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <Image src="/vico-avatar.png" alt="Vico" width={56} height={56} className="h-full w-full object-cover" />
          )}
        </button>
      </div>
    </>
  );
}
