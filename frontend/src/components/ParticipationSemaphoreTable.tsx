'use client';

import { useState } from 'react';

import { GROWTH_STATUS_META } from './GrowthBadge';
import { ChartPanel } from './OrdersByStoreChart';
import { formatCOP, formatPercentage } from '@/lib/format';
import { ParticipationPoint, SeriesParticipation } from '@/types/pilatos-mix';

interface ParticipationSemaphoreTableProps {
  title: string;
  series: SeriesParticipation[];
  /** Encabezado de la primera columna — por defecto el usado en `/pilatos`. */
  rowLabel?: string;
  /** A qué total contabilizado se refiere el %, usado en el subtítulo (ej. "Pilatos", "la tienda", "todas las tiendas"). */
  totalLabel?: string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type ComparisonMode = 'mes-anterior' | 'ano-pasado';

function monthLabel(month: string): string {
  const monthIndex = Number(month.split('-')[1]) - 1;
  return MONTH_LABELS[monthIndex] ?? month;
}

/** `{growthPercent, status}` del modo elegido — "vs. año pasado" se trata como 'no-data' cuando no hay histórico esa fecha, mismo criterio visual que el primer mes de "vs. mes anterior". */
function badgeDataFor(point: ParticipationPoint, mode: ComparisonMode): { growthPercent: number | null; status: ParticipationPoint['status'] } {
  if (mode === 'mes-anterior') return { growthPercent: point.growthPercent, status: point.status };
  if (!point.vsYearAgo) return { growthPercent: null, status: 'no-data' };
  return { growthPercent: point.vsYearAgo.growthPercent, status: point.vsYearAgo.status };
}

/**
 * Tabla mes a mes (columnas) por seller/marketplace (filas): mide si su
 * % de participación sobre el total contabilizado de Pilatos creció o
 * cayó respecto al mes anterior — NO el crecimiento de la venta en
 * pesos, que ya se ve en el gráfico de arriba. Semáforo de 3 niveles
 * (±5%, ver `getParticipationGrowthThresholds`) + "Nuevo" cuando ese mes
 * fue la primera vez con participación.
 */
export function ParticipationSemaphoreTable({
  title,
  series,
  rowLabel = 'Seller / Marketplace',
  totalLabel = 'Pilatos',
}: ParticipationSemaphoreTableProps) {
  const [mode, setMode] = useState<ComparisonMode>('mes-anterior');

  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return (
      <ChartPanel title={title}>
        <p className="py-6 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  const months = series[0].points.map((p) => p.month);
  // Suma de los `total` mensuales de CUALQUIER serie (es el mismo valor — el total del mes — repetido
  // en cada una) — el total del año completo, denominador del % de la columna "Total año".
  const yearGrandTotal = series[0].points.reduce((sum, p) => sum + p.total, 0);
  const hasAnyYearAgo = series.some((s) => s.points.some((p) => p.vsYearAgo !== null));

  return (
    <ChartPanel title={title}>
      <div className="-mt-1 mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          % de participación sobre el total contabilizado de {totalLabel} ese mes, y si esa participación creció o
          cayó {mode === 'mes-anterior' ? 'respecto al mes anterior' : 'respecto al mismo mes del año pasado'}.
        </p>
        <div className="inline-flex shrink-0 rounded-lg border border-surface-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('mes-anterior')}
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              mode === 'mes-anterior' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Vs. mes anterior
          </button>
          <button
            type="button"
            onClick={() => setMode('ano-pasado')}
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              mode === 'ano-pasado' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Vs. año pasado
          </button>
        </div>
      </div>
      {mode === 'ano-pasado' && !hasAnyYearAgo && (
        <p className="-mt-1 mb-3 rounded-lg bg-surface px-3 py-2 text-xs text-ink-faint">
          ℹ Todavía no hay ningún mes con un año completo de historial para comparar — el registro de ventas
          arranca en julio de 2025. Esta vista se va a ir llenando mes a mes.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface-panel px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {rowLabel}
              </th>
              {months.map((month) => (
                <th key={month} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {monthLabel(month)}
                </th>
              ))}
              <th className="border-l border-surface-border bg-surface px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Total año
              </th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => {
              const yearValue = s.points.reduce((sum, p) => sum + p.salesValue, 0);
              const yearPercent = yearGrandTotal > 0 ? (yearValue / yearGrandTotal) * 100 : 0;
              return (
                <tr key={s.name} className="border-t border-surface-border">
                  <td className="sticky left-0 bg-surface-panel px-3 py-2 font-medium text-ink">{s.name}</td>
                  {s.points.map((point) => {
                    const { growthPercent, status } = badgeDataFor(point, mode);
                    const meta = GROWTH_STATUS_META[status];
                    const yearAgoHint = point.vsYearAgo
                      ? ` · Año pasado: ${formatPercentage(point.vsYearAgo.participationPercent)} (${formatCOP(point.vsYearAgo.salesValue)})`
                      : '';
                    return (
                      <td key={point.month} className="px-2 py-2 text-center">
                        <div
                          className={`mx-auto flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${meta.badgeClass}`}
                          title={`Participación: ${formatPercentage(point.participationPercent)} · Venta: ${formatCOP(point.salesValue)}${yearAgoHint}`}
                        >
                          <span className="h-3.5 w-3.5">{meta.icon}</span>
                          {growthPercent !== null ? (
                            <span className="tabular-nums">{formatPercentage(growthPercent)}</span>
                          ) : status === 'no-data' ? (
                            // Sin mes de referencia (primer mes del rango en "mes anterior", o sin histórico
                            // un año atrás en "año pasado") — se muestra la participación real de ese mes en
                            // vez de "Sin dato", que hacía parecer que no había información cuando sí la hay.
                            <span className="tabular-nums">{formatPercentage(point.participationPercent)}</span>
                          ) : (
                            <span>{meta.label}</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="border-l border-surface-border bg-surface px-3 py-2 text-center">
                    <p className="font-semibold tabular-nums text-ink">{formatCOP(yearValue)}</p>
                    <p className="text-[11px] tabular-nums text-ink-faint">{formatPercentage(yearPercent)}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartPanel>
  );
}
