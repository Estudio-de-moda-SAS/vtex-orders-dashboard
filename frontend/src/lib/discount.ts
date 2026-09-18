import { DiscountDistribution } from '@/types/product-analytics';

export interface TopBucketStats {
  bucket: number;
  count: number;
  percentage: number;
}

/** Del bucket con más ocurrencias de una distribución, cuántos ítems tuvo y qué % representa sobre el total. `null` si todavía no hay datos. */
export function topBucketStats(distribution: DiscountDistribution): TopBucketStats | null {
  if (distribution.topBucket === null || distribution.totalItems === 0) return null;
  const count = distribution.buckets.find((b) => b.bucket === distribution.topBucket)?.count ?? 0;
  return {
    bucket: distribution.topBucket,
    count,
    percentage: (count / distribution.totalItems) * 100,
  };
}
