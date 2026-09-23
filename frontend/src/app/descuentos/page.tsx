'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';

import { BrandDiscountBreakdown } from '@/components/BrandDiscountBreakdown';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { DiscountDistributionChart } from '@/components/DiscountDistributionChart';
import { ErrorState } from '@/components/ErrorState';
import { StoreDiscountBreakdown } from '@/components/StoreDiscountBreakdown';
import { topBucketStats } from '@/lib/discount';
import { formatPercentage } from '@/lib/format';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { DashboardResponse } from '@/types/dashboard';
import { DiscountAnalyticsResponse, DiscountDistribution } from '@/types/product-analytics';

/** A partir de este % de descuento se considera "alto" para el indicador de dependencia. */
const HIGH_DISCOUNT_THRESHOLD = 40;

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; dashboard: DashboardResponse; discounts: DiscountAnalyticsResponse }
  | { status: 'error'; message: string };

/**
 * % de unidades a precio normal (0%) y % con descuento alto (>=
 * HIGH_DISCOUNT_THRESHOLD) — pero ESTOS DOS NÚMEROS SOLOS PUEDEN
 * ENGAÑAR: si el bucket más vendido es, por ejemplo, 20% (ni "normal" ni
 * "alto" según este corte), ese 20% quedaría invisible en el resumen
 * aunque sea la mayoría de la venta. Por eso siempre se muestra también
 * `topBucketStats` (el bucket real más vendido) junto a estos dos, nunca
 * en su lugar.
 */
function healthSummary(distribution: DiscountDistribution): { normalPercent: number; highDiscountPercent: number } | null {
  if (distribution.totalItems === 0) return null;
  const normalCount = distribution.buckets.find((b) => b.bucket === 0)?.count ?? 0;
  const highCount = distribution.buckets
    .filter((b) => b.bucket >= HIGH_DISCOUNT_THRESHOLD)
    .reduce((acc, b) => acc + b.count, 0);
  return {
    normalPercent: (normalCount / distribution.totalItems) * 100,
    highDiscountPercent: (highCount / distribution.totalItems) * 100,
  };
}

/** `useSearchParams` (dentro de `useDateRangeFilter`) exige un límite `<Suspense>` en Next.js App Router. */
export default function DescuentosPage() {
  return (
    <Suspense fallback={null}>
      <DescuentosContent />
    </Suspense>
  );
}

function DescuentosContent() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-descuentos-range');
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });

  const runQuery = useCallback(async () => {
    setRequestState({ status: 'loading' });
    try {
      const [dashboard, discounts] = await Promise.all([
        ordersService.getDashboardData(startDate, endDate),
        ordersService.getDiscountAnalytics(startDate, endDate),
      ]);
      setRequestState({ status: 'success', dashboard, discounts });
    } catch (error) {
      setRequestState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error inesperado consultando descuentos.',
      });
    }
  }, [startDate, endDate]);

  useEffect(() => {
    runQuery();
  }, [runQuery]);

  const isLoading = requestState.status === 'loading';
  const summary = requestState.status === 'success' ? healthSummary(requestState.discounts.global) : null;
  const topBucket = requestState.status === 'success' ? topBucketStats(requestState.discounts.global) : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Descuentos
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Análisis de descuentos</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Distribución de descuentos aplicados en el rango seleccionado — revela si el negocio depende de descuentos
          altos para vender, o si la mayoría se mueve a precio normal.
        </p>
      </header>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onSubmit={() => runQuery()}
        isLoading={isLoading}
      />

      {isLoading && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Consultando descuentos…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && (
        <>
          {summary && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Descuento más vendido</p>
                <p className="font-display text-2xl font-semibold text-ink">
                  {topBucket ? `${topBucket.bucket}%` : '—'}
                </p>
                {topBucket && (
                  <p className="text-xs text-ink-faint">{formatPercentage(topBucket.percentage)} de las unidades</p>
                )}
              </div>
              <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">A precio normal (0%)</p>
                <p className="font-display text-2xl font-semibold text-positive">
                  {formatPercentage(summary.normalPercent)}
                </p>
              </div>
              <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                  Con descuento alto (≥{HIGH_DISCOUNT_THRESHOLD}%)
                </p>
                <p
                  className={`font-display text-2xl font-semibold ${
                    summary.highDiscountPercent >= 40 ? 'text-danger' : 'text-warning'
                  }`}
                >
                  {formatPercentage(summary.highDiscountPercent)}
                </p>
              </div>
            </div>
          )}

          <DiscountDistributionChart stores={requestState.dashboard.stores} discountAnalytics={requestState.discounts} />
          <StoreDiscountBreakdown stores={requestState.dashboard.stores} discountAnalytics={requestState.discounts} />
          <BrandDiscountBreakdown discountAnalytics={requestState.discounts} />
        </>
      )}
    </main>
  );
}
