import { CategoryBreakdown } from '@/types/product-analytics';
import { formatCOP } from '@/lib/format';

interface GeneralCategoryBreakdownProps {
  /** Aporte de cada categoría ya agregado por el backend sobre el total de ventas contabilizadas de todas las tiendas combinadas. */
  general: Record<string, CategoryBreakdown>;
  /** Si se pasa con al menos una categoría, se muestran SOLO esas categorías (sin truncar a top N) en vez del ranking completo. */
  selectedCategories?: string[];
}

const TOP_CATEGORIES_LIMIT = 10;

interface RankedCategory {
  category: string;
  quantity: number;
  value: number;
  percentage: number;
}

/**
 * A diferencia de `GeneralCityBreakdown`, aquí no se agrega nada del lado
 * del cliente: el backend ya entrega `general` combinando todas las
 * tiendas sobre el mismo criterio de "ventas contabilizadas", así que este
 * componente solo ordena y muestra. El "Total" mostrado es siempre la
 * suma de TODAS las categorías (no solo las filtradas/mostradas), igual
 * que su contraparte de ciudades.
 */
export function GeneralCategoryBreakdown({ general, selectedCategories = [] }: GeneralCategoryBreakdownProps) {
  const grandTotal = Object.values(general).reduce((acc, entry) => acc + entry.value, 0);

  const ranked: RankedCategory[] = Object.entries(general)
    .map(([category, breakdown]) => ({
      category,
      quantity: breakdown.quantity,
      value: breakdown.value,
      percentage: breakdown.percentage,
    }))
    .sort((a, b) => b.value - a.value);

  const isFiltered = selectedCategories.length > 0;
  const shown = isFiltered
    ? ranked.filter((r) => selectedCategories.includes(r.category))
    : ranked.slice(0, TOP_CATEGORIES_LIMIT);
  const remaining = isFiltered ? 0 : ranked.length - shown.length;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-base font-semibold text-ink">Aporte general por categoría</h3>
        <span className="text-xs text-ink-faint">Total: {formatCOP(grandTotal)}</span>
      </div>
      <p className="mb-4 text-xs text-ink-faint">
        {isFiltered
          ? 'Aporte de las categorías seleccionadas sobre el total de ventas contabilizadas de todas las tiendas combinadas.'
          : 'Cuánto representa cada categoría del total de ventas contabilizadas de todas las tiendas combinadas.'}
      </p>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {isFiltered
            ? 'No hay ventas de las categorías seleccionadas en este rango.'
            : 'No hay datos de categoría disponibles todavía.'}
        </p>
      ) : (
        <>
          {/* Tabla en desktop/tablet */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-4 font-medium">#</th>
                  <th className="py-2 pr-4 font-medium">Categoría</th>
                  <th className="py-2 pr-4 font-medium">Valor</th>
                  <th className="py-2 pr-4 font-medium">% del total general</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((entry, index) => (
                  <tr key={entry.category} className="border-b border-surface-border/60 last:border-0">
                    <td className="py-2.5 pr-4 tabular-nums text-ink-faint">{index + 1}</td>
                    <td className="py-2.5 pr-4 font-medium text-ink">{entry.category}</td>
                    <td className="py-2.5 pr-4 font-medium tabular-nums text-ink">
                      {formatCOP(entry.value)}
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
              <div key={entry.category} className="rounded-xl border border-surface-border bg-surface p-3.5">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="text-xs text-ink-faint">#{index + 1}</span>
                  {entry.category}
                </p>
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span className="font-medium text-ink">{formatCOP(entry.value)}</span>
                  <span>{entry.percentage.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>

          {remaining > 0 && (
            <p className="mt-3 text-xs text-ink-faint">
              +{remaining} {remaining === 1 ? 'categoría más' : 'categorías más'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
