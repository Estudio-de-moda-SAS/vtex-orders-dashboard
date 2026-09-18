import { StoreDashboardResult } from '@/types/dashboard';
import { DiscountAnalyticsResponse } from '@/types/product-analytics';
import { formatNumber, formatPercentage } from '@/lib/format';
import { topBucketStats } from '@/lib/discount';

interface StoreDiscountBreakdownProps {
  stores: StoreDashboardResult[];
  discountAnalytics: DiscountAnalyticsResponse;
}

/**
 * Descuento más aplicado POR TIENDA (a nivel de producto) + el mismo
 * indicador en general — ej. "el descuento más aplicado en Pilatos es
 * 60%", "en Girbaud es 40%". Complementa a `DiscountDistributionChart`
 * (el gráfico apilado): acá el número queda explícito por tienda, en vez
 * de tener que leerlo de las barras.
 */
export function StoreDiscountBreakdown({ stores, discountAnalytics }: StoreDiscountBreakdownProps) {
  const generalStats = topBucketStats(discountAnalytics.global);

  const storesWithStats = stores
    .map((store) => ({
      store,
      distribution: discountAnalytics.byStore[store.id],
      stats: discountAnalytics.byStore[store.id] ? topBucketStats(discountAnalytics.byStore[store.id]) : null,
    }))
    .filter(
      (entry): entry is { store: StoreDashboardResult; distribution: NonNullable<typeof entry.distribution>; stats: NonNullable<typeof entry.stats> } =>
        entry.distribution !== undefined && entry.stats !== null,
    );

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-base font-semibold text-ink">Descuento más aplicado por tienda</h3>
        {generalStats && (
          <span className="text-xs text-ink-faint">
            En general: {generalStats.bucket}% — {formatNumber(generalStats.count)} de{' '}
            {formatNumber(discountAnalytics.global.totalItems)} productos ({formatPercentage(generalStats.percentage)})
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-ink-faint">
        Para cada tienda, el % de descuento que más se aplicó y cuántos de sus productos lo tuvieron.
      </p>

      {storesWithStats.length === 0 ? (
        <p className="text-sm text-ink-faint">No hay datos de descuento disponibles todavía.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {storesWithStats.map(({ store, distribution, stats }) => (
            <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                {store.name}
              </p>
              <p className="font-display text-lg font-semibold tabular-nums text-ink">{stats.bucket}%</p>
              <p className="text-xs text-ink-faint">
                {formatNumber(stats.count)} de {formatNumber(distribution.totalItems)} productos (
                {formatPercentage(stats.percentage)})
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
