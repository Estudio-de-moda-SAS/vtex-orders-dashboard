import { GlobalSummary as GlobalSummaryType } from '@/types/dashboard';
import { formatCOP, formatNumber, revenueBreakdownLabel, REVENUE_BREAKDOWN_ORDER } from '@/lib/format';

interface GlobalSummaryProps {
  summary: GlobalSummaryType;
}

interface Kpi {
  label: string;
  value: string;
  caption?: string;
  tone?: 'default' | 'positive' | 'warning';
}

export function GlobalSummary({ summary }: GlobalSummaryProps) {
  const kpis: Kpi[] = [
    { label: 'Total órdenes', value: formatNumber(summary.totalOrders) },
    {
      label: 'Total',
      value: formatCOP(summary.totalRevenueValue),
      tone: 'positive',
    },
    { label: 'Órdenes contabilizadas', value: formatNumber(summary.totalRevenueOrders) },
    {
      label: 'Tiendas con error',
      value: `${summary.storesWithErrors} / ${summary.storesQueried}`,
      tone: summary.storesWithErrors > 0 ? 'warning' : 'default',
    },
  ];

  const breakdownKpis: Kpi[] = REVENUE_BREAKDOWN_ORDER.map((key) => {
    const breakdown = summary.totalRevenueBreakdown[key] ?? { orders: 0, value: 0 };
    return {
      label: revenueBreakdownLabel(key),
      value: formatCOP(breakdown.value),
      caption: `${formatNumber(breakdown.orders)} órdenes`,
    };
  });

  return (
    <div className="flex flex-col gap-3">
      {summary.storesWithIncompleteData > 0 && summary.storesSyncing === 0 && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          ⚠ {summary.storesWithIncompleteData}{' '}
          {summary.storesWithIncompleteData === 1 ? 'tienda tiene' : 'tiendas tienen'} datos
          posiblemente incompletos. Revisa el detalle en su tarjeta o prueba "Forzar
          actualización".
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-surface-border bg-surface-panel p-4 shadow-panel"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{kpi.label}</p>
            <p
              className={
                'mt-2 font-display text-2xl font-semibold tabular-nums ' +
                (kpi.tone === 'positive'
                  ? 'text-positive'
                  : kpi.tone === 'warning'
                    ? 'text-warning'
                    : 'text-ink')
              }
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
          Desglose por estado
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {breakdownKpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-2xl border border-surface-border bg-surface-panel p-4 shadow-panel"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{kpi.label}</p>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
                {kpi.value}
              </p>
              {kpi.caption && <p className="mt-1 text-xs text-ink-faint">{kpi.caption}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
