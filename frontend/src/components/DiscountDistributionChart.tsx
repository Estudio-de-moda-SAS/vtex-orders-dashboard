'use client';

import { useState } from 'react';
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
import { formatCOP, formatNumber } from '@/lib/format';
import { DiscountMetric, topBucketStats } from '@/lib/discount';
import { DiscountMetricToggle } from './DiscountMetricToggle';
import { ChartPanel } from './OrdersByStoreChart';

interface DiscountDistributionChartProps {
  stores: StoreDashboardResult[];
  discountAnalytics: DiscountAnalyticsResponse;
}

const PALETTE = ['#5B8DEF', '#3DD68C', '#F5B942', '#F0625A', '#C77DFF', '#5C6B8A', '#4FD1D9'];

/**
 * Distribución de descuentos por tienda, apilada por % de descuento. El
 * toggle `DiscountMetricToggle` alterna si cada barra representa
 * CANTIDAD DE PRODUCTOS o VALOR EN PESOS vendido con ese descuento —
 * mismo criterio que `StoreDiscountBreakdown`/`BrandDiscountBreakdown`,
 * para que las tres vistas de descuento se lean de forma consistente.
 */
export function DiscountDistributionChart({ stores, discountAnalytics }: DiscountDistributionChartProps) {
  const [metric, setMetric] = useState<DiscountMetric>('units');

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
      const bucketRow = distribution?.buckets.find((b) => b.bucket === bucket);
      row[String(bucket)] = bucketRow ? (metric === 'units' ? bucketRow.count : bucketRow.sales) : 0;
    }
    return row;
  });

  const globalStats = topBucketStats(discountAnalytics.global, metric);
  const subtitle =
    globalStats === null
      ? 'Descuento más aplicado en general: sin datos suficientes.'
      : `Descuento más aplicado en general: ${globalStats.bucket}%`;

  const formatValue = (value: number) => (metric === 'units' ? formatNumber(value) : formatCOP(value));

  if (allBuckets.length === 0) {
    return (
      <ChartPanel title="Distribución de descuentos" actions={<DiscountMetricToggle value={metric} onChange={setMetric} />}>
        <p className="py-10 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel title="Distribución de descuentos" actions={<DiscountMetricToggle value={metric} onChange={setMetric} />}>
      <p className="-mt-1 mb-3 text-xs text-ink-faint">
        {subtitle} —{' '}
        {metric === 'units' ? (
          'cada barra es por cantidad de productos vendidos con ese % de descuento.'
        ) : (
          <>
            cada barra es por valor en pesos vendido con ese % de descuento.{' '}
            <strong className="font-medium text-ink-muted">Disponible desde septiembre de 2026</strong> — meses
            anteriores se verán en $0.
          </>
        )}
      </p>
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
            tickFormatter={(value) => formatValue(value)}
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
            formatter={(value: number, name: string) => [formatValue(value), `${name}%`]}
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
