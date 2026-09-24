'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';

import { CategoriesSection } from '@/components/CategoriesSection';
import { CategoryBrandRankingTable } from '@/components/CategoryBrandRankingTable';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { SegmentComparisonTable } from '@/components/SegmentComparisonTable';
import { SmartSaleCampaignsSection } from '@/components/SmartSaleCampaignsSection';
import { SmartSaleCitiesSection } from '@/components/SmartSaleCitiesSection';
import { SmartSaleSummarySection } from '@/components/SmartSaleSummarySection';
import { SmartSaleTrendSection } from '@/components/SmartSaleTrendSection';
import { StoreDiscountBreakdown } from '@/components/StoreDiscountBreakdown';
import { getTodayRange } from '@/lib/date';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { CityBreakdown, SegmentDashboardResult, StoreDashboardResult } from '@/types/dashboard';
import {
  CategoryBrandRankingByStore,
  CategoryContributionResponse,
  CategoryRankingByStore,
  DiscountAnalyticsResponse,
} from '@/types/product-analytics';
import {
  SmartSaleCampaignsByStore,
  SmartSaleMonthlyTrendPoint,
  SmartSaleSegmentsResponse,
  SmartSaleSummaryByStore,
} from '@/types/smartsale';

interface SmartSaleData {
  stores: StoreDashboardResult[];
  summary: SmartSaleSummaryByStore;
  monthlyTrend: SmartSaleMonthlyTrendPoint[];
  discounts: DiscountAnalyticsResponse;
  campaigns: SmartSaleCampaignsByStore;
  categories: CategoryRankingByStore;
  categoryContribution: CategoryContributionResponse;
  categoryBrands: CategoryBrandRankingByStore;
  cities: Record<string, Record<string, CityBreakdown>>;
  segments: SmartSaleSegmentsResponse;
}

type RequestState =
  | { status: 'loading' }
  | { status: 'success'; data: SmartSaleData }
  | { status: 'error'; message: string };

/** Convierte "sellers"/"marketplaces" de SmartSale al shape de `SegmentDashboardResult` para reusar `SegmentComparisonTable` tal cual. */
/**
 * Fecha FIJA en que este código empezó a capturar `utmiCampaign` — no
 * "hoy" (que cambiaría de significado cada día que alguien lea la
 * página). Antes de esta fecha nunca se guardó el dato, sin importar
 * cuándo se consulte; desde esta fecha en adelante sí, para siempre.
 */
const SMARTSALE_LAUNCH_YEAR = 2026;
const SMARTSALE_LAUNCH_MONTH = 9;

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function toSegments(entries: SmartSaleSegmentsResponse['sellers'], type: 'seller' | 'marketplace'): SegmentDashboardResult[] {
  return entries.map((e) => ({
    id: `${e.storeId}:${type}:${e.label}`,
    storeId: e.storeId,
    label: e.label,
    type,
    success: true,
    data: { totalOrders: e.orders, revenueOrders: e.orders, revenueTotalValue: e.sales },
  }));
}

/** `useSearchParams` (dentro de `useDateRangeFilter`) exige un límite `<Suspense>` en Next.js App Router. */
export default function SmartSalePage() {
  return (
    <Suspense fallback={null}>
      <SmartSaleContent />
    </Suspense>
  );
}

function SmartSaleContent() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-smartsale-range', getTodayRange);
  const [requestState, setRequestState] = useState<RequestState>({ status: 'loading' });

  const runQuery = useCallback(async () => {
    setRequestState({ status: 'loading' });
    try {
      const [dashboard, summary, monthlyTrend, discounts, campaigns, categories, categoryContribution, categoryBrands, cities, segments] =
        await Promise.all([
          ordersService.getDashboardData(startDate, endDate),
          ordersService.getSmartSaleSummary(startDate, endDate),
          ordersService.getSmartSaleMonthlyTrend(),
          ordersService.getSmartSaleDiscounts(startDate, endDate),
          ordersService.getSmartSaleCampaigns(startDate, endDate),
          ordersService.getSmartSaleCategories(startDate, endDate),
          ordersService.getSmartSaleCategoryContribution(startDate, endDate),
          ordersService.getSmartSaleCategoryBrands(startDate, endDate),
          ordersService.getSmartSaleCities(startDate, endDate),
          ordersService.getSmartSaleSegments(startDate, endDate),
        ]);
      setRequestState({
        status: 'success',
        data: {
          stores: dashboard.stores,
          summary,
          monthlyTrend,
          discounts,
          campaigns,
          categories,
          categoryContribution,
          categoryBrands,
          cities,
          segments,
        },
      });
    } catch (error) {
      setRequestState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error inesperado consultando SmartSale.',
      });
    }
  }, [startDate, endDate]);

  useEffect(() => {
    runQuery();
  }, [runQuery]);

  const isLoading = requestState.status === 'loading';

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          SmartSale
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Canal SmartSale</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Ventas atribuidas a los vendedores de SmartSale (identificados por <code>marketingData.utmiCampaign</code>{' '}
          en VTEX). Sin histórico: este dato se empieza a capturar a partir del mes de{' '}
          {MONTH_NAMES[SMARTSALE_LAUNCH_MONTH - 1]} de {SMARTSALE_LAUNCH_YEAR} — meses anteriores a ese nunca tendrán
          información de este canal, sin importar cuándo consultes esta página.
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
            <p className="text-sm font-medium text-ink">Consultando SmartSale…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && (
        <>
          <SmartSaleSummarySection stores={requestState.data.stores} summary={requestState.data.summary} />

          <SmartSaleTrendSection monthly={requestState.data.monthlyTrend} />
          <StoreDiscountBreakdown stores={requestState.data.stores} discountAnalytics={requestState.data.discounts} />

          <SmartSaleCampaignsSection
            stores={requestState.data.stores}
            campaigns={requestState.data.campaigns}
            summary={requestState.data.summary}
          />

          <CategoryBrandRankingTable
            stores={requestState.data.stores}
            categoryRanking={requestState.data.categories}
            categoryBrandRanking={requestState.data.categoryBrands}
          />
          <CategoriesSection
            stores={requestState.data.stores}
            contribution={requestState.data.categoryContribution}
            categoryRanking={requestState.data.categories}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SegmentComparisonTable
              title="Sellers en ventas de SmartSale"
              emptyLabel="No hay ventas de sellers dentro del canal SmartSale en este rango."
              segments={toSegments(requestState.data.segments.sellers, 'seller')}
            />
            <SegmentComparisonTable
              title="Marketplaces en ventas de SmartSale"
              emptyLabel="No hay ventas de marketplaces dentro del canal SmartSale en este rango."
              segments={toSegments(requestState.data.segments.marketplaces, 'marketplace')}
            />
          </div>

          <SmartSaleCitiesSection stores={requestState.data.stores} citiesByStore={requestState.data.cities} />
        </>
      )}
    </main>
  );
}
