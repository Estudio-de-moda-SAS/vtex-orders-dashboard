'use client';

import { useEffect, useState } from 'react';

/**
 * Pestaña activa de una página con varias pestañas (`/smartsale`,
 * `/presupuesto`), recordada en `sessionStorage` — al ir a otra página
 * del navbar y volver, se abre la última pestaña que se estaba viendo en
 * vez de siempre la primera. Mismo criterio que `useDateRangeFilter`:
 * `sessionStorage` (se limpia al cerrar el navegador) y nunca rompe la
 * página si el storage está bloqueado.
 *
 * Se restaura en un efecto (no en el estado inicial) para que el primer
 * render del servidor y del cliente coincidan; solo se aceptan ids de
 * `validIds` (una pestaña que se deshabilitó o renombró no queda pegada).
 */
export function usePersistentTab<T extends string>(storageKey: string, defaultTab: T, validIds: readonly T[]) {
  const [tab, setTabState] = useState<T>(defaultTab);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey) as T | null;
      if (stored && validIds.includes(stored)) setTabState(stored);
    } catch {
      // Storage bloqueado (modo privado) — se queda en la pestaña por defecto.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function setTab(next: T) {
    setTabState(next);
    try {
      sessionStorage.setItem(storageKey, next);
    } catch {
      // Ignorado a propósito — solo implica que no se recordará la pestaña.
    }
  }

  return [tab, setTab] as const;
}
