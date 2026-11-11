'use client';

import { ChartPanel } from '@/components/OrdersByStoreChart';
import { formatCOP, formatNumber } from '@/lib/format';
import { StoreInfo } from '@/types/dashboard';

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por valor. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

/** Una columna de valores (ej. "POS", "ERP", "Total") — cantidad de notas y valor (negativo). */
export interface CreditNotesColumn {
  label: string;
  count: (storeId: string) => number;
  value: (storeId: string) => number;
  totalCount: number;
  totalValue: number;
}

/**
 * Cuadro "Notas crédito" de los Resúmenes (`/presupuesto` y `/smartsale`):
 * notas crédito del rango por tienda y total, YA RESTADAS en las ventas de
 * arriba (decisión del usuario, nov-2026 — así lo mide el área). Valores
 * negativos, tal cual el ERP. Columnas configurables (solo ERP, o POS + ERP).
 * `extra` permite agregar columnas de contexto (ej. venta bruta y neta).
 */
export function CreditNotesByStoreTable({
  title,
  storeIds,
  storeById,
  columns,
  extra = [],
  footnote,
}: {
  title: string;
  storeIds: string[];
  storeById: Map<string, StoreInfo>;
  columns: CreditNotesColumn[];
  extra?: { label: string; value: (storeId: string) => number; total: number }[];
  footnote: string;
}) {
  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint';
  const ordered = STORE_DISPLAY_ORDER.filter((id) => storeIds.includes(id));

  return (
    <ChartPanel title={title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Marca</th>
              {columns.map((c) => (
                <th key={c.label} className={`${th} text-right`} colSpan={2}>
                  {c.label}
                </th>
              ))}
              {extra.map((e) => (
                <th key={e.label} className={`${th} text-right`}>
                  {e.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((storeId) => {
              const info = storeById.get(storeId);
              return (
                <tr key={storeId} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-medium text-ink">
                    <span className="inline-flex items-center gap-2">
                      {info && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: info.color }} />}
                      {info?.name ?? storeId}
                    </span>
                  </td>
                  {columns.map((c) => (
                    <CountValueCells key={c.label} count={c.count(storeId)} value={c.value(storeId)} />
                  ))}
                  {extra.map((e) => (
                    <td key={e.label} className="px-3 py-2 text-right tabular-nums text-ink">
                      {formatCOP(e.value(storeId))}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr className="border-t-2 border-surface-border font-semibold text-ink">
              <td className="px-3 py-2">Total</td>
              {columns.map((c) => (
                <CountValueCells key={c.label} count={c.totalCount} value={c.totalValue} />
              ))}
              {extra.map((e) => (
                <td key={e.label} className="px-3 py-2 text-right tabular-nums">
                  {formatCOP(e.total)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-surface-border pt-3 text-xs text-ink-faint">{footnote}</p>
    </ChartPanel>
  );
}

function CountValueCells({ count, value }: { count: number; value: number }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{formatNumber(count)}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${value < 0 ? 'text-danger' : 'text-ink'}`}>{formatCOP(value)}</td>
    </>
  );
}
