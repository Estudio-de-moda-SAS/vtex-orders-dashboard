import { DiscountAnalyticsResponse, DiscountDistribution } from '@/types/product-analytics';
import { formatNumber, formatPercentage } from '@/lib/format';
import { TopBucketStats, topBucketStats } from '@/lib/discount';

interface BrandDiscountBreakdownProps {
  discountAnalytics: DiscountAnalyticsResponse;
}

/**
 * Descuento más aplicado por marca (a nivel de producto) DENTRO de tiendas
 * multimarca — hoy, únicamente Pilatos. Las demás tiendas son monomarca:
 * su "marca" es redundante con el nombre de la tienda, por eso ya se
 * cubren en `StoreDiscountBreakdown` y no se mezclan acá. El universo de
 * `discountAnalytics.multiBrand` es distinto (más chico) que `global`.
 */
export function BrandDiscountBreakdown({ discountAnalytics }: BrandDiscountBreakdownProps) {
  const { storeNames, general, byBrand } = discountAnalytics.multiBrand;
  const generalStats = topBucketStats(general);

  const brands = Object.entries(byBrand)
    .map(([brand, distribution]) => ({ brand, distribution, stats: topBucketStats(distribution) }))
    .filter((entry): entry is { brand: string; distribution: DiscountDistribution; stats: TopBucketStats } =>
      entry.stats !== null,
    )
    .sort((a, b) => b.distribution.totalItems - a.distribution.totalItems);

  const scopeLabel = storeNames.length > 0 ? storeNames.join(', ') : null;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-base font-semibold text-ink">Descuento más aplicado por marca</h3>
        {generalStats && (
          <span className="text-xs text-ink-faint">
            En general: {generalStats.bucket}% — {formatNumber(generalStats.count)} de{' '}
            {formatNumber(general.totalItems)} productos ({formatPercentage(generalStats.percentage)})
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-ink-faint">
        {scopeLabel
          ? `Para cada marca dentro de ${scopeLabel}, el % de descuento que más se aplicó y cuántos de sus productos lo tuvieron.`
          : 'No hay tiendas multimarca configuradas.'}
      </p>

      {brands.length === 0 ? (
        <p className="text-sm text-ink-faint">No hay datos de descuento disponibles todavía.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map(({ brand, distribution, stats }) => (
            <div key={brand} className="rounded-xl border border-surface-border bg-surface p-3.5">
              <p className="mb-1 truncate text-sm font-medium text-ink" title={brand}>
                {brand}
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
