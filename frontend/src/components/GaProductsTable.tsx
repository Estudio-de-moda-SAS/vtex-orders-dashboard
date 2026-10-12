import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

export interface GaProductsTableRow {
  itemId: string;
  itemName: string;
  itemCategory: string;
  itemsViewed: number;
  itemsAddedToCart: number;
  itemsPurchased: number;
  itemRevenue: number;
  /** `itemsPurchased ÷ itemsViewed × 100` — la señal clave: mucha vista y % bajo apunta a revisar stock/precio/tallas/ficha. */
  viewToPurchasePercent: number;
  /**
   * Link de producto — `undefined` para "(otros)"/"(not set)" (no son
   * productos reales). Puede ser el link REAL resuelto por el backend
   * contra el catálogo de VTEX, o — si ese SKU aún no se resolvió — un
   * link de BÚSQUEDA en el sitio (`/s?q=`) como respaldo (ver `/analytics`).
   */
  productUrl?: string;
  /** Referencia (`RefId` de VTEX) del producto, si ya se resolvió — solo informativa. */
  productReference?: string;
}

interface GaProductsTableProps {
  title: string;
  rows: GaProductsTableRow[];
}

/**
 * Tabla de productos — vistas/carrito/compras/ingresos SON DEL PRODUCTO
 * (`itemsViewed`/`itemsPurchased`...), no de sesión. `rows` ya viene
 * ordenado por quien llama (por vistas o por ingresos, ver `/analytics`)
 * — este componente solo renderiza en ese orden.
 */
export function GaProductsTable({ title, rows }: GaProductsTableProps) {
  if (rows.length === 0) {
    return (
      <ChartPanel title={title}>
        <p className="py-6 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel title={title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface-panel px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Producto
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Vistas</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Carrito</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Compras</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Ingresos</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Vista → compra
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.itemId} className="border-t border-surface-border">
                <td
                  className="sticky left-0 max-w-[260px] truncate bg-surface-panel px-3 py-2 font-medium text-ink"
                  title={`${row.itemName} — ${row.itemCategory}${row.productUrl ? ` — ID ${row.itemId}` : ''}${row.productReference ? ` — Ref ${row.productReference}` : ''}`}
                >
                  {row.productUrl ? (
                    <a href={row.productUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {row.itemName}
                    </a>
                  ) : (
                    row.itemName
                  )}
                  <span className="block truncate text-xs font-normal text-ink-faint">
                    {row.itemCategory}
                    {row.productUrl && ` · ID ${row.itemId}`}
                    {row.productReference && ` · Ref ${row.productReference}`}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{formatNumber(row.itemsViewed)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{formatNumber(row.itemsAddedToCart)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{formatNumber(row.itemsPurchased)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{formatCOP(row.itemRevenue)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                  {formatPercentage(row.viewToPurchasePercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartPanel>
  );
}
