import { StoreDashboardResult } from '@/types/dashboard';
import { formatCOP } from '@/lib/format';

interface CityComparisonTableProps {
  stores: StoreDashboardResult[];
  /** Si se pasa con al menos una ciudad, cada tienda muestra SOLO esas ciudades (sin truncar a top N) en vez del ranking completo. */
  selectedCities?: string[];
}

const TOP_CITIES_PER_STORE = 8;

export function CityComparisonTable({ stores, selectedCities = [] }: CityComparisonTableProps) {
  const isFiltered = selectedCities.length > 0;

  const withData = stores.filter((store) => {
    if (!store.success || !store.data) return false;
    if (!isFiltered) return true;
    return Object.keys(store.data.cityBreakdown).some((city) => selectedCities.includes(city));
  });

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">Ciudades por tienda</h3>
      <p className="mb-4 text-xs text-ink-faint">
        {isFiltered
          ? 'Aporte de las ciudades seleccionadas en cada tienda (% sobre el total real de esa tienda).'
          : 'Ranking interno de cada tienda, ordenado de mayor a menor participación.'}
      </p>

      {withData.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {isFiltered
            ? 'Ninguna tienda tiene ventas de las ciudades seleccionadas en este rango.'
            : 'No hay datos de ciudad disponibles todavía.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {withData.map((store) => {
            const sorted = Object.entries(store.data!.cityBreakdown).sort(
              (a, b) => b[1].totalValue - a[1].totalValue,
            );
            const top = isFiltered
              ? sorted.filter(([city]) => selectedCities.includes(city))
              : sorted.slice(0, TOP_CITIES_PER_STORE);
            const remaining = isFiltered ? 0 : sorted.length - top.length;

            return (
              <div
                key={store.id}
                className="rounded-xl border border-surface-border bg-surface p-3.5"
              >
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                  {store.name}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {top.map(([city, breakdown], index) => (
                    <li key={city} className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted">
                        <span className="text-ink-faint">#{index + 1}</span> {city}
                      </span>
                      <span className="font-medium tabular-nums text-ink">
                        {formatCOP(breakdown.totalValue)}{' '}
                        <span className="text-ink-faint">
                          ({breakdown.percentage.toFixed(1)}%)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {remaining > 0 && (
                  <p className="mt-2 text-xs text-ink-faint">
                    +{remaining} {remaining === 1 ? 'ciudad más' : 'ciudades más'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
