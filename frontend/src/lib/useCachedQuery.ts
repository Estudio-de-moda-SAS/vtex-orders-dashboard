'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CachedQueryState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

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
 * "Actualizar": la única forma de refrescar es pedirlo explícitamente.
 *
 * Cambiar `key` (ej. el usuario elige otro rango de fechas) dispara una
 * consulta nueva automáticamente SI esa combinación no estaba ya en
 * caché; si ya se había consultado antes en esta misma sesión, se sirve
 * de ahí también.
 */
export function useCachedQuery<T>(key: string, fetcher: () => Promise<T>) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // SIEMPRE arranca en 'loading', nunca leyendo `sessionStorage` acá — el
  // servidor (SSR) no tiene `sessionStorage`, así que si este inicializador
  // dependiera de la caché, el HTML del servidor y el primer render del
  // cliente podrían diferir (uno en "loading", el otro ya en "success"),
  // lo que React reporta como error de hidratación. La caché se revisa en
  // el `useEffect` de abajo, que solo corre en el cliente, después de que
  // el primer render ya coincidió con el del servidor.
  const [state, setState] = useState<CachedQueryState<T>>({ status: 'loading' });

  const refetch = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await fetcherRef.current();
      writeCache(key, data);
      setState({ status: 'success', data });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error inesperado consultando la información.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const cached = readCache<T>(key);
    if (cached !== undefined) {
      setState({ status: 'success', data: cached });
    } else {
      refetch();
    }
    // Deliberadamente solo depende de `key`: cambiar de filtro (que cambia
    // la key) sí dispara una consulta nueva si hace falta, pero un
    // `fetcher` recreado en cada render (closures sobre props/estado) no
    // debe volver a disparar nada por sí solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { state, refetch };
}
