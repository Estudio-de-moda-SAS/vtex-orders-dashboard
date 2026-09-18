import { StoreDashboardResult } from '@/types/dashboard';
import { StoreHighlightsByStore } from '@/types/product-analytics';
import { formatCOP, formatNumber } from '@/lib/format';

interface CollectionsByStoreTableProps {
  stores: StoreDashboardResult[];
  highlights: StoreHighlightsByStore;
}

/** El backend usa "Sin colección" como nombre interno (mismo literal en toda la app) — se muestra como "Sin estado". */
function displayCollectionName(collectionName: string): string {
  return collectionName === 'Sin colección' ? 'Sin estado' : collectionName;
}

/**
 * Por tienda: TODAS las colecciones con ventas contabilizadas (mismo
 * criterio de "ventas" que el resto del dashboard), ordenadas de mayor a
 * menor por unidades — excepto "Sin estado", que siempre va AL FINAL (no
 * es una colección real, así que no tiene sentido destacarla primero
 * aunque tenga más unidades que las demás). Cada una con el desglose de
 * categorías vendidas dentro de ella.
 *
 * IMPORTANTE — por qué el valor ($) de "Total mercancía" NO coincide con
 * "Total tienda" (el de la card): las colecciones se calculan a nivel de
 * ITEM/producto (precio de venta del producto), mientras que la card
 * suma el valor de la ORDEN completa — que además incluye flete y otros
 * cargos que no pertenecen a ningún producto/colección puntual
 * (confirmado con datos reales: para Pilatos jul-ago, colecciones sumó
 * $1.423M vs $1.460M de la card, ~$36.6M de diferencia = flete/cargos de
 * orden). Es esperado que "Total mercancía" sea un poco MENOR, nunca un
 * error. Las UNIDADES sí cuadran exacto siempre — "Sin estado" está
 * incluido justo para garantizar eso.
 */
export function CollectionsByStoreTable({ stores, highlights }: CollectionsByStoreTableProps) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">Colecciones por tienda</h3>
      <p className="mb-4 text-xs text-ink-faint">
        Colecciones (Línea/Rack/Outlet/Saldos) con ventas contabilizadas, de mayor a menor por unidades, con sus
        categorías — "Sin estado" siempre al final. El valor ($) es a nivel de producto, así que puede ser algo menor
        al total de la card (que incluye flete y otros cargos de la orden) — las unidades sí cuadran exacto.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => {
          const highlight = highlights[store.id];
          const collections = highlight?.collections ?? [];
          const sumUnits = collections.reduce((acc, c) => acc + c.units, 0);
          const sumSales = collections.reduce((acc, c) => acc + c.sales, 0);

          return (
            <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                {store.name}
              </p>

              {!store.success || !highlight ? (
                <p className="text-xs text-danger">{store.error ?? 'Sin datos'}</p>
              ) : (
                <>
                  <p className="mb-2 text-xs tabular-nums text-ink-faint">
                    Total mercancía: {formatNumber(sumUnits)} unid. · {formatCOP(sumSales)}
                    {sumUnits !== highlight.totals.units && (
                      <span className="text-danger"> (tienda: {formatNumber(highlight.totals.units)} unid.)</span>
                    )}
                    <br />
                    Total tienda (contabilizado): {formatCOP(highlight.totals.sales)} — incluye flete/otros cargos.
                  </p>
                  {collections.length === 0 ? (
                    <p className="text-xs text-ink-faint">Sin ventas registradas.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {collections.map((collection) => (
                        <div key={collection.collectionName}>
                          <p className="mb-1 text-sm text-ink">
                            <span className="font-semibold">{displayCollectionName(collection.collectionName)}</span>{' '}
                            <span className="tabular-nums text-ink-muted">
                              — {formatNumber(collection.units)} unid. · {formatCOP(collection.sales)}
                            </span>
                          </p>
                          {collection.categories.length > 0 && (
                            <ul className="flex flex-col gap-0.5 pl-2">
                              {collection.categories.map((category) => (
                                <li
                                  key={category.categoryName}
                                  className="flex items-baseline justify-between gap-2 text-xs text-ink-muted"
                                >
                                  <span className="truncate">{category.categoryName}</span>
                                  <span className="shrink-0 tabular-nums text-ink">
                                    {formatNumber(category.units)} unid. · {formatCOP(category.sales)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
