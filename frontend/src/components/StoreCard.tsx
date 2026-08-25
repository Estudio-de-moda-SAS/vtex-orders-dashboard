import { CityBreakdown, StoreDashboardResult } from '@/types/dashboard';
import { formatCOP, formatNumber, formatPercentage, statusLabel } from '@/lib/format';
import { DataConsistencyIndicator } from './DataConsistencyIndicator';

interface StoreCardProps {
  store: StoreDashboardResult;
  generatedAt?: string;
}

const TOP_CITIES_LIMIT = 10;

export function StoreCard({ store, generatedAt }: StoreCardProps) {
  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel"
      style={{ borderTopColor: store.color, borderTopWidth: 3 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: store.color }} />
          <h3 className="font-display text-base font-semibold text-ink">{store.name}</h3>
        </div>
        {!store.success && (
          <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-medium text-danger">
            Error
          </span>
        )}
      </div>

      {!store.success ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm text-danger">
          {store.error ?? 'No fue posible consultar esta tienda.'}
        </p>
      ) : (
        store.data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Total órdenes" value={formatNumber(store.data.totalOrders)} />
              <Metric label="Contabilizadas" value={formatNumber(store.data.revenueOrders)} />
              <Metric
                label="Valor contabilizado"
                value={formatCOP(store.data.revenueTotalValue)}
                span
              />
            </div>

            <Section title="Estados">
              <ul className="flex flex-col gap-1.5">
                {Object.entries(store.data.statusCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-ink-muted">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: store.color }}
                        />
                        {statusLabel(status)}
                      </span>
                      <span className="font-medium tabular-nums text-ink">{formatNumber(count)}</span>
                    </li>
                  ))}
              </ul>
            </Section>

            <Section title="Ciudades">
              <TopCities cityBreakdown={store.data.cityBreakdown} />
            </Section>

            <DataConsistencyIndicator data={store.data} generatedAt={generatedAt} />
          </>
        )
      )}
    </div>
  );
}

function Metric({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : undefined}>
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{title}</p>
      {children}
    </div>
  );
}

/** Solo las `TOP_CITIES_LIMIT` ciudades que más generan compras (por valor), igual que el resto de los recuadros de ciudades. */
function TopCities({ cityBreakdown }: { cityBreakdown: Record<string, CityBreakdown> }) {
  const sorted = Object.entries(cityBreakdown).sort((a, b) => b[1].totalValue - a[1].totalValue);
  const top = sorted.slice(0, TOP_CITIES_LIMIT);
  const remaining = sorted.length - top.length;

  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {top.map(([city, breakdown]) => (
          <li key={city} className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">{city}</span>
            <span className="font-medium tabular-nums text-ink">
              {formatCOP(breakdown.totalValue)}{' '}
              <span className="text-ink-faint">({formatPercentage(breakdown.percentage)})</span>
            </span>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <p className="mt-2 text-xs text-ink-faint">
          +{remaining} {remaining === 1 ? 'ciudad más' : 'ciudades más'}
        </p>
      )}
    </>
  );
}
