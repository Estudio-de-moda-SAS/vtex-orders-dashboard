'use client';

import { useEffect, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { formatAverageTicket, formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { getTodayRange } from '@/lib/date';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { StoreInfo } from '@/types/dashboard';
import { PosSalesSummaryResponse } from '@/types/pos-sales';

/** Única tienda multimarca — ver comentario de `pilatosByBrand` en el backend. */
const PILATOS_STORE_ID = 'pilatos';

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta, para que la grilla no reordene cada vez que cambia el rango de fechas. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

/**
 * Ventas POS del canal SmartSale (API "Conní" del ERP, ya sincronizada en
 * Supabase vía `npm run pos-sales:sync`, nunca en vivo desde el navegador
 * — ver `backend/src/modules/pos-sales`). Mismo layout que
 * `SmartSaleSummarySection` (la pestaña "Ventas VTEX"): total general,
 * total por vendedor combinando tiendas, y una card por tienda con su
 * propio desglose por vendedor. Sin "total del canal"/"% participación
 * sobre un universo mayor" todavía: el usuario confirmó que no hay con
 * qué comparar hasta tener el resto del ERP — el % que sí se muestra es
 * la participación de cada tienda/vendedor DENTRO de este mismo canal POS.
 */
export function VentasPosTab() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-pos-sales-range', getTodayRange);

  const [stores, setStores] = useState<StoreInfo[]>([]);
  useEffect(() => {
    ordersService.getStores().then(setStores).catch(() => setStores([]));
  }, []);
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const { state: requestState, refetch: runQuery } = useCachedQuery<PosSalesSummaryResponse>(
    // "v3": "Ventas totales POS" ahora resta las notas crédito (antes las excluía, sin restarlas).
    `pos-sales:v3:${startDate}:${endDate}`,
    () => ordersService.getPosSalesSummary(startDate, endDate),
    { autoFetchOnKeyChange: false },
  );

  const isLoading = requestState.status === 'loading';

  return (
    <>
      <p className="max-w-2xl text-sm text-ink-muted">Ventas POS — ya resta las notas crédito del total de ventas (su valor también se muestra en su propio recuadro).</p>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onSubmit={() => runQuery()}
        isLoading={isLoading}
      />

      {isLoading && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Consultando ventas POS…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && (
        <PosSalesSummary data={requestState.data} storeById={storeById} />
      )}
    </>
  );
}

function PosSalesSummary({ data, storeById }: { data: PosSalesSummaryResponse; storeById: Map<string, StoreInfo> }) {
  const pilatos = data.byStore.find((s) => s.storeId === PILATOS_STORE_ID);
  const orderedByStore = [...data.byStore].sort(
    (a, b) => STORE_DISPLAY_ORDER.indexOf(a.storeId) - STORE_DISPLAY_ORDER.indexOf(b.storeId),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-surface-border bg-accent/5 p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas totales POS</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(data.totalSales)}</p>
          <p className="text-xs text-ink-faint">{formatNumber(data.totalOrders)} documento(s) · incluye flete, resta notas crédito</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ticket promedio (AVT)</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(data.averageTicket)}</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas fletes</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(data.totalFreight)}</p>
          <p className="text-xs text-ink-faint">Ya incluidas en el total de ventas</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Notas crédito POS</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(data.totalCreditNotes)}</p>
          <p className="text-xs text-ink-faint">Ya restadas del total de ventas de arriba</p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Total por vendedor (todas las tiendas)</h3>
        <p className="mb-3 text-xs text-ink-faint">Cada vendedor de SmartSale POS, sumando las 6 tiendas.</p>
        {data.bySeller.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin ventas POS en este rango.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.bySeller.map((seller) => (
              <li key={seller.nitVendedor} className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{seller.name}</span>
                <span className="font-medium tabular-nums text-ink">
                  {formatNumber(seller.orders)} doc. · {formatCOP(seller.sales)} · AVT{' '}
                  {formatAverageTicket(seller.sales, seller.orders)}{' '}
                  <span className="text-ink-faint">
                    ({formatPercentage(data.totalSales > 0 ? (seller.sales / data.totalSales) * 100 : 0)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {orderedByStore.map((store) => {
          const info = storeById.get(store.storeId);
          const percentage = data.totalSales > 0 ? (store.sales / data.totalSales) * 100 : 0;
          return (
            <div
              key={store.storeId}
              className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel"
              style={info ? { borderTopColor: info.color, borderTopWidth: 3 } : undefined}
            >
              <div className="flex items-center gap-2">
                {info && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: info.color }} />}
                <h3 className="font-display text-base font-semibold text-ink">{info?.name ?? store.storeId}</h3>
              </div>

              <div className="rounded-xl bg-accent/5 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas POS</p>
                <p className="font-display text-xl font-semibold text-ink">{formatCOP(store.sales)}</p>
                <p className="text-xs text-ink-faint">
                  {formatNumber(store.orders)} doc. · AVT {formatAverageTicket(store.sales, store.orders)} ·{' '}
                  {formatPercentage(percentage)} del total POS
                </p>
              </div>

              {store.bySeller.length === 0 ? (
                <p className="text-xs text-ink-faint">Sin ventas POS en este rango.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {store.bySeller.map((seller) => (
                    <li key={seller.nitVendedor} className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted">{seller.name}</span>
                      <span className="font-medium tabular-nums text-ink">
                        {formatNumber(seller.orders)} doc. · {formatCOP(seller.sales)} · AVT{' '}
                        {formatAverageTicket(seller.sales, seller.orders)}{' '}
                        <span className="text-ink-faint">
                          ({formatPercentage(store.sales > 0 ? (seller.sales / store.sales) * 100 : 0)})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {pilatos && data.pilatosByBrand.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <h3 className="mb-1 font-display text-base font-semibold text-ink">Marcas dentro de Pilatos</h3>
          <p className="mb-3 text-xs text-ink-faint">
            Pilatos agrupa varias marcas reales del ERP bajo un mismo total — este desglose es solo para ver cuál
            marca vende más; no cambia el total de Pilatos de la card de arriba. % sobre el total de ventas POS (
            {formatCOP(data.totalSales)}).
          </p>
          <ul className="flex flex-col gap-2">
            {data.pilatosByBrand.map((brand) => (
              <li key={brand.marca} className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{brand.marca}</span>
                <span className="font-medium tabular-nums text-ink">
                  {formatNumber(brand.orders)} doc. · {formatCOP(brand.sales)}{' '}
                  <span className="text-ink-faint">
                    ({formatPercentage(data.totalSales > 0 ? (brand.sales / data.totalSales) * 100 : 0)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
