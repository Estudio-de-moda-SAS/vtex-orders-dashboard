'use client';

import { useCallback, useMemo, useState } from 'react';

import { BrandDiscountBreakdown } from '@/components/BrandDiscountBreakdown';
import { CategoriesSection } from '@/components/CategoriesSection';
import { CategoryBrandRankingTable } from '@/components/CategoryBrandRankingTable';
import { CitiesSection } from '@/components/CitiesSection';
import { CityChart } from '@/components/CityChart';
import { DashboardHeader } from '@/components/DashboardHeader';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { DiscountDistributionChart } from '@/components/DiscountDistributionChart';
import { ErrorState } from '@/components/ErrorState';
import { GlobalSummary } from '@/components/GlobalSummary';
import { RevenueValueChart } from '@/components/RevenueValueChart';
import { LoadingState } from '@/components/LoadingState';
import { OrdersByStoreChart } from '@/components/OrdersByStoreChart';
import { SegmentComparisonTable } from '@/components/SegmentComparisonTable';
import { StatusChart } from '@/components/StatusChart';
import { StoreCard } from '@/components/StoreCard';
import { StoreComparisonTable } from '@/components/StoreComparisonTable';
import { StoreDiscountBreakdown } from '@/components/StoreDiscountBreakdown';
import { SyncProgressBanner } from '@/components/SyncProgressBanner';
import { useEnrichmentStatusPolling } from '@/hooks/useEnrichmentStatusPolling';
import { useSyncJobsPolling } from '@/hooks/useSyncJobsPolling';
import { getDefaultDateRange } from '@/lib/date';
import { ordersService } from '@/services/orders.service';
import { DashboardRequestState } from '@/types/dashboard';
import {
  CategoryBrandRankingByStore,
  CategoryContributionResponse,
  CategoryRankingByStore,
  DiscountAnalyticsResponse,
} from '@/types/product-analytics';

const STORE_NAMES = ['Pilatos', 'Kipling', 'Diesel', 'Superdry', 'Girbaud', 'Replay'];

export default function DashboardPage() {
  const defaultRange = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [requestState, setRequestState] = useState<DashboardRequestState>({ status: 'idle' });

  // Analítica de producto (descuentos, categorías, marca) — se consulta en
  // paralelo al dashboard principal, pero es supletoria: no tiene su propia
  // máquina de estados idle/loading/error, simplemente se renderiza en
  // cuanto llega y se ignora mientras tanto (`null`).
  const [discountAnalytics, setDiscountAnalytics] = useState<DiscountAnalyticsResponse | null>(null);
  const [categoryRanking, setCategoryRanking] = useState<CategoryRankingByStore | null>(null);
  const [categoryContribution, setCategoryContribution] = useState<CategoryContributionResponse | null>(null);
  const [categoryBrandRanking, setCategoryBrandRanking] = useState<CategoryBrandRankingByStore | null>(null);

  const runQuery = useCallback(
    async (forceRefresh = false) => {
      setRequestState({ status: 'loading' });
      try {
        const [data, discount, catRanking, catContribution, catBrandRanking] = await Promise.all([
          ordersService.getDashboardData(startDate, endDate, forceRefresh),
          ordersService.getDiscountAnalytics(startDate, endDate),
          ordersService.getCategoryRanking(startDate, endDate),
          ordersService.getCategoryContribution(startDate, endDate),
          ordersService.getCategoryBrandRanking(startDate, endDate),
        ]);
        setRequestState({ status: 'success', data });
        setDiscountAnalytics(discount);
        setCategoryRanking(catRanking);
        setCategoryContribution(catContribution);
        setCategoryBrandRanking(catBrandRanking);
      } catch (error) {
        setRequestState({
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Error inesperado consultando el dashboard.',
        });
      }
    },
    [startDate, endDate],
  );

  // Ids de los jobs de backfill en curso (uno por tienda que lo necesite).
  // Se sondean periódicamente; cuando todos terminan, se vuelve a pedir el
  // dashboard automáticamente para reflejar el histórico ya completo.
  const activeJobIds = useMemo(() => {
    if (requestState.status !== 'success') return [];
    const ids = requestState.data.stores
      .map((s) => s.data?.syncJobId)
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(ids));
  }, [requestState]);

  const handleBackfillComplete = useCallback(() => {
    runQuery(false);
  }, [runQuery]);

  const { jobs: syncJobs } = useSyncJobsPolling(activeJobIds, handleBackfillComplete);

  // Ids de las tiendas con datos exitosos, para sondear su enriquecimiento
  // de producto (ciudad, descuento, categoría, marca) — vacío mientras no
  // haya un dashboard cargado, lo que detiene el sondeo automáticamente.
  const enrichmentStoreIds = useMemo(() => {
    if (requestState.status !== 'success') return [];
    return requestState.data.stores.filter((s) => s.success).map((s) => s.id);
  }, [requestState]);

  const { statusByStore: enrichmentStatusByStore } = useEnrichmentStatusPolling(
    enrichmentStoreIds,
    startDate,
    endDate,
  );

  const isLoading = requestState.status === 'loading';

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <DashboardHeader />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onSubmit={() => runQuery(false)}
        onForceRefresh={() => runQuery(true)}
        isLoading={isLoading}
        hasResults={requestState.status === 'success'}
      />

      {requestState.status === 'idle' && (
        <p className="rounded-2xl border border-surface-border bg-surface-panel p-6 text-sm text-ink-muted">
          Selecciona un rango de fechas y presiona <strong className="text-ink">Consultar</strong>{' '}
          para ver el consolidado de las seis tiendas.
        </p>
      )}

      {requestState.status === 'loading' && <LoadingState storeNames={STORE_NAMES} />}

      {requestState.status === 'error' && (
        <ErrorState message={requestState.message} onRetry={() => runQuery(false)} />
      )}

      {requestState.status === 'success' && (
        <>
          <SyncProgressBanner jobs={syncJobs} enrichmentStatusByStore={enrichmentStatusByStore} />

          <GlobalSummary summary={requestState.data.summary} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {requestState.data.stores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                generatedAt={requestState.data.generatedAt}
                enrichmentComplete={enrichmentStatusByStore[store.id]?.isComplete ?? false}
                categoryRanking={categoryRanking?.[store.id]?.categories}
                brandRanking={categoryBrandRanking?.[store.id]}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <OrdersByStoreChart stores={requestState.data.stores} />
            <RevenueValueChart stores={requestState.data.stores} />
            <StatusChart stores={requestState.data.stores} />
            <CityChart stores={requestState.data.stores} />
            {discountAnalytics && (
              <DiscountDistributionChart stores={requestState.data.stores} discountAnalytics={discountAnalytics} />
            )}
          </div>

          {discountAnalytics && (
            <StoreDiscountBreakdown stores={requestState.data.stores} discountAnalytics={discountAnalytics} />
          )}
          {discountAnalytics && <BrandDiscountBreakdown discountAnalytics={discountAnalytics} />}

          <StoreComparisonTable stores={requestState.data.stores} />

          {categoryRanking && categoryBrandRanking && (
            <CategoryBrandRankingTable
              stores={requestState.data.stores}
              categoryRanking={categoryRanking}
              categoryBrandRanking={categoryBrandRanking}
            />
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SegmentComparisonTable
              title="Comparativo de sellers (Pilatos)"
              emptyLabel="No hay sellers configurados para el rango consultado."
              segments={requestState.data.segments.filter((s) => s.type === 'seller')}
            />
            <SegmentComparisonTable
              title="Comparativo de marketplaces (Pilatos)"
              emptyLabel="No hay marketplaces configurados para el rango consultado."
              segments={requestState.data.segments.filter((s) => s.type === 'marketplace')}
            />
          </div>

          <CitiesSection stores={requestState.data.stores} />

          {categoryContribution && categoryRanking && (
            <CategoriesSection
              stores={requestState.data.stores}
              contribution={categoryContribution}
              categoryRanking={categoryRanking}
            />
          )}
        </>
      )}
    </main>
  );
}
