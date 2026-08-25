import { SegmentDashboardResult } from '@/types/dashboard';
import { formatCOP, formatNumber } from '@/lib/format';

interface SegmentComparisonTableProps {
  title: string;
  emptyLabel: string;
  segments: SegmentDashboardResult[];
}

/**
 * Tabla comparativa genérica para segmentos dentro de una tienda (por
 * ejemplo, vendedores/sellers o canales de marketplace de Pilatos).
 * Recibe los segmentos ya filtrados por tipo; los ordena de mayor a menor
 * valor contabilizado ("los que más hayan generado ventas hasta el que
 * menos aportó").
 */
export function SegmentComparisonTable({ title, emptyLabel, segments }: SegmentComparisonTableProps) {
  if (segments.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-2 font-display text-base font-semibold text-ink">{title}</h3>
        <p className="text-sm text-ink-faint">{emptyLabel}</p>
      </div>
    );
  }

  const sorted = [...segments].sort((a, b) => {
    const aValue = a.success && a.data ? a.data.revenueTotalValue : -1;
    const bValue = b.success && b.data ? b.data.revenueTotalValue : -1;
    return bValue - aValue;
  });

  const totalRevenue = sorted.reduce(
    (acc, s) => acc + (s.success && s.data ? s.data.revenueTotalValue : 0),
    0,
  );

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        <span className="text-xs text-ink-faint">Total: {formatCOP(totalRevenue)}</span>
      </div>

      {/* Tabla en desktop/tablet */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
              <th className="py-2 pr-4 font-medium">#</th>
              <th className="py-2 pr-4 font-medium">Nombre</th>
              <th className="py-2 pr-4 font-medium">Órdenes</th>
              <th className="py-2 pr-4 font-medium">Contabilizadas</th>
              <th className="py-2 pr-4 font-medium">Valor contabilizado</th>
              <th className="py-2 pr-4 font-medium">% del total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((segment, index) => {
              const share =
                totalRevenue > 0 && segment.success && segment.data
                  ? (segment.data.revenueTotalValue / totalRevenue) * 100
                  : 0;
              return (
                <tr key={segment.id} className="border-b border-surface-border/60 last:border-0">
                  <td className="py-2.5 pr-4 tabular-nums text-ink-faint">{index + 1}</td>
                  <td className="py-2.5 pr-4 font-medium text-ink">{segment.label}</td>
                  {segment.success && segment.data ? (
                    <>
                      <td className="py-2.5 pr-4 tabular-nums text-ink-muted">
                        {formatNumber(segment.data.totalOrders)}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-ink-muted">
                        {formatNumber(segment.data.revenueOrders)}
                      </td>
                      <td className="py-2.5 pr-4 font-medium tabular-nums text-ink">
                        {formatCOP(segment.data.revenueTotalValue)}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-ink-muted">
                        {share.toFixed(1)}%
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="py-2.5 pr-4 text-danger">
                      {segment.error ?? 'Sin datos'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards en mobile */}
      <div className="flex flex-col gap-3 sm:hidden">
        {sorted.map((segment, index) => (
          <div key={segment.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
              <span className="text-xs text-ink-faint">#{index + 1}</span>
              {segment.label}
            </p>
            {segment.success && segment.data ? (
              <dl className="grid grid-cols-2 gap-y-1 text-xs text-ink-muted">
                <dt>Órdenes</dt>
                <dd className="text-right tabular-nums text-ink">
                  {formatNumber(segment.data.totalOrders)}
                </dd>
                <dt>Contabilizadas</dt>
                <dd className="text-right tabular-nums text-ink">
                  {formatNumber(segment.data.revenueOrders)}
                </dd>
                <dt>Valor contabilizado</dt>
                <dd className="text-right font-medium tabular-nums text-ink">
                  {formatCOP(segment.data.revenueTotalValue)}
                </dd>
              </dl>
            ) : (
              <p className="text-xs text-danger">{segment.error ?? 'Sin datos'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
