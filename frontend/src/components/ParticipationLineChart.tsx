'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SeriesParticipation } from '@/types/pilatos-mix';
import { formatCOP, formatPercentage } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface ParticipationLineChartProps {
  title: string;
  subtitle: string;
  series: SeriesParticipation[];
}

export const PARTICIPATION_PALETTE = ['#5B8DEF', '#3DD68C', '#F5B942', '#F0625A', '#C77DFF', '#5C6B8A', '#4FD1D9', '#E086C0'];

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Sufijo interno para guardar la venta en pesos de cada serie junto a su % en la misma fila del gráfico (ver `buildChartData`). */
const SALES_SUFFIX = '__sales';

function monthLabel(month: string): string {
  const monthIndex = Number(month.split('-')[1]) - 1;
  return MONTH_LABELS[monthIndex] ?? month;
}

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
  payload: Record<string, string | number>;
}

/** Tooltip propio: junto al % de participación (lo que dibuja la línea) muestra la venta en pesos de ese mes — el número comparativo detrás del %. */
function ParticipationTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-surface-border bg-white p-3 text-xs shadow-panel">
      <p className="mb-1.5 font-semibold text-ink">{label}</p>
      <div className="flex flex-col gap-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-medium text-ink">{entry.dataKey}:</span>
            <span className="tabular-nums text-ink-muted">{formatPercentage(entry.value)}</span>
            <span className="tabular-nums text-ink-faint">
              ({formatCOP(Number(entry.payload[`${entry.dataKey}${SALES_SUFFIX}`] ?? 0))})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Igual estilo que `TrendLineChart` (línea + punto en cada mes, meses por
 * nombre) pero una línea por seller/marketplace, sobre el % de
 * participación de cada uno sobre el total contabilizado de Pilatos — no
 * el valor en pesos. Al estar todas las series en la misma escala
 * 0-100%, el movimiento mes a mes de CADA una se ve, incluso las chicas
 * (con pesos, Disandina las aplastaría visualmente). El tooltip sí trae
 * la venta en pesos de cada punto, como dato comparativo junto al %.
 */
export function ParticipationLineChart({ title, subtitle, series }: ParticipationLineChartProps) {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return (
      <ChartPanel title={title}>
        <p className="py-10 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  const months = series[0].points.map((p) => p.month);
  const chartData = months.map((month, index) => {
    const row: Record<string, string | number> = { month: monthLabel(month) };
    for (const s of series) {
      const point = s.points[index];
      row[s.name] = point?.participationPercent ?? 0;
      row[`${s.name}${SALES_SUFFIX}`] = point?.salesValue ?? 0;
    }
    return row;
  });

  return (
    <ChartPanel title={title}>
      <p className="-mt-1 mb-3 text-xs text-ink-faint">{subtitle}</p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 22, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E7EF" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: '#5B6472', fontSize: 12 }} axisLine={{ stroke: '#E3E7EF' }} tickLine={false} />
          <YAxis
            tick={{ fill: '#5B6472', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => formatPercentage(value)}
            width={70}
            label={{
              value: '% del total Pilatos',
              position: 'top',
              offset: 12,
              style: { fill: '#5B6472', fontSize: 11, fontWeight: 600 },
            }}
          />
          <Tooltip content={<ParticipationTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#5B6472' }} />
          {series.map((s, index) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={PARTICIPATION_PALETTE[index % PARTICIPATION_PALETTE.length]}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  );
}
