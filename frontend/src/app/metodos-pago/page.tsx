'use client';

import { useState } from 'react';

import { getYearToDateRange } from '@/lib/date';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { ErrorState } from '@/components/ErrorState';
import { ParticipationLineChart } from '@/components/ParticipationLineChart';
import { ParticipationSemaphoreTable } from '@/components/ParticipationSemaphoreTable';
import { ordersService } from '@/services/orders.service';
import { PaymentMethodsTrendResponse } from '@/types/payment-methods-trend';

const STORES = [
  { id: 'pilatos', name: 'Pilatos' },
  { id: 'kipling', name: 'Kipling' },
  { id: 'diesel', name: 'Diesel' },
  { id: 'superdry', name: 'Superdry' },
  { id: 'girbaud', name: 'Girbaud' },
  { id: 'replay', name: 'Replay' },
];

/** "YYYY-MM-DD" local del navegador — cambia una vez al día, así la caché de esta página se renueva sola cada día sin necesidad de un filtro de fechas. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sin selector de rango de fechas a propósito, igual que `/pilatos`: esta
 * vista siempre muestra el año en curso completo (1 de enero a hoy) — es
 * un análisis de tendencia anual, no una consulta puntual como
 * Dashboard/Descuentos. El único filtro es la tienda (vacío = todas
 * combinadas), para comparar qué método funciona mejor en cada una.
 */
export default function MetodosPagoPage() {
  const [storeId, setStoreId] = useState<string>('');

  const { state: requestState, refetch: runQuery } = useCachedQuery<PaymentMethodsTrendResponse>(
    `metodos-pago:${todayKey()}:${storeId}`,
    () => {
      const { startDate, endDate } = getYearToDateRange();
      return ordersService.getPaymentMethodsTrend(startDate, endDate, storeId || undefined);
    },
  );

  const isLoading = requestState.status === 'loading';
  const storeName = STORES.find((s) => s.id === storeId)?.name;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Métodos de pago
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
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Tendencia de métodos de pago</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Cómo evoluciona mes a mes la participación de cada método de pago sobre el total vendido, y si esa
          participación viene creciendo o cayendo. Ventas contabilizadas del año en curso. Los métodos con menor
          volumen (sobre todo etiquetas internas de marketplace) se agrupan en &quot;Otros métodos&quot; para que el
          gráfico se pueda leer.
        </p>
      </header>

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        Tienda
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">Todas las tiendas</option>
          {STORES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {isLoading && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Consultando métodos de pago…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={runQuery} />}

      {requestState.status === 'success' && (
        <>
          <ParticipationLineChart
            title="Participación por método de pago"
            subtitle={`% del total contabilizado ${
              storeName ? `de ${storeName}` : '(todas las tiendas)'
            }, mes a mes. El tooltip muestra también el total del mes y la venta en pesos de cada método.`}
            series={requestState.data.participation}
            axisLabel="% del total vendido"
          />
          <ParticipationSemaphoreTable
            title="Participación de cada método, mes a mes"
            series={requestState.data.participation}
            rowLabel="Método de pago"
            totalLabel={storeName ?? 'todas las tiendas'}
          />
        </>
      )}
    </main>
  );
}
