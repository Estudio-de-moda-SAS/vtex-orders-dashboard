'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';

import { BrandDiscountBreakdown } from '@/components/BrandDiscountBreakdown';
import { CampaignsSection } from '@/components/CampaignsSection';
import { CategoriesSection } from '@/components/CategoriesSection';
import { CategoryBrandRankingTable } from '@/components/CategoryBrandRankingTable';
import { CitiesSection } from '@/components/CitiesSection';
import { CityChart } from '@/components/CityChart';
import { CollectionsByStoreTable } from '@/components/CollectionsByStoreTable';
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
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { DashboardRequestState } from '@/types/dashboard';
import {
  CategoryBrandRankingByStore,
  CategoryContributionResponse,
  CategoryRankingByStore,
  DiscountAnalyticsResponse,
  StoreHighlightsByStore,
} from '@/types/product-analytics';

const STORE_NAMES = ['Pilatos', 'Kipling', 'Diesel', 'Superdry', 'Girbaud', 'Replay'];

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
  const [requestState, setRequestState] = useState<DashboardRequestState>({ status: 'idle' });

  // Analítica de producto (descuentos, categorías, marca) — se consulta en
  // paralelo al dashboard principal, pero es supletoria: no tiene su propia
  // máquina de estados idle/loading/error, simplemente se renderiza en
  // cuanto llega y se ignora mientras tanto (`null`).
  const [discountAnalytics, setDiscountAnalytics] = useState<DiscountAnalyticsResponse | null>(null);
  const [categoryRanking, setCategoryRanking] = useState<CategoryRankingByStore | null>(null);
  const [categoryContribution, setCategoryContribution] = useState<CategoryContributionResponse | null>(null);
  const [categoryBrandRanking, setCategoryBrandRanking] = useState<CategoryBrandRankingByStore | null>(null);
  const [storeHighlights, setStoreHighlights] = useState<StoreHighlightsByStore | null>(null);
  const [resyncState, setResyncState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const runQuery = useCallback(async () => {
    setRequestState({ status: 'loading' });
    try {
      const [data, discount, catRanking, catContribution, catBrandRanking, highlights] = await Promise.all([
        ordersService.getDashboardData(startDate, endDate),
        ordersService.getDiscountAnalytics(startDate, endDate),
        ordersService.getCategoryRanking(startDate, endDate),
        ordersService.getCategoryContribution(startDate, endDate),
        ordersService.getCategoryBrandRanking(startDate, endDate),
        ordersService.getStoreHighlights(startDate, endDate),
      ]);
      setRequestState({ status: 'success', data });
      setDiscountAnalytics(discount);
      setCategoryRanking(catRanking);
      setCategoryContribution(catContribution);
      setCategoryBrandRanking(catBrandRanking);
      setStoreHighlights(highlights);
    } catch (error) {
      setRequestState({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Error inesperado consultando el dashboard.',
      });
    }
  }, [startDate, endDate]);

  // Auto-consulta el rango por defecto (últimos 7 días) al entrar a la
  // página, igual que /descuentos y /tendencias — antes había que
  // presionar "Consultar" manualmente la primera vez.
  useEffect(() => {
    runQuery();
    // Deliberadamente solo al montar: cambiar de fecha sigue requiriendo el botón "Consultar", no dispara la consulta sola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {requestState.status === 'idle' && (
        <p className="rounded-2xl border border-surface-border bg-surface-panel p-6 text-sm text-ink-muted">
          Selecciona un rango de fechas y presiona <strong className="text-ink">Consultar</strong>{' '}
          para ver el consolidado de las seis tiendas.
        </p>
      )}

      {requestState.status === 'loading' && <LoadingState storeNames={STORE_NAMES} />}

      {requestState.status === 'error' && (
        <ErrorState message={requestState.message} onRetry={() => runQuery()} />
      )}

      {requestState.status === 'success' && (
        <>
          <GlobalSummary summary={requestState.data.summary} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {requestState.data.stores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                categoryRanking={categoryRanking?.[store.id]?.categories}
                brandRanking={categoryBrandRanking?.[store.id]}
                cronIntervalHours={requestState.data.cronIntervalHours}
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

          {storeHighlights && (
            <>
              <CampaignsSection
                stores={requestState.data.stores}
                highlights={storeHighlights}
                startDate={startDate}
                endDate={endDate}
              />
              <CollectionsByStoreTable stores={requestState.data.stores} highlights={storeHighlights} />
            </>
          )}

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
