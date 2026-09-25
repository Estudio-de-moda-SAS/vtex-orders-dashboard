'use client';

import { Suspense, useCallback, useState } from 'react';

import { BrandDiscountBreakdown } from '@/components/BrandDiscountBreakdown';
import { CampaignsSection } from '@/components/CampaignsSection';
import { CategoriesSection } from '@/components/CategoriesSection';
import { CategoryBrandRankingTable } from '@/components/CategoryBrandRankingTable';
import { CitiesSection } from '@/components/CitiesSection';
import { CollectionsByStoreTable } from '@/components/CollectionsByStoreTable';
import { DashboardHeader } from '@/components/DashboardHeader';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { GlobalSummary } from '@/components/GlobalSummary';
import { LoadingState } from '@/components/LoadingState';
import { SegmentComparisonTable } from '@/components/SegmentComparisonTable';
import { StoreCard } from '@/components/StoreCard';
import { StoreComparisonTable } from '@/components/StoreComparisonTable';
import { StoreDiscountBreakdown } from '@/components/StoreDiscountBreakdown';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { DashboardResponse } from '@/types/dashboard';
import {
  CategoryBrandRankingByStore,
  CategoryContributionResponse,
  CategoryRankingByStore,
  DiscountAnalyticsResponse,
  StoreHighlightsByStore,
} from '@/types/product-analytics';

const STORE_NAMES = ['Pilatos', 'Kipling', 'Diesel', 'Superdry', 'Girbaud', 'Replay'];

interface DashboardPageData {
  dashboard: DashboardResponse;
  discountAnalytics: DiscountAnalyticsResponse;
  categoryRanking: CategoryRankingByStore;
  categoryContribution: CategoryContributionResponse;
  categoryBrandRanking: CategoryBrandRankingByStore;
  storeHighlights: StoreHighlightsByStore;
}

/** `useSearchParams` (dentro de `useDateRangeFilter`) exige un límite `<Suspense>` en Next.js App Router. */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-dashboard-range');
  const [resyncState, setResyncState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  // Cacheado en sessionStorage por rango de fechas (ver `useCachedQuery`):
  // volver del navbar (ej. después de visitar /tendencias) muestra este
  // mismo rango al instante, sin volver a consultar el backend. Solo
  // "Consultar" o "Resincronizar" fuerzan una consulta nueva.
  const { state: requestState, refetch: runQuery } = useCachedQuery<DashboardPageData>(
    `dashboard:${startDate}:${endDate}`,
    async () => {
      const [dashboard, discountAnalytics, categoryRanking, categoryContribution, categoryBrandRanking, storeHighlights] =
        await Promise.all([
          ordersService.getDashboardData(startDate, endDate),
          ordersService.getDiscountAnalytics(startDate, endDate),
          ordersService.getCategoryRanking(startDate, endDate),
          ordersService.getCategoryContribution(startDate, endDate),
          ordersService.getCategoryBrandRanking(startDate, endDate),
          ordersService.getStoreHighlights(startDate, endDate),
        ]);
      return { dashboard, discountAnalytics, categoryRanking, categoryContribution, categoryBrandRanking, storeHighlights };
    },
  );

  const isLoading = requestState.status === 'loading';

  /**
   * Recalcula EN VIVO (todas las tiendas) el rango consultado y vuelve a
   * cargar el dashboard — escape manual para cuando el conteo de VTEX no
   * cuadra con lo que muestra el dashboard (ver `resync` en
   * `orders.service.ts`). Puede tardar varios minutos en rangos largos.
   */
  const handleResync = useCallback(async () => {
    setResyncState('loading');
    try {
      await ordersService.resync(startDate, endDate);
      setResyncState('done');
      await runQuery();
    } catch {
      setResyncState('error');
    }
  }, [startDate, endDate, runQuery]);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <DashboardHeader />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onSubmit={() => runQuery()}
        isLoading={isLoading}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-surface-border bg-surface-panel px-4 py-3 text-sm">
        <button
          type="button"
          onClick={handleResync}
          disabled={resyncState === 'loading' || !startDate || !endDate}
          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 font-medium text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resyncState === 'loading' ? 'Resincronizando…' : 'Resincronizar este rango con VTEX'}
        </button>
        <span className="text-ink-faint">
          Si un número no cuadra contra VTEX, esto vuelve a consultar en vivo el rango de fechas de arriba y
          recalcula los datos guardados (puede tardar varios minutos).
        </span>
        {resyncState === 'done' && <span className="font-medium text-positive">✓ Resincronización completa</span>}
        {resyncState === 'error' && <span className="font-medium text-danger">✗ Falló la resincronización</span>}
      </div>

      {requestState.status === 'loading' && <LoadingState storeNames={STORE_NAMES} />}

      {requestState.status === 'error' && (
        <ErrorState message={requestState.message} onRetry={() => runQuery()} />
      )}

      {requestState.status === 'success' && (
        <>
          <GlobalSummary summary={requestState.data.dashboard.summary} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {requestState.data.dashboard.stores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                categoryRanking={requestState.data.categoryRanking[store.id]?.categories}
                brandRanking={requestState.data.categoryBrandRanking[store.id]}
                cronIntervalHours={requestState.data.dashboard.cronIntervalHours}
              />
            ))}
          </div>

          <StoreDiscountBreakdown
            stores={requestState.data.dashboard.stores}
            discountAnalytics={requestState.data.discountAnalytics}
          />
          <BrandDiscountBreakdown discountAnalytics={requestState.data.discountAnalytics} />

          <StoreComparisonTable stores={requestState.data.dashboard.stores} />

          <CampaignsSection
            stores={requestState.data.dashboard.stores}
            highlights={requestState.data.storeHighlights}
            startDate={startDate}
            endDate={endDate}
          />
          <CollectionsByStoreTable stores={requestState.data.dashboard.stores} highlights={requestState.data.storeHighlights} />

          <CategoryBrandRankingTable
            stores={requestState.data.dashboard.stores}
            categoryRanking={requestState.data.categoryRanking}
            categoryBrandRanking={requestState.data.categoryBrandRanking}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SegmentComparisonTable
              title="Comparativo de sellers (Pilatos)"
              emptyLabel="No hay sellers configurados para el rango consultado."
              segments={requestState.data.dashboard.segments.filter((s) => s.type === 'seller')}
            />
            <SegmentComparisonTable
              title="Comparativo de marketplaces (Pilatos)"
              emptyLabel="No hay marketplaces configurados para el rango consultado."
              segments={requestState.data.dashboard.segments.filter((s) => s.type === 'marketplace')}
            />
          </div>

          <CitiesSection stores={requestState.data.dashboard.stores} />

          <CategoriesSection
            stores={requestState.data.dashboard.stores}
            contribution={requestState.data.categoryContribution}
            categoryRanking={requestState.data.categoryRanking}
          />
        </>
      )}
    </main>
  );
}
