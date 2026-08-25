'use client';

import { useEffect, useRef, useState } from 'react';

import { ordersService } from '@/services/orders.service';
import { SyncJob } from '@/types/dashboard';

interface UseSyncJobsPollingResult {
  jobs: SyncJob[];
  /** `true` mientras al menos un job siga en curso (pending o running). */
  isPolling: boolean;
}

/**
 * Sondea el estado de una lista de jobs de sincronización en segundo
 * plano cada `intervalMs`, hasta que todos terminen (completados o
 * fallidos). Llama a `onAllComplete` una sola vez cuando eso ocurre, para
 * que la pantalla pueda refrescar el dashboard automáticamente.
 */
export function useSyncJobsPolling(
  jobIds: string[],
  onAllComplete: () => void,
  intervalMs = 2000,
): UseSyncJobsPollingResult {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const onAllCompleteRef = useRef(onAllComplete);
  onAllCompleteRef.current = onAllComplete;
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (jobIds.length === 0) {
      setJobs([]);
      return;
    }

    notifiedRef.current = false;
    let cancelled = false;

    const poll = async () => {
      try {
        const results = await Promise.all(jobIds.map((id) => ordersService.getSyncJobStatus(id)));
        if (cancelled) return;
        setJobs(results);

        const allDone = results.every((j) => j.status === 'completed' || j.status === 'failed');
        if (allDone && !notifiedRef.current) {
          notifiedRef.current = true;
          onAllCompleteRef.current();
        }
      } catch {
        // Si falla el sondeo (ej. backend momentáneamente no disponible),
        // simplemente se reintenta en el próximo tick — no rompe la UI.
      }
    };

    poll();
    const interval = setInterval(() => {
      if (!notifiedRef.current) poll();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIds.join(','), intervalMs]);

  const isPolling = jobs.length > 0 && jobs.some((j) => j.status === 'pending' || j.status === 'running');

  return { jobs, isPolling };
}
