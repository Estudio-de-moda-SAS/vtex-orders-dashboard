'use client';

import { GROWTH_STATUS_META } from './GrowthBadge';
import { ChartPanel } from './OrdersByStoreChart';
import { formatCOP, formatPercentage } from '@/lib/format';
import { SeriesParticipation } from '@/types/pilatos-mix';

interface ParticipationSemaphoreTableProps {
  title: string;
  series: SeriesParticipation[];
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function monthLabel(month: string): string {
  const monthIndex = Number(month.split('-')[1]) - 1;
  return MONTH_LABELS[monthIndex] ?? month;
}

/**
 * Tabla mes a mes (columnas) por seller/marketplace (filas): mide si su
 * % de participación sobre el total contabilizado de Pilatos creció o
 * cayó respecto al mes anterior — NO el crecimiento de la venta en
 * pesos, que ya se ve en el gráfico de arriba. Semáforo de 3 niveles
 * (±5%, ver `getParticipationGrowthThresholds`) + "Nuevo" cuando ese mes
 * fue la primera vez con participación.
 */
export function ParticipationSemaphoreTable({ title, series }: ParticipationSemaphoreTableProps) {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return (
      <ChartPanel title={title}>
        <p className="py-6 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  const months = series[0].points.map((p) => p.month);

  return (
    <ChartPanel title={title}>
      <p className="-mt-1 mb-3 text-xs text-ink-faint">
        % de participación sobre el total contabilizado de Pilatos ese mes, y si esa participación creció o cayó
        respecto al mes anterior.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface-panel px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Seller / Marketplace
              </th>
              {months.map((month) => (
                <th key={month} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {monthLabel(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.name} className="border-t border-surface-border">
                <td className="sticky left-0 bg-surface-panel px-3 py-2 font-medium text-ink">{s.name}</td>
                {s.points.map((point) => {
                  const meta = GROWTH_STATUS_META[point.status];
                  return (
                    <td key={point.month} className="px-2 py-2 text-center">
                      <div
                        className={`mx-auto flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${meta.badgeClass}`}
                        title={`Participación: ${formatPercentage(point.participationPercent)} · Venta: ${formatCOP(point.salesValue)}`}
                      >
                        <span className="h-3.5 w-3.5">{meta.icon}</span>
                        {point.growthPercent !== null ? (
                          <span className="tabular-nums">{formatPercentage(point.growthPercent)}</span>
                        ) : point.status === 'no-data' ? (
                          // Sin mes anterior con el cual comparar (típicamente el primer mes del rango) — se
                          // muestra la participación real de ese mes en vez del texto "Sin dato", que hacía
                          // parecer que no había información cuando sí la hay.
                          <span className="tabular-nums">{formatPercentage(point.participationPercent)}</span>
                        ) : (
                          <span>{meta.label}</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartPanel>
  );
}
