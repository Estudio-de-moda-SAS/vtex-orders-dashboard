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
import { formatNumber, statusColor, statusLabel } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface StatusChartProps {
  stores: StoreDashboardResult[];
}

export function StatusChart({ stores }: StatusChartProps) {
  const allStatuses = Array.from(
    new Set(
      stores.flatMap((store) => (store.success && store.data ? Object.keys(store.data.statusCounts) : [])),
    ),
  );

  const chartData = stores.map((store) => {
    const row: Record<string, string | number> = { name: store.name };
    for (const status of allStatuses) {
      row[status] = store.success ? store.data?.statusCounts[status] ?? 0 : 0;
    }
    return row;
  });

  if (allStatuses.length === 0) {
    return (
      <ChartPanel title="Órdenes por status y tienda">
        <p className="py-10 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel title="Órdenes por status y tienda">
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
            formatter={(value: number, name: string) => [formatNumber(value), statusLabel(name)]}
          />
          <Legend
            formatter={(value: string) => statusLabel(value)}
            wrapperStyle={{ fontSize: 12, color: '#5B6472' }}
          />
          {allStatuses.map((status, index) => (
            <Bar
              key={status}
              dataKey={status}
              stackId="status"
              fill={statusColor(status, index)}
              radius={index === allStatuses.length - 1 ? [6, 6, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
