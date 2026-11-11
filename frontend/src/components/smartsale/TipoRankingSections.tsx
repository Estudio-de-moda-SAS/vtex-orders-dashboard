'use client';

import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { StoreInfo } from '@/types/dashboard';

/** Se muestran los 10 primeros; el backend devuelve la lista completa. */
const TOP_N = 10;

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

export interface TipoItem {
  tipo: string;
  units: number;
  sales: number;
}

function share(part: number, whole: number): string {
  return formatPercentage(whole > 0 ? (part / whole) * 100 : 0);
}

/**
 * "Tipo más vendido en general" + "Tipo más vendido por marca" (top 10,
 * ordenado por venta, con unidades) — mismo diseño en Ventas POS, Ventas
 * ERP y Resumen de `/smartsale`. Solo productos: flete y empaque no son
 * tipo de producto (ya vienen excluidos del backend).
 */
export function TipoRankingSections({
  general,
  byStore,
  stores,
  sourceLabel,
}: {
  general: TipoItem[];
  byStore: { storeId: string; byTipo: TipoItem[] }[];
  stores: Map<string, StoreInfo>;
  /** Ej. "POS", "ERP", "POS + ERP" — solo para los textos. */
  sourceLabel: string;
}) {
  const generalTotal = general.reduce((a, t) => a + t.sales, 0);
  const ordered = [...byStore].sort((a, b) => STORE_DISPLAY_ORDER.indexOf(a.storeId) - STORE_DISPLAY_ORDER.indexOf(b.storeId));
  const panel = 'rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel';

  return (
    <>
      <div className={panel}>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Tipo más vendido en general ({sourceLabel})</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Las 6 marcas juntas, ordenado por venta, solo productos (flete y empaque no son tipo de producto).
          {general.length > TOP_N && ` Mostrando los ${TOP_N} primeros de ${general.length} tipos.`} % sobre la venta de
          productos ({formatCOP(generalTotal)}).
        </p>
        {general.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin ventas de productos en este rango.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {general.slice(0, TOP_N).map((t, i) => (
              <li key={t.tipo} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-ink">
                  <span className="mr-2 tabular-nums text-ink-faint">{i + 1}.</span>
                  {t.tipo}
                </span>
                <span className="font-medium tabular-nums text-ink">
                  {formatNumber(t.units)} und. · {formatCOP(t.sales)} <span className="text-ink-faint">({share(t.sales, generalTotal)})</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className={panel}>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Tipo más vendido por marca ({sourceLabel})</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Los {TOP_N} tipos con más venta de cada marca (algunas marcas venden menos tipos). % sobre la venta de productos de esa
          marca.
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {ordered.map((store) => {
            const info = stores.get(store.storeId);
            const storeTotal = store.byTipo.reduce((a, t) => a + t.sales, 0);
            return (
              <div
                key={store.storeId}
                className="rounded-xl border border-surface-border bg-surface p-4"
                style={info ? { borderTopColor: info.color, borderTopWidth: 3 } : undefined}
              >
                <div className="mb-2 flex items-center gap-2">
                  {info && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: info.color }} />}
                  <h4 className="font-display text-sm font-semibold text-ink">{info?.name ?? store.storeId}</h4>
                  <span className="ml-auto text-xs tabular-nums text-ink-faint">{formatCOP(storeTotal)}</span>
                </div>
                {store.byTipo.length === 0 ? (
                  <p className="text-xs text-ink-faint">Sin ventas de productos en este rango.</p>
                ) : (
                  <ol className="flex flex-col gap-1.5">
                    {store.byTipo.slice(0, TOP_N).map((t, i) => (
                      <li key={t.tipo} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-ink-muted">
                          <span className="mr-1.5 tabular-nums text-ink-faint">{i + 1}.</span>
                          {t.tipo}
                        </span>
                        <span className="font-medium tabular-nums text-ink">
                          {formatNumber(t.units)} und. · {formatCOP(t.sales)}{' '}
                          <span className="text-ink-faint">({share(t.sales, storeTotal)})</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
