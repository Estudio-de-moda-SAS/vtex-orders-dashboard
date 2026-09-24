import { StoreDashboardResult } from '@/types/dashboard';
import { SmartSaleSummaryByStore } from '@/types/smartsale';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';

interface SmartSaleSummarySectionProps {
  stores: StoreDashboardResult[];
  summary: SmartSaleSummaryByStore;
}

/**
 * Por tienda: (1) venta total SIN filtrar (referencia, título de la
 * card), (2) total del canal SmartSale, (3) desglose por persona con su
 * % sobre ESE total (no sobre el de la tienda). Solo esta sección separa
 * por persona — el resto de secciones de `/smartsale` muestran el canal
 * combinado.
 *
 * Arriba de la grilla por tienda, 3 cuadros generales: venta total de
 * TODAS las tiendas combinadas, venta total de SmartSale combinada, y el
 * % que SmartSale representa sobre ese total general — más un cuadro
 * adicional que totaliza cada VENDEDOR sumando las 6 tiendas (a
 * diferencia del desglose por persona de cada card, que es solo de ESA
 * tienda).
 */
export function SmartSaleSummarySection({ stores, summary }: SmartSaleSummarySectionProps) {
  const withData = stores.filter((store) => summary[store.id]);

  const totalChannelSales = withData.reduce((acc, store) => acc + summary[store.id].storeTotalSales, 0);
  const totalSmartSaleSales = withData.reduce((acc, store) => acc + summary[store.id].smartSaleSales, 0);
  const totalSmartSaleOrders = withData.reduce((acc, store) => acc + summary[store.id].smartSaleOrders, 0);
  const overallPercentage = totalChannelSales > 0 ? (totalSmartSaleSales / totalChannelSales) * 100 : 0;

  const channelByPerson = new Map<string, { name: string; orders: number; sales: number }>();
  for (const store of withData) {
    for (const person of summary[store.id].byPerson) {
      const current = channelByPerson.get(person.utmiCampaign) ?? { name: person.name, orders: 0, sales: 0 };
      current.orders += person.orders;
      current.sales += person.sales;
      channelByPerson.set(person.utmiCampaign, current);
    }
  }
  const rankedChannelByPerson = Array.from(channelByPerson.entries())
    .map(([utmiCampaign, p]) => ({
      utmiCampaign,
      ...p,
      percentage: totalSmartSaleSales > 0 ? (p.sales / totalSmartSaleSales) * 100 : 0,
    }))
    .sort((a, b) => b.sales - a.sales);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Venta total del canal (todas las tiendas)</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(totalChannelSales)}</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-accent/5 p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Venta total SmartSale (todas las tiendas)</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(totalSmartSaleSales)}</p>
          <p className="text-xs text-ink-faint">{formatNumber(totalSmartSaleOrders)} ord.</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">% de participación de SmartSale</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatPercentage(overallPercentage)}</p>
          <p className="text-xs text-ink-faint">sobre la venta total del canal</p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Total por vendedor (todas las tiendas)</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Cada vendedor de SmartSale, sumando las 6 tiendas — a diferencia de las cards de abajo, que muestran a cada
          vendedor solo dentro de UNA tienda.
        </p>
        {rankedChannelByPerson.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin ventas de SmartSale en este rango.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rankedChannelByPerson.map((person) => (
              <li key={person.utmiCampaign} className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{person.name}</span>
                <span className="font-medium tabular-nums text-ink">
                  {formatNumber(person.orders)} ord. · {formatCOP(person.sales)}{' '}
                  <span className="text-ink-faint">({formatPercentage(person.percentage)})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {withData.map((store) => {
        const data = summary[store.id];
        return (
          <div
            key={store.id}
            className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel"
            style={{ borderTopColor: store.color, borderTopWidth: 3 }}
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: store.color }} />
              <h3 className="font-display text-base font-semibold text-ink">{store.name}</h3>
            </div>

            <p className="-mt-2 text-xs">
              <span className="text-ink-faint">Venta total de la tienda: </span>
              <span className="font-display text-lg font-semibold text-ink">{formatCOP(data.storeTotalSales)}</span>
            </p>

            <div className="rounded-xl bg-accent/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas SmartSale</p>
              <p className="font-display text-xl font-semibold text-ink">{formatCOP(data.smartSaleSales)}</p>
              <p className="text-xs text-ink-faint">
                {formatNumber(data.smartSaleOrders)} ord. ·{' '}
                {data.storeTotalSales > 0
                  ? formatPercentage((data.smartSaleSales / data.storeTotalSales) * 100)
                  : formatPercentage(0)}{' '}
                de la venta total
              </p>
            </div>

            {data.byPerson.length === 0 ? (
              <p className="text-xs text-ink-faint">Sin ventas de SmartSale en este rango.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.byPerson.map((person) => (
                  <li key={person.utmiCampaign} className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">{person.name}</span>
                    <span className="font-medium tabular-nums text-ink">
                      {formatNumber(person.orders)} ord. · {formatCOP(person.sales)}{' '}
                      <span className="text-ink-faint">({formatPercentage(person.percentage)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
