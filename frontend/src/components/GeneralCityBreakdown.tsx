import { StoreDashboardResult } from '@/types/dashboard';
import { formatCOP } from '@/lib/format';

interface GeneralCityBreakdownProps {
  stores: StoreDashboardResult[];
  /** Si se pasa con al menos una ciudad, se muestran SOLO esas ciudades (sin truncar a top N) en vez del ranking completo. */
  selectedCities?: string[];
}

const TOP_CITIES_LIMIT = 10;

interface RankedCity {
  city: string;
  totalValue: number;
  count: number;
  percentage: number;
}

/**
 * Ranking de ciudades combinando TODAS las tiendas, con el % que cada
 * ciudad representa del total GENERAL DE VENTAS CONTABILIZADAS (no del
 * total de una tienda individual, como sí hace `CityComparisonTable`).
 * A propósito usa `cityRevenueBreakdown` (solo órdenes contabilizadas) y
 * NO `cityBreakdown` (todas las órdenes): el objetivo de este recuadro es
 * comparar el aporte real de cada ciudad contra "lo que realmente se
 * vendió" — el mismo criterio que "Total"/"valor contabilizado" en el
 * resto del dashboard — así el "Total" que se muestra arriba SÍ coincide
 * con la suma de las ciudades. Complementa al ranking por tienda, no lo
 * reemplaza.
 */
export function GeneralCityBreakdown({ stores, selectedCities = [] }: GeneralCityBreakdownProps) {
  const totals = new Map<string, { totalValue: number; count: number }>();
  let grandTotal = 0;

  for (const store of stores) {
    if (!store.success || !store.data) continue;
    for (const [city, breakdown] of Object.entries(store.data.cityRevenueBreakdown)) {
      const current = totals.get(city) ?? { totalValue: 0, count: 0 };
      current.totalValue += breakdown.totalValue;
      current.count += breakdown.count;
      totals.set(city, current);
      grandTotal += breakdown.totalValue;
    }
  }

  const ranked: RankedCity[] = Array.from(totals.entries())
    .map(([city, t]) => ({
      city,
      totalValue: t.totalValue,
      count: t.count,
      percentage: grandTotal > 0 ? (t.totalValue / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  const isFiltered = selectedCities.length > 0;
  const shown = isFiltered ? ranked.filter((r) => selectedCities.includes(r.city)) : ranked.slice(0, TOP_CITIES_LIMIT);
  const remaining = isFiltered ? 0 : ranked.length - shown.length;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-base font-semibold text-ink">Aporte general por ciudad</h3>
        <span className="text-xs text-ink-faint">Total: {formatCOP(grandTotal)}</span>
      </div>
      <p className="mb-4 text-xs text-ink-faint">
        {isFiltered
          ? 'Aporte de las ciudades seleccionadas sobre el total de ventas contabilizadas de todas las tiendas combinadas.'
          : 'Cuánto representa cada ciudad del total de ventas contabilizadas de todas las tiendas combinadas.'}
      </p>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {isFiltered
            ? 'No hay ventas de las ciudades seleccionadas en este rango.'
            : 'No hay datos de ciudad disponibles todavía.'}
        </p>
      ) : (
        <>
          {/* Tabla en desktop/tablet */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-4 font-medium">#</th>
                  <th className="py-2 pr-4 font-medium">Ciudad</th>
                  <th className="py-2 pr-4 font-medium">Valor</th>
                  <th className="py-2 pr-4 font-medium">% del total general</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((entry, index) => (
                  <tr key={entry.city} className="border-b border-surface-border/60 last:border-0">
                    <td className="py-2.5 pr-4 tabular-nums text-ink-faint">{index + 1}</td>
                    <td className="py-2.5 pr-4 font-medium text-ink">{entry.city}</td>
                    <td className="py-2.5 pr-4 font-medium tabular-nums text-ink">
                      {formatCOP(entry.totalValue)}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-ink-muted">{entry.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards en mobile */}
          <div className="flex flex-col gap-2 sm:hidden">
            {shown.map((entry, index) => (
              <div key={entry.city} className="rounded-xl border border-surface-border bg-surface p-3.5">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="text-xs text-ink-faint">#{index + 1}</span>
                  {entry.city}
                </p>
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span className="font-medium text-ink">{formatCOP(entry.totalValue)}</span>
                  <span>{entry.percentage.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>

          {remaining > 0 && (
            <p className="mt-3 text-xs text-ink-faint">
              +{remaining} {remaining === 1 ? 'ciudad más' : 'ciudades más'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
