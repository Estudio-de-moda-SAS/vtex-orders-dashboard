'use client';

import { CategoriesSection } from '@/components/CategoriesSection';
import { CategoryBrandRankingTable } from '@/components/CategoryBrandRankingTable';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { SegmentComparisonTable } from '@/components/SegmentComparisonTable';
import { SmartSaleCampaignsSection } from '@/components/SmartSaleCampaignsSection';
import { SmartSaleCitiesSection } from '@/components/SmartSaleCitiesSection';
import { SmartSaleSummarySection } from '@/components/SmartSaleSummarySection';
import { StoreDiscountBreakdown } from '@/components/StoreDiscountBreakdown';
import { getTodayRange } from '@/lib/date';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { CityBreakdown, SegmentDashboardResult, StoreDashboardResult } from '@/types/dashboard';
import {
  CategoryBrandRankingByStore,
  CategoryContributionResponse,
  CategoryRankingByStore,
  DiscountAnalyticsResponse,
} from '@/types/product-analytics';
import { SmartSaleCampaignsByStore, SmartSaleSegmentsResponse, SmartSaleSummaryByStore } from '@/types/smartsale';

interface SmartSaleData {
  stores: StoreDashboardResult[];
  summary: SmartSaleSummaryByStore;
  discounts: DiscountAnalyticsResponse;
  campaigns: SmartSaleCampaignsByStore;
  categories: CategoryRankingByStore;
  categoryContribution: CategoryContributionResponse;
  categoryBrands: CategoryBrandRankingByStore;
  cities: Record<string, Record<string, CityBreakdown>>;
  segments: SmartSaleSegmentsResponse;
}

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

/** Convierte "sellers"/"marketplaces" de SmartSale al shape de `SegmentDashboardResult` para reusar `SegmentComparisonTable` tal cual. */
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

export function VentasVtexTab() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-smartsale-range', getTodayRange);

  const { state: requestState, refetch: runQuery } = useCachedQuery<SmartSaleData>(
    // "v2": import histórico de 2025-2026 recargado en Supabase — invalida cualquier
    // caché guardado en sessionStorage de ANTES de esa carga.
    `smartsale:v2:${startDate}:${endDate}`,
    async () => {
      const [dashboard, summary, discounts, campaigns, categories, categoryContribution, categoryBrands, cities, segments] =
        await Promise.all([
          ordersService.getDashboardData(startDate, endDate),
          ordersService.getSmartSaleSummary(startDate, endDate),
          ordersService.getSmartSaleDiscounts(startDate, endDate),
          ordersService.getSmartSaleCampaigns(startDate, endDate),
          ordersService.getSmartSaleCategories(startDate, endDate),
          ordersService.getSmartSaleCategoryContribution(startDate, endDate),
          ordersService.getSmartSaleCategoryBrands(startDate, endDate),
          ordersService.getSmartSaleCities(startDate, endDate),
          ordersService.getSmartSaleSegments(startDate, endDate),
        ]);
      return {
        stores: dashboard.stores,
        summary,
        discounts,
        campaigns,
        categories,
        categoryContribution,
        categoryBrands,
        cities,
        segments,
      };
    },
    { autoFetchOnKeyChange: false },
  );

  const isLoading = requestState.status === 'loading';

  return (
    <>
      <p className="max-w-2xl text-sm text-ink-muted">
        Ventas atribuidas a los vendedores de SmartSale (identificados por <code>marketingData.utmiCampaign</code> en
        VTEX). Sin histórico: este dato se empieza a capturar a partir del mes de{' '}
        {MONTH_NAMES[SMARTSALE_LAUNCH_MONTH - 1]} de {SMARTSALE_LAUNCH_YEAR} — meses anteriores a ese nunca tendrán
        información de este canal, sin importar cuándo consultes esta página.
      </p>

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

          <StoreDiscountBreakdown
            stores={requestState.data.stores}
            discountAnalytics={requestState.data.discounts}
            revenueTotalByStore={Object.fromEntries(
              Object.entries(requestState.data.summary).map(([storeId, s]) => [storeId, s.smartSaleSales]),
            )}
          />

          <SmartSaleCampaignsSection
            stores={requestState.data.stores}
            campaigns={requestState.data.campaigns}
            summary={requestState.data.summary}
            startDate={startDate}
            endDate={endDate}
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
    </>
  );
}
