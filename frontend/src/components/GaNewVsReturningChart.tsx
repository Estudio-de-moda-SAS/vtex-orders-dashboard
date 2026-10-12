'use client';

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GaDailyPoint } from '@/types/ga-analytics';
import { formatNumber } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface GaNewVsReturningChartProps {
  dailySeries: GaDailyPoint[];
}

function formatDayLabel(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

/**
 * Nuevos vs. recurrentes POR DÍA — a diferencia de los totales del rango
 * (`GaStoreTotals.returningUsersSum`, aproximado), el recurrente de UN
 * SOLO día (`totalUsers - newUsers` de ESE día) es exacto: la
 * aproximación solo aparece al sumar varios días entre sí, no dentro de
 * un mismo día. Mismo tope de ~12 etiquetas y ocultar puntos en rangos
 * largos que `GaSessionsTrendChart` (ver esa nota).
 */
export function GaNewVsReturningChart({ dailySeries }: GaNewVsReturningChartProps) {
  if (dailySeries.length === 0) {
    return (
      <ChartPanel title="Usuarios nuevos vs. recurrentes">
        <p className="py-10 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  const chartData = dailySeries.map((point) => ({
    day: formatDayLabel(point.date),
    nuevos: point.newUsers,
    recurrentes: Math.max(0, point.totalUsers - point.newUsers),
  }));

  const maxTicks = 12;
  const tickInterval = chartData.length > maxTicks ? Math.ceil(chartData.length / maxTicks) - 1 : 0;

  return (
    <ChartPanel title="Usuarios nuevos vs. recurrentes">
      <p className="-mt-1 mb-3 text-xs text-ink-faint">
        "Recurrentes" de un día es exacto (usuarios totales − usuarios nuevos de ESE día) — la aproximación solo
        aparece al sumar varios días en las tarjetas de arriba.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E7EF" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: '#5B6472', fontSize: 12 }} axisLine={{ stroke: '#E3E7EF' }} tickLine={false} interval={tickInterval} minTickGap={16} />
          <YAxis tick={{ fill: '#5B6472', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatNumber(value)} />
          <Tooltip
            cursor={{ fill: 'rgba(16,24,40,0.04)' }}
            contentStyle={{ background: '#FFFFFF', border: '1px solid #E3E7EF', borderRadius: 12, color: '#1B2333', fontSize: 13 }}
            formatter={(value: number, name: string) => [formatNumber(value), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="nuevos" name="Nuevos" stackId="users" stroke="#5B8DEF" fill="#5B8DEF" fillOpacity={0.5} />
          <Area type="monotone" dataKey="recurrentes" name="Recurrentes" stackId="users" stroke="#12B76A" fill="#12B76A" fillOpacity={0.5} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
