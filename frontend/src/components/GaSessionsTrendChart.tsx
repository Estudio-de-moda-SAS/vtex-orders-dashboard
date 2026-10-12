'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GaDailyPoint } from '@/types/ga-analytics';
import { formatNumber } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface GaSessionsTrendChartProps {
  dailySeries: GaDailyPoint[];
  provisionalDays: string[];
}

function formatDayLabel(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

/** Línea simple de sesiones por día — a diferencia de `ParticipationLineChart`, acá el valor es un conteo absoluto, no un % de participación (no tiene sentido comparar "participación" de un solo valor). */
export function GaSessionsTrendChart({ dailySeries, provisionalDays }: GaSessionsTrendChartProps) {
  if (dailySeries.length === 0) {
    return (
      <ChartPanel title="Sesiones en el tiempo">
        <p className="py-10 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  const provisionalSet = new Set(provisionalDays);
  const chartData = dailySeries.map((point) => ({
    day: formatDayLabel(point.date),
    date: point.date,
    sessions: point.sessions,
  }));

  // Con rangos largos (mes completo, año) un tick por día se amontona y no
  // cabe — se espacian las etiquetas para mostrar ~10-12 como máximo,
  // dejando que Recharts omita las intermedias (`interval`). Los puntos
  // (`dot`) también se ocultan con muchos días: con 1 punto por día ya se
  // ve la línea completa, el punto solo estorba visualmente.
  const maxTicks = 12;
  const tickInterval = chartData.length > maxTicks ? Math.ceil(chartData.length / maxTicks) - 1 : 0;
  const showDots = chartData.length <= 31;

  return (
    <ChartPanel title="Sesiones en el tiempo">
      {provisionalDays.length > 0 && (
        <p className="-mt-1 mb-3 text-xs text-accent">
          ℹ Los últimos {provisionalDays.length} día(s) del rango son provisionales — GA4 tarda 24-48h en terminar de
          confirmar sus números.
        </p>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E7EF" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: '#5B6472', fontSize: 12 }}
            axisLine={{ stroke: '#E3E7EF' }}
            tickLine={false}
            interval={tickInterval}
            minTickGap={16}
          />
          <YAxis tick={{ fill: '#5B6472', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatNumber(value)} />
          <Tooltip
            cursor={{ fill: 'rgba(16,24,40,0.04)' }}
            contentStyle={{ background: '#FFFFFF', border: '1px solid #E3E7EF', borderRadius: 12, color: '#1B2333', fontSize: 13 }}
            formatter={(value: number) => [formatNumber(value), 'Sesiones']}
            labelFormatter={(label: string, payload) => {
              const date = payload?.[0]?.payload?.date as string | undefined;
              return date && provisionalSet.has(date) ? `${label} (provisional)` : label;
            }}
          />
          <Line
            type="monotone"
            dataKey="sessions"
            stroke="#5B8DEF"
            strokeWidth={2.5}
            dot={showDots ? { r: 3 } : false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
