'use client';

import { useEffect, useRef, useState } from 'react';

import { ordersService } from '@/services/orders.service';
import { EnrichmentStatus } from '@/types/product-analytics';

interface UseEnrichmentStatusPollingResult {
  /** Estado de enriquecimiento por tienda, para el rango consultado. Vacío mientras no ha llegado la primera respuesta. */
  statusByStore: Record<string, EnrichmentStatus>;
  /** `true` mientras al menos una tienda tenga `isComplete: false`. */
  isPolling: boolean;
}

/**
 * Sondea el estado de enriquecimiento (ciudad + descuento + categoría +
 * marca) de una lista de tiendas para el rango de fechas dado, cada
 * `intervalMs`, hasta que todas queden `isComplete: true`. A diferencia
 * de `useSyncJobsPolling` (backfill histórico, que sí tiene un final
 * claro), el enriquecimiento es un proceso continuo — por eso el
 * intervalo por defecto es mucho más espaciado (20s vs. los 2s del
 * backfill): no hay urgencia de refrescar la pantalla apenas termine,
 * solo de mantener informado sin generar tráfico innecesario.
 *
 * Si se vuelve a consultar el dashboard (nuevo rango de fechas u otras
 * tiendas), el efecto se reinicia solo — igual que `useSyncJobsPolling`.
 */
export function useEnrichmentStatusPolling(
  storeIds: string[],
  startDate: string,
  endDate: string,
  intervalMs = 20000,
): UseEnrichmentStatusPollingResult {
  const [statusByStore, setStatusByStore] = useState<Record<string, EnrichmentStatus>>({});
  // Espejo síncrono del último estado conocido, solo para que el
  // `setInterval` pueda decidir "¿ya están todas completas?" sin leer
  // `statusByStore` directamente (evitaría un closure obsoleto) ni meter
  // esa lectura dentro de un updater de `setState` (que debe ser puro).
  const latestRef = useRef<Record<string, EnrichmentStatus>>({});

  useEffect(() => {
    if (storeIds.length === 0) {
      setStatusByStore({});
      latestRef.current = {};
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const results = await Promise.all(
          storeIds.map((storeId) => ordersService.getEnrichmentStatus(storeId, startDate, endDate)),
        );
        if (cancelled) return;
        const next = Object.fromEntries(results.map((status) => [status.storeId, status]));
        latestRef.current = next;
        setStatusByStore(next);
      } catch {
        // Si falla el sondeo (ej. backend momentáneamente no disponible),
        // simplemente se reintenta en el próximo tick — no rompe la UI.
      }
    };

    poll();
    const interval = setInterval(() => {
      const allComplete = storeIds.every((id) => latestRef.current[id]?.isComplete);
      if (!allComplete) poll();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIds.join(','), startDate, endDate, intervalMs]);

  const values = Object.values(statusByStore);
  const isPolling = values.length > 0 && values.some((status) => !status.isComplete);

  return { statusByStore, isPolling };
}
