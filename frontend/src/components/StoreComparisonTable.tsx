import { Fragment } from 'react';
import { StoreDashboardResult } from '@/types/dashboard';
import { formatCOP, formatNumber, revenueBreakdownLabel, REVENUE_BREAKDOWN_ORDER } from '@/lib/format';

interface StoreComparisonTableProps {
  stores: StoreDashboardResult[];
}

export function StoreComparisonTable({ stores }: StoreComparisonTableProps) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">Comparativo de tiendas</h3>
      <p className="mb-4 text-xs text-ink-faint">
        Ordenado de mayor a menor participación (valor contabilizado).
      </p>

      {/* Tabla en desktop/tablet */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
              <th className="py-2 pr-4 font-medium">Tienda</th>
              <th className="py-2 pr-4 font-medium">Total</th>
              {REVENUE_BREAKDOWN_ORDER.map((key) => (
                <th key={key} className="py-2 pr-4 font-medium">
                  {revenueBreakdownLabel(key)}
                </th>
              ))}
              <th className="py-2 pr-4 font-medium">Total contabilizado</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} className="border-b border-surface-border/60 last:border-0">
                <td className="py-2.5 pr-4">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: store.color }}
                    />
                    {store.name}
                  </span>
                </td>
                {store.success && store.data ? (
                  <>
                    <td className="py-2.5 pr-4 tabular-nums text-ink-muted">
                      {formatNumber(store.data.totalOrders)}
                    </td>
                    {REVENUE_BREAKDOWN_ORDER.map((key) => (
                      <td key={key} className="py-2.5 pr-4 tabular-nums text-ink-muted">
                        {formatNumber(store.data?.revenueBreakdown[key]?.orders ?? 0)}
                      </td>
                    ))}
                    <td className="py-2.5 pr-4 font-medium tabular-nums text-ink">
                      {formatCOP(store.data.revenueTotalValue)}
                    </td>
                  </>
                ) : (
                  <td colSpan={REVENUE_BREAKDOWN_ORDER.length + 2} className="py-2.5 pr-4 text-danger">
                    {store.error ?? 'Sin datos'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards en mobile */}
      <div className="flex flex-col gap-3 sm:hidden">
        {stores.map((store) => (
          <div
            key={store.id}
            className="rounded-xl border border-surface-border bg-surface p-3.5"
          >
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
              {store.name}
            </p>
            {store.success && store.data ? (
              <dl className="grid grid-cols-2 gap-y-1 text-xs text-ink-muted">
                <dt>Total</dt>
                <dd className="text-right tabular-nums text-ink">
                  {formatNumber(store.data.totalOrders)}
                </dd>
                {REVENUE_BREAKDOWN_ORDER.map((key) => (
                  <Fragment key={key}>
                    <dt>{revenueBreakdownLabel(key)}</dt>
                    <dd className="text-right tabular-nums text-ink">
                      {formatNumber(store.data?.revenueBreakdown[key]?.orders ?? 0)}
                    </dd>
                  </Fragment>
                ))}
                <dt>Total contabilizado</dt>
                <dd className="text-right font-medium tabular-nums text-ink">
                  {formatCOP(store.data.revenueTotalValue)}
                </dd>
              </dl>
            ) : (
              <p className="text-xs text-danger">{store.error ?? 'Sin datos'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
