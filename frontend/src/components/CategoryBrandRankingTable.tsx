import { StoreDashboardResult } from '@/types/dashboard';
import { CategoryBrandRankingByStore, CategoryRankingByStore } from '@/types/product-analytics';
import { formatCOP, formatNumber } from '@/lib/format';

interface CategoryBrandRankingTableProps {
  stores: StoreDashboardResult[];
  categoryRanking: CategoryRankingByStore;
  categoryBrandRanking: CategoryBrandRankingByStore;
}

/**
 * Ranking de categorías por tienda, con marca top dentro de cada categoría
 * cuando aplica (solo tiendas multimarca — ver `CategoryBrandRankingResult`).
 * Para una tienda multimarca se muestra "Categoría → Marca"; para una
 * monomarca, solo la categoría (la marca sería siempre la misma tienda,
 * no aporta información).
 */
export function CategoryBrandRankingTable({ stores, categoryRanking, categoryBrandRanking }: CategoryBrandRankingTableProps) {
  const withData = stores.filter((store) => (categoryRanking[store.id]?.categories.length ?? 0) > 0);

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">Categoría y marca top por tienda</h3>
      <p className="mb-4 text-xs text-ink-faint">
        Ranking de categorías de cada tienda; en tiendas multimarca se indica también la marca que más
        vendió dentro de cada categoría.
      </p>

      {withData.length === 0 ? (
        <p className="text-sm text-ink-faint">No hay datos de categoría disponibles todavía.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {withData.map((store) => {
            const categories = categoryRanking[store.id]?.categories ?? [];
            const brandResult = categoryBrandRanking[store.id];
            const brandByCategory =
              brandResult?.applicable === true
                ? new Map(brandResult.categories.map((entry) => [entry.category, entry.topBrand]))
                : null;

            return (
              <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                  {store.name}
                </p>
                {brandResult?.applicable === false && (
                  <p className="mb-2 text-xs text-ink-faint">{brandResult.reason}</p>
                )}
                <ul className="flex flex-col gap-1.5">
                  {categories.map((entry, index) => {
                    const topBrand = brandByCategory?.get(entry.category);
                    return (
                      <li key={entry.category} className="flex items-center justify-between text-xs">
                        <span className="text-ink-muted">
                          <span className="text-ink-faint">#{index + 1}</span> {entry.category}
                          {topBrand && (
                            <>
                              {' '}
                              <span className="text-ink-faint">→</span>{' '}
                              <span className="font-medium text-ink">{topBrand}</span>
                            </>
                          )}
                        </span>
                        <span className="font-medium tabular-nums text-ink">
                          {formatNumber(entry.quantity)}{' '}
                          <span className="text-ink-faint">· {formatCOP(entry.value)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
