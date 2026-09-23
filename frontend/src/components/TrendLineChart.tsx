'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendMonthPoint } from '@/types/trends';
import { formatCOP } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface TrendLineChartProps {
  monthly: TrendMonthPoint[];
  year: number;
  priorYear: number;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Línea de tendencia con AMBOS años superpuestos sobre el mismo eje
 * (no barras separadas) — deja ver la forma completa de la curva, no
 * solo el número final. Los meses sin comparación disponible (antes de
 * jul-2025) simplemente no dibujan el punto de la línea del año
 * anterior (Recharts corta la línea ahí en vez de caer a cero).
 */
export function TrendLineChart({ monthly, year, priorYear }: TrendLineChartProps) {
  const chartData = monthly.map((point) => {
    const monthIndex = Number(point.month.split('-')[1]) - 1;
    return {
      label: MONTH_LABELS[monthIndex] ?? point.month,
      current: point.currentSales,
      prior: point.priorSales,
    };
  });

  return (
    <ChartPanel title={`Ventas contabilizadas: ${year} vs. ${priorYear}`}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3E7EF" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#5B6472', fontSize: 12 }} axisLine={{ stroke: '#E3E7EF' }} tickLine={false} />
          <YAxis
            tick={{ fill: '#5B6472', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => formatCOP(value)}
            width={90}
          />
          <Tooltip
            contentStyle={{
              background: '#FFFFFF',
              border: '1px solid #E3E7EF',
              borderRadius: 12,
              color: '#1B2333',
              fontSize: 13,
            }}
            formatter={(value: number, name: string) => [formatCOP(value), name === 'current' ? String(year) : String(priorYear)]}
          />
          <Line
            type="monotone"
            dataKey="current"
            name="current"
            stroke="#3D6FE0"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="prior"
            name="prior"
            stroke="#8A93A3"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-3 flex items-center gap-4 text-xs text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-accent" /> {year}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded border-t-2 border-dashed border-ink-faint" /> {priorYear}
        </span>
        <span>Los meses sin punto en {priorYear} no tienen histórico disponible.</span>
      </div>
    </ChartPanel>
  );
}
