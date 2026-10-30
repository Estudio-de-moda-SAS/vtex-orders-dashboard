'use client';

import { useEffect, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { SmartSaleTrendSection } from '@/components/SmartSaleTrendSection';
import { formatAverageTicket, formatCOP, formatNumber, formatPercentage, formatUpt } from '@/lib/format';
import { getTodayRange } from '@/lib/date';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { StoreInfo } from '@/types/dashboard';
import { SmartSaleCombinedMonthlyTrendPoint, SmartSaleCombinedSummaryResponse } from '@/types/smartsale-combined';

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

/** Entre VTEX y POS combinadas son 40+ categorías — se muestran solo las de más venta para que la lista no quede interminable. */
const MAX_CATEGORIES_SHOWN = 20;

interface ResumenData {
  summary: SmartSaleCombinedSummaryResponse;
  monthlyTrend: SmartSaleCombinedMonthlyTrendPoint[];
}

/**
 * Ventas totales del canal SmartSale: VTEX (`smartsale.interface.ts`) + POS
 * (`pos-sales.interface.ts`) combinadas, emparejadas por tienda y por
 * vendedor — ver `SmartSaleCombinedService` en el backend. Mismo diseño de
 * cards que "Ventas VTEX"/"Ventas POS", pero con los dos canales sumados.
 * La tendencia mensual (antes en "Ventas VTEX") vive acá, con la venta
 * total combinada de cada mes.
 */
export function ResumenTab() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-smartsale-resumen-range', getTodayRange);

  const [stores, setStores] = useState<StoreInfo[]>([]);
  useEffect(() => {
    ordersService.getStores().then(setStores).catch(() => setStores([]));
  }, []);
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const { state: requestState, refetch: runQuery } = useCachedQuery<ResumenData>(
    // "v2": agrega desglose combinado de categorías (VTEX + POS).
    // "v3": agrega totalSales/totalOrders/totalUnits ya sumados por el backend (antes se sumaban en el cliente).
    // "v4": se agregó `vtexUnits`/`posUnits`/`totalUnits` (UPT) a `byStore`/`byPerson` y `totalVtexUnits`/`totalPosUnits` al total general.
    `smartsale-resumen:v4:${startDate}:${endDate}`,
    async () => {
      const [summary, monthlyTrend] = await Promise.all([
        ordersService.getSmartSaleCombinedSummary(startDate, endDate),
        ordersService.getSmartSaleCombinedMonthlyTrend(),
      ]);
      return { summary, monthlyTrend };
    },
    { autoFetchOnKeyChange: false },
  );

  const isLoading = requestState.status === 'loading';

  return (
    <>
      <p className="max-w-2xl text-sm text-ink-muted">Ventas totales del canal SmartSale — VTEX + POS combinadas.</p>

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
            <p className="text-sm font-medium text-ink">Consultando resumen…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && <ResumenContent data={requestState.data} storeById={storeById} />}
    </>
  );
}

function ResumenContent({ data, storeById }: { data: ResumenData; storeById: Map<string, StoreInfo> }) {
  const { summary, monthlyTrend } = data;
  const totalSales = summary.totalVtexSales + summary.totalPosSales;
  const totalOrders = summary.totalVtexOrders + summary.totalPosOrders;
  const totalUnits = summary.totalVtexUnits + summary.totalPosUnits;

  const orderedByStore = [...summary.byStore].sort(
    (a, b) => STORE_DISPLAY_ORDER.indexOf(a.storeId) - STORE_DISPLAY_ORDER.indexOf(b.storeId),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-surface-border bg-accent/5 p-6 shadow-panel">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas totales SmartSale (VTEX + POS)</p>
        <p className="mt-0.5 font-display text-3xl font-semibold text-ink">{formatCOP(totalSales)}</p>
        <p className="text-xs text-ink-faint">
          {formatNumber(totalOrders)} orden(es)/documento(s) · {formatNumber(totalUnits)} und. · AVT{' '}
          {formatAverageTicket(totalSales, totalOrders)} · UPT {formatUpt(totalUnits, totalOrders)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas VTEX</p>
          <p className="mt-0.5 font-display text-xl font-semibold text-ink">{formatCOP(summary.totalVtexSales)}</p>
          <p className="text-xs text-ink-faint">
            {formatNumber(summary.totalVtexOrders)} orden(es) · {formatNumber(summary.totalVtexUnits)} und. · AVT{' '}
            {formatAverageTicket(summary.totalVtexSales, summary.totalVtexOrders)} · UPT{' '}
            {formatUpt(summary.totalVtexUnits, summary.totalVtexOrders)}
          </p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas POS</p>
          <p className="mt-0.5 font-display text-xl font-semibold text-ink">{formatCOP(summary.totalPosSales)}</p>
          <p className="text-xs text-ink-faint">
            {formatNumber(summary.totalPosOrders)} documento(s) · {formatNumber(summary.totalPosUnits)} und. · AVT{' '}
            {formatAverageTicket(summary.totalPosSales, summary.totalPosOrders)} · UPT{' '}
            {formatUpt(summary.totalPosUnits, summary.totalPosOrders)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Total por vendedor (VTEX + POS, todas las tiendas)</h3>
        <p className="mb-3 text-xs text-ink-faint">Cada vendedor de SmartSale, sumando ambos canales y las 6 tiendas.</p>
        {summary.bySeller.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin ventas de SmartSale en este rango.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.bySeller.map((seller) => {
              const sellerSales = seller.totalSales;
              const sellerOrders = seller.totalOrders;
              const sellerUnits = seller.totalUnits;
              return (
                <li key={seller.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{seller.name}</span>
                  <span className="font-medium tabular-nums text-ink">
                    {formatNumber(sellerOrders)} ord. · {formatNumber(sellerUnits)} und. · {formatCOP(sellerSales)} · AVT{' '}
                    {formatAverageTicket(sellerSales, sellerOrders)} · UPT {formatUpt(sellerUnits, sellerOrders)}{' '}
                    <span className="text-ink-faint">({formatPercentage(totalSales > 0 ? (sellerSales / totalSales) * 100 : 0)})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {orderedByStore.map((store) => {
          const info = storeById.get(store.storeId);
          const storeSales = store.totalSales;
          const storeOrders = store.totalOrders;
          const storeUnits = store.totalUnits;
          const percentage = totalSales > 0 ? (storeSales / totalSales) * 100 : 0;
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
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas totales SmartSale</p>
                <p className="font-display text-xl font-semibold text-ink">{formatCOP(storeSales)}</p>
                <p className="text-xs text-ink-faint">
                  {formatNumber(storeOrders)} ord./doc. · {formatNumber(storeUnits)} und. · AVT{' '}
                  {formatAverageTicket(storeSales, storeOrders)} · UPT {formatUpt(storeUnits, storeOrders)} ·{' '}
                  {formatPercentage(percentage)} del total
                </p>
              </div>

              {store.byPerson.length === 0 ? (
                <p className="text-xs text-ink-faint">Sin ventas de SmartSale en este rango.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {store.byPerson.map((person) => {
                    const personSales = person.totalSales;
                    const personOrders = person.totalOrders;
                    const personUnits = person.totalUnits;
                    return (
                      <li key={person.name} className="flex items-center justify-between text-xs">
                        <span className="text-ink-muted">{person.name}</span>
                        <span className="font-medium tabular-nums text-ink">
                          {formatNumber(personOrders)} ord. · {formatNumber(personUnits)} und. · {formatCOP(personSales)} · AVT{' '}
                          {formatAverageTicket(personSales, personOrders)} · UPT {formatUpt(personUnits, personOrders)}{' '}
                          <span className="text-ink-faint">
                            ({formatPercentage(storeSales > 0 ? (personSales / storeSales) * 100 : 0)})
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {summary.byCategory.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <h3 className="mb-1 font-display text-base font-semibold text-ink">Categorías más vendidas (VTEX + POS)</h3>
          <p className="mb-3 text-xs text-ink-faint">
            En unidades vendidas. Las categorías de POS son más granulares que las de VTEX (ej. &quot;CAMISETA
            M/C&quot; dentro de &quot;Camisetas&quot;) — cuando una categoría de POS no tiene una equivalencia clara
            en VTEX, aparece sola con su nombre tal cual del ERP.
            {summary.byCategory.length > MAX_CATEGORIES_SHOWN && ` Mostrando las ${MAX_CATEGORIES_SHOWN} con más venta.`}
          </p>
          <ul className="flex flex-col gap-2">
            {summary.byCategory.slice(0, MAX_CATEGORIES_SHOWN).map((category) => {
              const units = category.totalUnits;
              const sales = category.totalSales;
              return (
                <li key={category.category} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{category.category}</span>
                  <span className="font-medium tabular-nums text-ink">
                    {formatNumber(units)} und. · {formatCOP(sales)}{' '}
                    <span className="text-ink-faint">({formatPercentage(totalSales > 0 ? (sales / totalSales) * 100 : 0)})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <SmartSaleTrendSection monthly={monthlyTrend} />
    </div>
  );
}
