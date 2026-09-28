'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CachedQueryState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

export interface UseCachedQueryOptions {
  /**
   * `true` (default): cambiar `key` (ej. el usuario elige otro filtro)
   * dispara una consulta nueva automáticamente — para filtros de una sola
   * elección (selects), como `/tendencias`. `false`: cambiar `key` por sí
   * solo NO hace nada — solo un `refetch()` explícito (botón "Consultar")
   * dispara la consulta. Necesario en páginas con DOS campos de fecha: sin
   * esto, cambiar el "Desde" ya dispara una consulta con el "Hasta"
   * todavía viejo, antes de que el usuario alcance a terminar de ajustar
   * ambos campos.
   */
  autoFetchOnKeyChange?: boolean;
}

const PREFIX = 'vica-query-cache:';

function readCache<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // sessionStorage llena o bloqueada (modo privado) — no debe romper la consulta, solo no queda cacheada.
  }
}

/**
 * Cachea en `sessionStorage` el resultado de `fetcher` bajo `key` — al
 * volver a una vista ya consultada en esta sesión (misma key = misma
 * página + mismos filtros, ej. `"smartsale:2026-09-01:2026-09-23"`), se
 * muestra el resultado guardado de inmediato en vez de volver a pedirlo
 * al backend solo por navegar entre rutas del navbar. Sobrevive incluso a
 * un refresh del navegador (F5) porque vive en `sessionStorage`, y se
 * limpia solo al cerrar la pestaña — igual que el resto de preferencias
 * de filtro ya guardadas en la app (`useDateRangeFilter`).
 *
 * `refetch()` fuerza una consulta nueva contra el backend y sobrescribe
 * la caché — es lo que debe llamar cualquier botón "Consultar" o
 * "Actualizar".
 *
 * El primer render SIEMPRE revisa la caché (o consulta si no hay nada) —
 * eso es lo que hace que volver a una página ya visitada muestre datos de
 * inmediato. Después de eso, `autoFetchOnKeyChange` decide si un cambio
 * de `key` (ej. el usuario edita un filtro) dispara otra consulta sola, o
 * si hace falta un `refetch()` explícito (ver `UseCachedQueryOptions`).
 */
export function useCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedQueryOptions = {},
) {
  const autoFetchOnKeyChange = options.autoFetchOnKeyChange ?? true;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // `refetch` necesita SIEMPRE la key más reciente al momento en que se
  // llama (ej. el usuario cambió el rango y recién ahí aprieta
  // "Consultar") — de ahí el ref en vez de depender de `key` en el
  // `useCallback` (que dejaría `refetch` con una key vieja entre el
  // cambio de filtro y el siguiente render).
  const keyRef = useRef(key);
  keyRef.current = key;

  const [state, setState] = useState<CachedQueryState<T>>({ status: 'loading' });

  const refetch = useCallback(async () => {
    const currentKey = keyRef.current;
    setState({ status: 'loading' });
    try {
      const data = await fetcherRef.current();
      writeCache(currentKey, data);
      setState({ status: 'success', data });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error inesperado consultando la información.',
      });
    }
  }, []);

  const isFirstRun = useRef(true);

  useEffect(() => {
    if (!isFirstRun.current && !autoFetchOnKeyChange) {
      // El usuario cambió un filtro pero todavía no aprieta "Consultar" —
      // se deja el resultado anterior en pantalla tal cual, sin recargar.
      return;
    }
    isFirstRun.current = false;

    const cached = readCache<T>(keyRef.current);
    if (cached !== undefined) {
      setState({ status: 'success', data: cached });
    } else {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { state, refetch };
}
