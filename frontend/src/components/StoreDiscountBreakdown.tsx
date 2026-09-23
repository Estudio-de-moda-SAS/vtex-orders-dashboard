import { StoreDashboardResult } from '@/types/dashboard';
import { DiscountAnalyticsResponse, DiscountDistribution } from '@/types/product-analytics';
import { formatNumber, formatPercentage } from '@/lib/format';
import { topBucketStats } from '@/lib/discount';

interface StoreDiscountBreakdownProps {
  stores: StoreDashboardResult[];
  discountAnalytics: DiscountAnalyticsResponse;
}

/** Todos los buckets de una distribución, de mayor a menor uso, con su % sobre el total — siempre suman 100%. */
function rankedBuckets(distribution: DiscountDistribution): { bucket: number; count: number; percentage: number }[] {
  return distribution.buckets
    .map((b) => ({ ...b, percentage: distribution.totalItems > 0 ? (b.count / distribution.totalItems) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Descuento más aplicado POR TIENDA (a nivel de producto) — protagonismo
 * para el bucket top (número grande, como antes) — y, debajo, el resto de
 * los buckets que sí se aplicaron, de mayor a menor, para poder leer el
 * comportamiento completo (ej. "70% es el más vendido en Pilatos, pero
 * ¿qué tanto pesan el 50% o el 30%?") sin tener que leerlo de las barras
 * apiladas de `DiscountDistributionChart`. Siempre suma 100% del rango
 * consultado.
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
      <p className="mb-4 max-w-3xl text-xs text-ink-faint">
        Para cada tienda, el % de descuento que más se aplicó y cuántos de sus productos lo tuvieron. Esta métrica es{' '}
        <strong className="font-medium text-ink-muted">por producto vendido, no por orden ni por valor en pesos</strong>{' '}
        — cada % representa qué porción de los PRODUCTOS vendidos en el rango de fechas consultado tuvo exactamente
        ese descuento (una misma orden con 2 productos a descuentos distintos aporta a los dos buckets por
        separado). Por eso la lista de abajo siempre suma 100%.
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
              <p className="mb-3 text-xs text-ink-faint">
                {formatNumber(stats.count)} de {formatNumber(distribution.totalItems)} productos (
                {formatPercentage(stats.percentage)})
              </p>

              <ul className="flex flex-col gap-1.5">
                {rankedBuckets(distribution).map((b) => (
                  <li key={b.bucket} className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-9 shrink-0 tabular-nums ${
                        b.bucket === stats.bucket ? 'font-semibold text-ink' : 'text-ink-muted'
                      }`}
                    >
                      {b.bucket}%
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-border">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(b.percentage, 2)}%`,
                          backgroundColor: b.bucket === stats.bucket ? store.color : '#C7CDD9',
                        }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-ink-faint">
                      {formatPercentage(b.percentage)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
