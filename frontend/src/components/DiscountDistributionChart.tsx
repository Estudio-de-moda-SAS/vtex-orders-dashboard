'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StoreDashboardResult } from '@/types/dashboard';
import { DiscountAnalyticsResponse } from '@/types/product-analytics';
import { formatNumber } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface DiscountDistributionChartProps {
  stores: StoreDashboardResult[];
  discountAnalytics: DiscountAnalyticsResponse;
}

const PALETTE = ['#5B8DEF', '#3DD68C', '#F5B942', '#F0625A', '#C77DFF', '#5C6B8A', '#4FD1D9'];

export function DiscountDistributionChart({ stores, discountAnalytics }: DiscountDistributionChartProps) {
  const allBuckets = Array.from(
    new Set(
      Object.values(discountAnalytics.byStore).flatMap((distribution) =>
        distribution.buckets.map((b) => b.bucket),
      ),
    ),
  ).sort((a, b) => a - b);

  const chartData = stores.map((store) => {
    const row: Record<string, string | number> = { name: store.name };
    const distribution = discountAnalytics.byStore[store.id];
    for (const bucket of allBuckets) {
      row[String(bucket)] = distribution?.buckets.find((b) => b.bucket === bucket)?.count ?? 0;
    }
    return row;
  });

  const topBucket = discountAnalytics.global.topBucket;
  const subtitle =
    topBucket === null
      ? 'Descuento más aplicado en general: sin datos suficientes.'
      : `Descuento más aplicado en general: ${topBucket}%`;

  if (allBuckets.length === 0) {
    return (
      <ChartPanel title="Distribución de descuentos">
        <p className="py-10 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel title="Distribución de descuentos">
      <p className="-mt-1 mb-3 text-xs text-ink-faint">{subtitle}</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E7EF" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#5B6472', fontSize: 12 }}
            axisLine={{ stroke: '#E3E7EF' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#5B6472', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => formatNumber(value)}
          />
          <Tooltip
            cursor={{ fill: 'rgba(16,24,40,0.04)' }}
            contentStyle={{
              background: '#FFFFFF',
              border: '1px solid #E3E7EF',
              borderRadius: 12,
              color: '#1B2333',
              fontSize: 13,
            }}
            formatter={(value: number, name: string) => [formatNumber(value), `${name}%`]}
          />
          <Legend
            formatter={(value: string) => `${value}%`}
            wrapperStyle={{ fontSize: 12, color: '#5B6472' }}
          />
          {allBuckets.map((bucket, index) => (
            <Bar
              key={bucket}
              dataKey={String(bucket)}
              stackId="discount"
              fill={PALETTE[index % PALETTE.length]}
              radius={index === allBuckets.length - 1 ? [6, 6, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
