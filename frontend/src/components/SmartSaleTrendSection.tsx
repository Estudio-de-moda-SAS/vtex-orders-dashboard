'use client';

import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { SmartSaleMonthlyTrendPoint } from '@/types/smartsale';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { GROWTH_STATUS_META } from './GrowthBadge';
import { ChartPanel } from './OrdersByStoreChart';

interface SmartSaleTrendSectionProps {
  monthly: SmartSaleMonthlyTrendPoint[];
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function monthLabel(month: string): string {
  const monthIndex = Number(month.split('-')[1]) - 1;
  return MONTH_LABELS[monthIndex] ?? month;
}

/** Los 12 meses del año EN CURSO (ej. "2026-01".."2026-12") — el gráfico siempre muestra el año completo de una vez, no solo los meses que ya tienen datos, para poder ir midiendo cada mes contra el año entero desde ya. */
function getAllMonthsThisYear(): string[] {
  const year = new Date().getFullYear();
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * Tendencia de ventas del canal SmartSale (general, las 6 tiendas
 * combinadas) — siempre el año completo en curso (Enero a Diciembre), sin
 * filtro: los meses sin datos todavía (antes del lanzamiento en
 * Septiembre, o meses futuros) quedan como huecos en la línea, y se van
 * llenando solos mes a mes según entra información real. El semáforo de
 * abajo solo lista los meses que YA tienen datos — el primero de esos
 * siempre muestra "Sin dato" porque no hay mes anterior con el cual
 * comparar, no porque falte información (ver el valor real en su lugar).
 */
export function SmartSaleTrendSection({ monthly }: SmartSaleTrendSectionProps) {
  const allMonthsThisYear = useMemo(() => getAllMonthsThisYear(), []);

  const chartData = useMemo(
    () =>
      allMonthsThisYear.map((month) => {
        const point = monthly.find((p) => p.month === month);
        return { month: monthLabel(month), sales: point ? point.sales : null };
      }),
    [allMonthsThisYear, monthly],
  );

  if (monthly.length === 0) {
    return (
      <ChartPanel title="Tendencia de ventas SmartSale">
        <p className="py-10 text-center text-sm text-ink-faint">Sin datos todavía.</p>
      </ChartPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ChartPanel title="Tendencia de ventas SmartSale">
        <p className="-mt-1 mb-3 text-xs text-ink-faint">
          Venta del canal SmartSale (todas las tiendas combinadas) — año completo en curso, Enero a Diciembre. Los
          meses sin datos todavía quedan como huecos en la línea y se van completando solos mes a mes.
        </p>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E3E7EF" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#5B6472', fontSize: 12 }} axisLine={{ stroke: '#E3E7EF' }} tickLine={false} />
            <YAxis
              tick={{ fill: '#5B6472', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => formatCOP(value)}
              width={90}
            />
            <Tooltip
              contentStyle={{ background: '#FFFFFF', border: '1px solid #E3E7EF', borderRadius: 12, color: '#1B2333', fontSize: 13 }}
              formatter={(value: number) => [value === null ? 'Sin datos' : formatCOP(value), 'Ventas SmartSale']}
            />
            <Line type="monotone" dataKey="sales" stroke="#3D6FE0" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Crecimiento mes a mes">
        <p className="-mt-1 mb-3 text-xs text-ink-faint">
          Cambio % de la venta de SmartSale respecto al mes anterior. El primer mes de la serie no tiene mes anterior
          con el cual comparar.
        </p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {monthly.map((point) => {
            const meta = GROWTH_STATUS_META[point.status];
            return (
              <div key={point.month} className="flex shrink-0 flex-col items-center gap-1.5 rounded-xl border border-surface-border bg-surface p-3">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{monthLabel(point.month)}</span>
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${meta.badgeClass}`}>
                  <span className="h-3.5 w-3.5">{meta.icon}</span>
                  {point.growthPercent !== null ? (
                    <span className="tabular-nums">{formatPercentage(point.growthPercent)}</span>
                  ) : point.status === 'no-data' ? (
                    // Sin mes anterior con el cual comparar (típicamente el primer mes de la serie) — se muestra
                    // la venta real de ese mes en vez de "Sin dato", que haría parecer que no hay información.
                    <span className="tabular-nums">{formatCOP(point.sales)}</span>
                  ) : (
                    <span>{meta.label}</span>
                  )}
                </div>
                <span className="text-[11px] text-ink-faint">{formatNumber(point.orders)} ord.</span>
              </div>
            );
          })}
        </div>
      </ChartPanel>
    </div>
  );
}
