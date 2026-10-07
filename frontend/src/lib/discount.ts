import { DiscountBucket, DiscountDistribution } from '@/types/product-analytics';

/** 'units' = cantidad de productos vendidos con ese descuento. 'sales' = valor en pesos vendido con ese descuento. */
export type DiscountMetric = 'units' | 'sales';

export interface TopBucketStats {
  bucket: number;
  value: number;
  percentage: number;
}

function metricValue(bucket: DiscountBucket, metric: DiscountMetric): number {
  return metric === 'units' ? bucket.count : bucket.sales;
}

function metricTotal(distribution: DiscountDistribution, metric: DiscountMetric): number {
  return metric === 'units' ? distribution.totalItems : distribution.totalSales;
}

/** Del bucket con más valor (unidades o pesos, según `metric`) de una distribución, cuánto tuvo y qué % representa sobre el total de esa misma métrica. `null` si todavía no hay datos. */
export function topBucketStats(distribution: DiscountDistribution, metric: DiscountMetric = 'units'): TopBucketStats | null {
  const total = metricTotal(distribution, metric);
  if (distribution.buckets.length === 0 || total <= 0) return null;

  let top = distribution.buckets[0];
  for (const bucket of distribution.buckets) {
    if (metricValue(bucket, metric) > metricValue(top, metric)) top = bucket;
  }

  const value = metricValue(top, metric);
  return { bucket: top.bucket, value, percentage: (value / total) * 100 };
}

/** Todos los buckets de una distribución, de mayor a menor según `metric`, con su % sobre el total de esa métrica — siempre suman 100%. */
export function rankedBuckets(
  distribution: DiscountDistribution,
  metric: DiscountMetric = 'units',
): { bucket: number; value: number; percentage: number }[] {
  const total = metricTotal(distribution, metric);
  return distribution.buckets
    .map((b) => {
      const value = metricValue(b, metric);
      return { bucket: b.bucket, value, percentage: total > 0 ? (value / total) * 100 : 0 };
    })
    .sort((a, b) => b.value - a.value);
}
