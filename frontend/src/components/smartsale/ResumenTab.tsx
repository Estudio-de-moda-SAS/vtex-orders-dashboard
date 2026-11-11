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

import { SmartSaleBrandSummaryTable } from './SmartSaleBrandSummaryTable';
import { TipoRankingSections } from './TipoRankingSections';

function marginLabel(value: number | null): string {
  return value === null ? '—' : formatPercentage(value);
}

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

/** Entre POS y ERP combinadas pueden ser muchas categorías — se muestran solo las de más venta para que la lista no quede interminable. */
const MAX_CATEGORIES_SHOWN = 20;

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

interface ResumenData {
  summary: SmartSaleCombinedSummaryResponse;
  monthlyTrend: SmartSaleCombinedMonthlyTrendPoint[];
}

/**
 * Ventas totales del canal SmartSale: POS + ERP (facturas de los
 * vendedores SmartSale) combinadas, emparejadas por tienda y por vendedor
 * — ver `SmartSaleCombinedService` en el backend. Antes era VTEX + POS
 * (VTEX era un acercamiento hasta tener ERP). Venta ERP = total facturado,
 * sin desglose de fletes/empaque aquí (decisión del usuario). Mismo diseño
 * de cards que "Ventas POS"/"Ventas ERP", pero con los dos canales sumados.
 * La tendencia mensual (antes en "Ventas VTEX") vive acá, con la venta
 * total combinada de cada mes.
 */
export function ResumenTab() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-smartsale-resumen-range', getTodayRange, {
    start: 'resStartDate',
    end: 'resEndDate',
  });

  const [stores, setStores] = useState<StoreInfo[]>([]);
  useEffect(() => {
    ordersService.getStores().then(setStores).catch(() => setStores([]));
  }, []);
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const { state: requestState, refetch: runQuery } = useCachedQuery<ResumenData>(
    // "v2": agrega desglose combinado de categorías (VTEX + POS).
    // "v3": agrega totalSales/totalOrders/totalUnits ya sumados por el backend (antes se sumaban en el cliente).
    // "v4": se agregó `vtexUnits`/`posUnits`/`totalUnits` (UPT) a `byStore`/`byPerson` y `totalVtexUnits`/`totalPosUnits` al total general.
    // "v5": VTEX + POS → POS + ERP (campos `vtex*` renombrados a `erp*`, `erpAvailable` en la tendencia).
    // "v6": se agregó `margin`/`posMarginCoverage` (margen POS + ERP por marca) y `byTipo`/`byStoreTipo`.
    `smartsale-resumen:v6:${startDate}:${endDate}`,
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
      <p className="max-w-2xl text-sm text-ink-muted">Ventas totales del canal SmartSale — POS + ERP combinadas.</p>

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
  const { totalSales, totalOrders, totalUnits } = summary;
  const coverageNotice =
    summary.erpCoverageStartDay === null
      ? 'Todavía no hay facturas ERP sincronizadas — estas cifras son solo de POS.'
      : summary.filters.startDate < summary.erpCoverageStartDay
        ? `Las facturas ERP están sincronizadas desde el ${dayLabel(summary.erpCoverageStartDay)} — los días anteriores del rango solo incluyen POS.`
        : null;

  const orderedByStore = [...summary.byStore].sort(
    (a, b) => STORE_DISPLAY_ORDER.indexOf(a.storeId) - STORE_DISPLAY_ORDER.indexOf(b.storeId),
  );

  return (
    <div className="flex flex-col gap-4">
      {coverageNotice && <p className="text-xs text-warning">{coverageNotice}</p>}

      <div className="rounded-2xl border border-surface-border bg-accent/5 p-6 shadow-panel">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas totales SmartSale (POS + ERP)</p>
        <p className="mt-0.5 font-display text-3xl font-semibold text-ink">{formatCOP(totalSales)}</p>
        <p className="text-xs text-ink-faint">
          {formatNumber(totalOrders)} factura(s)/documento(s) · {formatNumber(totalUnits)} und. · AVT{' '}
          {formatAverageTicket(totalSales, totalOrders)} · UPT {formatUpt(totalUnits, totalOrders)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas POS</p>
          <p className="mt-0.5 font-display text-xl font-semibold text-ink">{formatCOP(summary.totalPosSales)}</p>
          <p className="text-xs text-ink-faint">
            {formatNumber(summary.totalPosOrders)} documento(s) · {formatNumber(summary.totalPosUnits)} und. · AVT{' '}
            {formatAverageTicket(summary.totalPosSales, summary.totalPosOrders)} · UPT{' '}
            {formatUpt(summary.totalPosUnits, summary.totalPosOrders)}
          </p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas ERP</p>
          <p className="mt-0.5 font-display text-xl font-semibold text-ink">{formatCOP(summary.totalErpSales)}</p>
          <p className="text-xs text-ink-faint">
            {formatNumber(summary.totalErpOrders)} factura(s) · {formatNumber(summary.totalErpUnits)} und. · AVT{' '}
            {formatAverageTicket(summary.totalErpSales, summary.totalErpOrders)} · UPT{' '}
            {formatUpt(summary.totalErpUnits, summary.totalErpOrders)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-3 font-display text-base font-semibold text-ink">Margen y utilidad (POS + ERP)</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Margen total canal</p>
            <p className="mt-0.5 font-display text-xl font-semibold text-ink">{marginLabel(summary.margin.channel.marginPercent)}</p>
            <p className="text-xs text-ink-faint">
              Ponderado. Promedio simple de las {summary.margin.channel.storesInSimpleAverage} marcas:{' '}
              {marginLabel(summary.margin.channel.simpleAverageMarginPercent)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Utilidad total canal</p>
            <p className="mt-0.5 font-display text-xl font-semibold text-ink">{formatCOP(summary.margin.channel.utility)}</p>
            <p className="text-xs text-ink-faint">Venta sin IVA − costo</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Venta sin IVA (base del margen)</p>
            <p className="mt-0.5 font-display text-xl font-semibold text-ink">{formatCOP(summary.margin.channel.subtotal)}</p>
            <p className="text-xs text-ink-faint">Costo {formatCOP(summary.margin.channel.cost)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-surface-border pt-3 text-xs text-ink-faint">
          <p>
            <span className="font-semibold text-ink-muted">Cómo se calcula:</span> utilidad = venta sin IVA − costo (costo
            unitario × cantidad); margen = utilidad ÷ venta sin IVA, sumando POS + ERP por marca y sin notas crédito. Margen
            total ponderado = {formatCOP(summary.margin.channel.utility)} ÷ {formatCOP(summary.margin.channel.subtotal)} ={' '}
            {marginLabel(summary.margin.channel.marginPercent)}; el simple promedia el margen de cada marca con venta.
          </p>
          <p className="text-warning">
            <span className="font-semibold">Importante:</span> las consultas de POS y ERP no se sincronizan al mismo tiempo —
            en POS la venta llega de inmediato y en el ERP tarda en registrarse. El margen POS sale de la consulta del ERP,
            por eso puede no coincidir con la venta total de POS de los últimos días; se valida en la próxima sincronización.
            {summary.posMarginCoverage.posDocumentsWithMargin < summary.posMarginCoverage.posDocuments &&
              ` En este rango, el margen incluye ${formatNumber(summary.posMarginCoverage.posDocumentsWithMargin)} de ${formatNumber(
                summary.posMarginCoverage.posDocuments,
              )} documentos POS; los demás aún no están en el ERP.`}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Total por vendedor (POS + ERP, todas las tiendas)</h3>
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
                    {formatNumber(sellerOrders)} fact./doc. · {formatNumber(sellerUnits)} und. · {formatCOP(sellerSales)} · AVT{' '}
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
                  {formatNumber(storeOrders)} fact./doc. · {formatNumber(storeUnits)} und. · AVT{' '}
                  {formatAverageTicket(storeSales, storeOrders)} · UPT {formatUpt(storeUnits, storeOrders)} ·{' '}
                  {formatPercentage(percentage)} del total
                </p>
                {(() => {
                  const m = summary.margin.byStore.find((s) => s.storeId === store.storeId);
                  return m ? (
                    <p className="mt-1 text-xs tabular-nums text-ink-faint">
                      Margen <span className="font-semibold text-ink">{marginLabel(m.marginPercent)}</span> · Utilidad{' '}
                      <span className="font-semibold text-ink">{formatCOP(m.utility)}</span> · Venta sin IVA {formatCOP(m.subtotal)}
                    </p>
                  ) : null;
                })()}
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
                          {formatNumber(personOrders)} fact./doc. · {formatNumber(personUnits)} und. · {formatCOP(personSales)} · AVT{' '}
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

      <SmartSaleBrandSummaryTable summary={summary} storeById={storeById} />

      {summary.byCategory.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <h3 className="mb-1 font-display text-base font-semibold text-ink">Categorías más vendidas (POS + ERP)</h3>
          <p className="mb-3 text-xs text-ink-faint">
            En unidades vendidas, solo productos. Categoría tal cual la registra el ERP (sin el código), igual en POS y
            en facturas.
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

      <TipoRankingSections
        general={summary.byTipo.map((t) => ({ tipo: t.tipo, units: t.totalUnits, sales: t.totalSales }))}
        byStore={summary.byStoreTipo.map((s) => ({
          storeId: s.storeId,
          byTipo: s.byTipo.map((t) => ({ tipo: t.tipo, units: t.totalUnits, sales: t.totalSales })),
        }))}
        stores={storeById}
        sourceLabel="POS + ERP"
      />

      <SmartSaleTrendSection monthly={monthlyTrend} />
    </div>
  );
}
