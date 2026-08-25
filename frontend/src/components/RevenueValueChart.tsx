'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StoreDashboardResult } from '@/types/dashboard';
import { formatCOP } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface RevenueValueChartProps {
  stores: StoreDashboardResult[];
}

export function RevenueValueChart({ stores }: RevenueValueChartProps) {
  const chartData = stores.map((store) => ({
    name: store.name,
    value: store.success ? store.data?.revenueTotalValue ?? 0 : 0,
    color: store.color,
  }));

  return (
    <ChartPanel title="Valor contabilizado por tienda">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E7EF" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: '#5B6472', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => formatCOP(value)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#5B6472', fontSize: 12 }}
            axisLine={{ stroke: '#E3E7EF' }}
            tickLine={false}
            width={80}
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
            formatter={(value: number) => [formatCOP(value), 'Valor invoiced']}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
