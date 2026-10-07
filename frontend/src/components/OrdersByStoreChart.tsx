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

export function ChartPanel({
  title,
  actions,
  children,
}: {
  title: string;
  /** Contenido opcional junto al título (ej. un toggle de métrica) — no afecta a los paneles que no lo pasan. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // `min-w-0`: este panel es hijo directo de un `flex flex-col` (`<main>`
    // de cada página) — sin esto, un contenido interno ancho (ej. la tabla
    // `min-w-[640px]` de `ParticipationSemaphoreTable`, con muchos meses)
    // no puede encogerse (default de flex: `min-width: auto`) y empuja
    // TODA la página a desbordarse de lado, en vez de quedar contenido en
    // el scroll horizontal propio de la tabla — confirmado en mobile en
    // `/pilatos` y `/metodos-pago` (las tarjetas se veían cortadas).
    <div className="min-w-0 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}
