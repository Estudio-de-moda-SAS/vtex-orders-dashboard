'use client';

import { getYearToDateRange } from '@/lib/date';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { ErrorState } from '@/components/ErrorState';
import { ParticipationLineChart } from '@/components/ParticipationLineChart';
import { ParticipationSemaphoreTable } from '@/components/ParticipationSemaphoreTable';
import { ordersService } from '@/services/orders.service';
import { PilatosMixResponse } from '@/types/pilatos-mix';

/** "YYYY-MM-DD" local del navegador — cambia una vez al día, así la caché de esta página se renueva sola cada día sin necesidad de un filtro. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sin selector de rango de fechas a propósito: esta vista siempre
 * muestra el año en curso completo (1 de enero a hoy) — es un análisis
 * de tendencia anual, no una consulta puntual como Dashboard/Descuentos.
 * Cacheado en sessionStorage por día: volver a esta página en el mismo
 * día (ej. después de visitar otra ruta del navbar) no vuelve a
 * consultar — el botón "Actualizar" fuerza una consulta nueva igual.
 */
export default function PilatosPage() {
  const { state: requestState, refetch: runQuery } = useCachedQuery<PilatosMixResponse>(`pilatos:${todayKey()}`, () => {
    const { startDate, endDate } = getYearToDateRange();
    return ordersService.getPilatosMix(startDate, endDate);
  });

  const isLoading = requestState.status === 'loading';

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Pilatos · Sellers y marketplaces
          </div>
          <button
            type="button"
            onClick={() => runQuery()}
            disabled={isLoading}
            className="rounded-lg border border-surface-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted transition hover:bg-surface-panel disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Actualizando…' : 'Actualizar'}
          </button>
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
