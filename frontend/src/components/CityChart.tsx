'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { StoreDashboardResult } from '@/types/dashboard';
import { formatCOP } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface CityChartProps {
  stores: StoreDashboardResult[];
}

const PALETTE = ['#5B8DEF', '#3DD68C', '#F5B942', '#F0625A', '#C77DFF', '#5C6B8A', '#4FD1D9'];

const TOP_CITIES_LIMIT = 7;

export function CityChart({ stores }: CityChartProps) {
  const totals = new Map<string, number>();

  for (const store of stores) {
    if (!store.success || !store.data) continue;
    for (const [city, breakdown] of Object.entries(store.data.cityBreakdown)) {
      totals.set(city, (totals.get(city) ?? 0) + breakdown.totalValue);
    }
  }

  const sorted = Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const chartData = sorted.slice(0, TOP_CITIES_LIMIT);
  const remainder = sorted.slice(TOP_CITIES_LIMIT).reduce((acc, entry) => acc + entry.value, 0);
  if (remainder > 0) {
    chartData.push({ name: 'Otras ciudades', value: remainder });
  }

  if (chartData.length === 0) {
    return (
      <ChartPanel title="Ciudades">
        <p className="py-10 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel title="Ciudades">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={64}
            outerRadius={96}
            paddingAngle={2}
          >
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#FFFFFF',
              border: '1px solid #E3E7EF',
              borderRadius: 12,
              color: '#1B2333',
              fontSize: 13,
            }}
            formatter={(value: number, name: string) => [formatCOP(value), name]}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ fontSize: 12, color: '#5B6472' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
