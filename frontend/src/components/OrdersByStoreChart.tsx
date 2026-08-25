'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StoreDashboardResult } from '@/types/dashboard';
import { formatNumber } from '@/lib/format';

interface OrdersByStoreChartProps {
  stores: StoreDashboardResult[];
}

export function OrdersByStoreChart({ stores }: OrdersByStoreChartProps) {
  const chartData = stores.map((store) => ({
    name: store.name,
    orders: store.success ? store.data?.totalOrders ?? 0 : 0,
    color: store.color,
  }));

  return (
    <ChartPanel title="Órdenes por tienda">
      <ResponsiveContainer width="100%" height={260}>
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
            formatter={(value: number) => [formatNumber(value), 'Órdenes']}
          />
          <Bar dataKey="orders" radius={[6, 6, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}

export function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <h3 className="mb-3 font-display text-base font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}
