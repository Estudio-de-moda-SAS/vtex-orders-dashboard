'use client';

import { useCallback, useEffect, useState } from 'react';

import { ErrorState } from '@/components/ErrorState';
import { ParticipationLineChart } from '@/components/ParticipationLineChart';
import { ParticipationSemaphoreTable } from '@/components/ParticipationSemaphoreTable';
import { getYearToDateRange } from '@/lib/date';
import { ordersService } from '@/services/orders.service';
import { PilatosMixResponse } from '@/types/pilatos-mix';

type RequestState =
  | { status: 'loading' }
  | { status: 'success'; data: PilatosMixResponse }
  | { status: 'error'; message: string };

/**
 * Sin selector de rango de fechas a propósito: esta vista siempre
 * muestra el año en curso completo (1 de enero a hoy) — es un análisis
 * de tendencia anual, no una consulta puntual como Dashboard/Descuentos.
 */
export default function PilatosPage() {
  const [requestState, setRequestState] = useState<RequestState>({ status: 'loading' });

  const runQuery = useCallback(async () => {
    setRequestState({ status: 'loading' });
    try {
      const { startDate, endDate } = getYearToDateRange();
      const data = await ordersService.getPilatosMix(startDate, endDate);
      setRequestState({ status: 'success', data });
    } catch (error) {
      setRequestState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error inesperado consultando la mezcla de Pilatos.',
      });
    }
  }, []);

  useEffect(() => {
    runQuery();
  }, [runQuery]);

  const isLoading = requestState.status === 'loading';

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Pilatos · Sellers y marketplaces
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Mezcla de canales de venta</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Exclusivo Pilatos (la única tienda con sellers/marketplaces configurados) — cómo evoluciona mes a mes la
          venta de cada seller externo y cada canal de marketplace, y si su participación sobre el total viene
          creciendo o cayendo. Ventas contabilizadas del año en curso.
        </p>
      </header>

      {isLoading && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Consultando mezcla de canales…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={runQuery} />}

      {requestState.status === 'success' && (
        <>
          <ParticipationLineChart
            title="Sellers"
            subtitle="% de participación sobre el total contabilizado de Pilatos, mes a mes. Cada seller se calcula por separado (consulta filtrada por f_sellerNames). No incluye 'Pilatos total' (ver dashboard principal)."
            series={requestState.data.sellerParticipation}
          />
          <ParticipationSemaphoreTable title="Participación de sellers, mes a mes" series={requestState.data.sellerParticipation} />

          <ParticipationLineChart
            title="Marketplaces"
            subtitle="% de participación sobre el total contabilizado de Pilatos, mes a mes. Cada canal se calcula por separado (consulta filtrada por salesChannelId). No incluye 'Pilatos total' (ver dashboard principal)."
            series={requestState.data.marketplaceParticipation}
          />
          <ParticipationSemaphoreTable
            title="Participación de marketplaces, mes a mes"
            series={requestState.data.marketplaceParticipation}
          />
        </>
      )}
    </main>
  );
}
