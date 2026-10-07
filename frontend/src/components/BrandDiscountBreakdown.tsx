'use client';

import { useState } from 'react';

import { DiscountAnalyticsResponse, DiscountDistribution } from '@/types/product-analytics';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { DiscountMetric, TopBucketStats, topBucketStats } from '@/lib/discount';
import { DiscountMetricToggle } from './DiscountMetricToggle';

interface BrandDiscountBreakdownProps {
  discountAnalytics: DiscountAnalyticsResponse;
}

function formatMetricValue(value: number, metric: DiscountMetric): string {
  return metric === 'units' ? formatNumber(value) : formatCOP(value);
}

function metricTotal(distribution: DiscountDistribution, metric: DiscountMetric): number {
  return metric === 'units' ? distribution.totalItems : distribution.totalSales;
}

/**
 * Descuento más aplicado por marca DENTRO de tiendas multimarca — hoy,
 * únicamente Pilatos. Las demás tiendas son monomarca: su "marca" es
 * redundante con el nombre de la tienda, por eso ya se cubren en
 * `StoreDiscountBreakdown` y no se mezclan acá. El universo de
 * `discountAnalytics.multiBrand` es distinto (más chico) que `global`.
 * Mismo toggle unidades/pesos que `StoreDiscountBreakdown`.
 */
export function BrandDiscountBreakdown({ discountAnalytics }: BrandDiscountBreakdownProps) {
  const [metric, setMetric] = useState<DiscountMetric>('units');
  const unitLabel = metric === 'units' ? 'productos' : 'en ventas';

  const { storeNames, general, byBrand } = discountAnalytics.multiBrand;
  const generalStats = topBucketStats(general, metric);

  const brands = Object.entries(byBrand)
    .map(([brand, distribution]) => ({ brand, distribution, stats: topBucketStats(distribution, metric) }))
    .filter((entry): entry is { brand: string; distribution: DiscountDistribution; stats: TopBucketStats } =>
      entry.stats !== null,
    )
    .sort((a, b) => metricTotal(b.distribution, metric) - metricTotal(a.distribution, metric));

  const scopeLabel = storeNames.length > 0 ? storeNames.join(', ') : null;
  const generalTotal = metricTotal(general, metric);

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="font-display text-base font-semibold text-ink">Descuento más aplicado por marca</h3>
        <DiscountMetricToggle value={metric} onChange={setMetric} />
      </div>
      {generalStats && (
        <p className="mb-1 text-xs text-ink-faint">
          En general: {generalStats.bucket}% — {formatMetricValue(generalStats.value, metric)} de{' '}
          {formatMetricValue(generalTotal, metric)} {unitLabel} ({formatPercentage(generalStats.percentage)})
        </p>
      )}
      <p className="mb-4 text-xs text-ink-faint">
        {scopeLabel
          ? `Para cada marca dentro de ${scopeLabel}, el % de descuento que más se aplicó, ${
              metric === 'units' ? 'por cantidad de productos' : 'por valor en pesos vendido'
            }.`
          : 'No hay tiendas multimarca configuradas.'}
        {metric === 'sales' && (
          <>
            {' '}
            <strong className="font-medium text-ink-muted">Disponible desde septiembre de 2026</strong> — meses
            anteriores mostrarán $0 en esta vista.
          </>
        )}
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
                {formatMetricValue(stats.value, metric)} de {formatMetricValue(metricTotal(distribution, metric), metric)}{' '}
                {unitLabel} ({formatPercentage(stats.percentage)})
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
