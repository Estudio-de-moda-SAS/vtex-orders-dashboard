import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

export interface GaBreakdownTableRow {
  label: string;
  sessions: number;
  sessionsPercent: number;
  totalUsers: number;
  usersPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  /** Solo dispositivos — "según Analytics", distinta de la conversión real del cruce con ventas. */
  conversionPercent?: number;
  /** Solo páginas de entrada por ahora (ver `showBounceRate`) — `1 - engaged/sessions` de ESA fila, en %. */
  bounceRatePercent?: number;
}

interface GaBreakdownTableProps {
  title: string;
  /** Encabezado de la primera columna (ej. "Canal", "Dispositivo"). */
  rowLabel: string;
  rows: GaBreakdownTableRow[];
  /** Total de sesiones de la tienda en el rango — mismo que la tarjeta de arriba, para que se vea de dónde sale el 100% de "Sesiones". */
  totalSessions: number;
  /** Agrega la columna "Tasa de rebote" — opt-in porque solo páginas de entrada trae ese dato hoy; los demás desgloses no muestran la columna. */
  showBounceRate?: boolean;
}

/** `value (percent%)` en una sola celda — cada columna participa sobre SU PROPIO total, no todas sobre sesiones. */
function cell(value: string, percent: number): string {
  return `${value} (${formatPercentage(percent)})`;
}

/**
 * Tabla completa (no barras) por canal/dispositivo — cada columna
 * (Sesiones, Usuarios, Compras, Ingresos) muestra su valor Y qué % del
 * TOTAL DE ESA MISMA MÉTRICA representa esta fila (ej. "38,5% de las
 * sesiones", pero "44,1% de los ingresos" — son bases distintas, no el
 * mismo % repetido). "Usuarios" es la suma diaria, NO el número
 * deduplicado que GA4 muestra para todo el rango de una sola vez —
 * aclarado abajo. "Conversión" es SEGÚN ANALYTICS, distinta de la
 * conversión real contra pedidos VTEX que se muestra arriba.
 */
export function GaBreakdownTable({ title, rowLabel, rows, totalSessions, showBounceRate = false }: GaBreakdownTableProps) {
  if (rows.length === 0) {
    return (
      <ChartPanel title={title}>
        <p className="py-6 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel title={title}>
      <p className="-mt-1 mb-3 text-xs text-ink-faint">
        Total de sesiones de la tienda en el rango:{' '}
        <span className="font-medium text-ink-muted">{formatNumber(totalSessions)}</span>. Cada columna muestra el %
        sobre el total de ESA misma métrica (el % de sesiones y el % de ingresos tienen bases distintas).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface-panel px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {rowLabel}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Sesiones</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Usuarios</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Compras</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Ingresos</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Conversión<span className="block normal-case text-[10px] font-normal text-ink-faint">(según Analytics)</span>
              </th>
              {showBounceRate && (
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Tasa de rebote</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-surface-border">
                <td
                  className="sticky left-0 max-w-[260px] truncate bg-surface-panel px-3 py-2 font-medium text-ink"
                  title={row.label}
                >
                  {row.label}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{cell(formatNumber(row.sessions), row.sessionsPercent)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{cell(formatNumber(row.totalUsers), row.usersPercent)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{cell(formatNumber(row.purchases), row.purchasesPercent)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{cell(formatCOP(row.gaRevenue), row.revenuePercent)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {row.conversionPercent !== undefined ? formatPercentage(row.conversionPercent) : '—'}
                </td>
                {showBounceRate && (
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                    {row.bounceRatePercent !== undefined ? formatPercentage(row.bounceRatePercent) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        ℹ &quot;Usuarios&quot; es la suma día por día — alguien que visita en más de un día del rango cuenta más de
        una vez. &quot;Conversión&quot; es según el evento de compra de Analytics (no según pedidos reales de VTEX —
        esa conversión real está arriba, en las tarjetas de totales).
      </p>
    </ChartPanel>
  );
}
