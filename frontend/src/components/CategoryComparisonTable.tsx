import { StoreDashboardResult } from '@/types/dashboard';
import { CategoryRankingByStore } from '@/types/product-analytics';
import { formatCOP } from '@/lib/format';

interface CategoryComparisonTableProps {
  stores: StoreDashboardResult[];
  /**
   * Ranking de categorías por tienda sobre TODAS las órdenes (mismo
   * criterio que la sección "Categoría top" de `StoreCard` y que
   * `CityComparisonTable` — a propósito NO el mismo dataset que
   * `GeneralCategoryBreakdown`, que sí filtra a solo ventas
   * contabilizadas; si esta tabla usara ese otro criterio, su top
   * categoría por tienda podría no coincidir con la de la card,
   * confundiendo más de lo que ayuda).
   */
  categoryRanking: CategoryRankingByStore;
  /** Si se pasa con al menos una categoría, cada tienda muestra SOLO esas categorías (sin truncar a top N) en vez del ranking completo. */
  selectedCategories?: string[];
}

const TOP_CATEGORIES_PER_STORE = 8;

export function CategoryComparisonTable({ stores, categoryRanking, selectedCategories = [] }: CategoryComparisonTableProps) {
  const isFiltered = selectedCategories.length > 0;

  const withData = stores.filter((store) => {
    const categories = categoryRanking[store.id]?.categories;
    if (!categories || categories.length === 0) return false;
    if (!isFiltered) return true;
    return categories.some((entry) => selectedCategories.includes(entry.category));
  });

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">Categorías por tienda</h3>
      <p className="mb-4 text-xs text-ink-faint">
        {isFiltered
          ? 'Aporte de las categorías seleccionadas en cada tienda (% sobre el total real de esa tienda).'
          : 'Ranking interno de cada tienda, ordenado de mayor a menor participación.'}
      </p>

      {withData.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {isFiltered
            ? 'Ninguna tienda tiene ventas de las categorías seleccionadas en este rango.'
            : 'No hay datos de categoría disponibles todavía.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {withData.map((store) => {
            const categories = categoryRanking[store.id]?.categories ?? [];
            const top = isFiltered
              ? categories.filter((entry) => selectedCategories.includes(entry.category))
              : categories.slice(0, TOP_CATEGORIES_PER_STORE);
            const remaining = isFiltered ? 0 : categories.length - top.length;

            return (
              <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                  {store.name}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {top.map((entry, index) => (
                    <li key={entry.category} className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted">
                        <span className="text-ink-faint">#{index + 1}</span> {entry.category}
                      </span>
                      <span className="font-medium tabular-nums text-ink">
                        {formatCOP(entry.value)}{' '}
                        <span className="text-ink-faint">({entry.percentage.toFixed(1)}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {remaining > 0 && (
                  <p className="mt-2 text-xs text-ink-faint">
                    +{remaining} {remaining === 1 ? 'categoría más' : 'categorías más'}
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
