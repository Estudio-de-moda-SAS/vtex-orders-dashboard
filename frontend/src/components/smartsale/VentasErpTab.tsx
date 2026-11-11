'use client';

import { useEffect, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { getTodayRange } from '@/lib/date';
import { formatAverageTicket, formatCOP, formatNumber, formatPercentage, formatUpt } from '@/lib/format';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { StoreInfo } from '@/types/dashboard';
import { ErpCreditNotesSummary, ErpSalesBreakdown, ErpSmartSaleSellerSummary, ErpSmartSaleSummaryResponse } from '@/types/erp-sales';

import { TipoRankingSections } from './TipoRankingSections';

/** Única tienda multimarca — ver `pilatosByBrand` en el backend. */
const PILATOS_STORE_ID = 'pilatos';

/** Mismo orden que `stores.config.ts` y `VentasPosTab` — NO por venta, para que la grilla no se reordene al cambiar el rango. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

/** Mismo tope que `VentasPosTab` — el ERP trae categorías muy granulares. */
const MAX_CATEGORIES_SHOWN = 20;

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function share(part: number, whole: number): string {
  return formatPercentage(whole > 0 ? (part / whole) * 100 : 0);
}

/** "N fact. · N und. · $ · AVT · UPT" — misma línea que POS, con facturas en vez de documentos. */
function statsLine(b: ErpSalesBreakdown): string {
  return `${formatNumber(b.invoices)} fact. · ${formatNumber(b.units)} und. · ${formatCOP(b.total)} · AVT ${formatAverageTicket(b.total, b.invoices)} · UPT ${formatUpt(b.units, b.invoices)}`;
}

/** Segunda línea: el desglose que pidió el usuario (igual que en `/presupuesto` → ERP). */
function breakdownLine(b: ErpSalesBreakdown): string {
  return `Fletes ${formatCOP(b.freight)} · Empaque ${formatCOP(b.packaging)} · Productos ${formatCOP(b.product)}`;
}

/** Notas crédito: se muestran aparte y NO se restan de la venta (el valor viene negativo del ERP). */
function creditNotesLine(nc: ErpCreditNotesSummary): string {
  return `Notas crédito: ${formatNumber(nc.count)} · ${formatCOP(nc.value)}`;
}

function SellerList({ sellers, whole, size }: { sellers: ErpSmartSaleSellerSummary[]; whole: number; size: 'sm' | 'xs' }) {
  return (
    <ul className="flex flex-col gap-2">
      {sellers.map((seller) => (
        <li key={seller.code} className={`flex flex-col gap-0.5 ${size === 'sm' ? 'text-sm' : 'text-xs'}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <span className={size === 'sm' ? 'font-medium text-ink' : 'text-ink-muted'}>{seller.name}</span>
            <span className="font-medium tabular-nums text-ink">
              {statsLine(seller)} <span className="text-ink-faint">({share(seller.total, whole)})</span>
            </span>
          </div>
          <p className="text-right text-xs tabular-nums text-ink-faint">{breakdownLine(seller)}</p>
          <p className={`text-right text-xs tabular-nums ${seller.creditNotes.count > 0 ? 'text-danger' : 'text-ink-faint'}`}>
            {creditNotesLine(seller.creditNotes)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Ventas ERP del canal SmartSale — facturas del ERP ("Conní") de los
 * vendedores SmartSale (082P Juana Pinilla, 168A Felipe Rengifo), ya
 * sincronizadas por `npm run daily-sync` (VPN). Mismo layout que
 * `VentasPosTab`: totales del canal, total por vendedor combinando
 * tiendas, una card por tienda con su desglose por vendedor, marcas dentro
 * de Pilatos y categorías. A diferencia de POS, las notas crédito (NVF)
 * NO se restan: se muestran aparte (cantidad y valor) en el total, por
 * vendedor y por marca. Cada nivel muestra además fletes, empaque y
 * productos (como `/presupuesto` → ERP).
 */
export function VentasErpTab() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-erp-smartsale-range', getTodayRange, {
    start: 'erpStartDate',
    end: 'erpEndDate',
  });

  const [stores, setStores] = useState<StoreInfo[]>([]);
  useEffect(() => {
    ordersService.getStores().then(setStores).catch(() => setStores([]));
  }, []);
  const storeById = new Map(stores.map((s) => [s.id, s]));

  const { state: requestState, refetch: runQuery } = useCachedQuery<ErpSmartSaleSummaryResponse>(
    // "v2": se agregó `creditNotes` (notas crédito, no restadas) al canal, vendedores y tiendas.
    // "v3": se agregó `byTipo`/`byStoreTipo` (tipo de producto).
    `erp-smartsale:v3:${startDate}:${endDate}`,
    () => ordersService.getErpSmartSaleSummary(startDate, endDate),
    { autoFetchOnKeyChange: false },
  );

  const isLoading = requestState.status === 'loading';

  return (
    <>
      <p className="max-w-2xl text-sm text-ink-muted">
        Ventas ERP — facturas de los vendedores SmartSale (valor neto con IVA). Las notas crédito se muestran aparte y
        no se restan de las ventas.
      </p>

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
            <p className="text-sm font-medium text-ink">Consultando ventas ERP…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && <ErpSmartSaleSummary data={requestState.data} storeById={storeById} />}
    </>
  );
}

function ErpSmartSaleSummary({ data, storeById }: { data: ErpSmartSaleSummaryResponse; storeById: Map<string, StoreInfo> }) {
  const total = data.channel.total;
  const pilatos = data.byStore.find((s) => s.storeId === PILATOS_STORE_ID);
  const orderedByStore = [...data.byStore].sort(
    (a, b) => STORE_DISPLAY_ORDER.indexOf(a.storeId) - STORE_DISPLAY_ORDER.indexOf(b.storeId),
  );
  const notice =
    data.lastDataDay === null
      ? 'Todavía no hay facturas ERP sincronizadas — corre el sync diario desde un equipo con VPN.'
      : data.lastDataDay < data.filters.endDate
        ? `Facturas ERP sincronizadas hasta el ${dayLabel(data.lastDataDay)} — los días posteriores del rango aún no tienen datos.`
        : null;

  return (
    <div className="flex flex-col gap-4">
      {notice && <p className="text-xs text-warning">{notice}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="rounded-2xl border border-surface-border bg-accent/5 p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas totales ERP</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(total)}</p>
          <p className="text-xs text-ink-faint">
            {formatNumber(data.channel.invoices)} factura(s) · {formatNumber(data.channel.units)} und. · incluye fletes y empaque
          </p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ticket promedio (AVT) · UPT</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatAverageTicket(total, data.channel.invoices)}</p>
          <p className="text-xs text-ink-faint">UPT {formatUpt(data.channel.units, data.channel.invoices)} und./factura</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas fletes</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(data.channel.freight)}</p>
          <p className="text-xs text-ink-faint">Ya incluidas en el total de ventas</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Material de empaque</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(data.channel.packaging)}</p>
          <p className="text-xs text-ink-faint">Ya incluido en el total de ventas</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas productos</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(data.channel.product)}</p>
          <p className="text-xs text-ink-faint">Total − fletes − empaque</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Notas crédito ERP</p>
          <p className="mt-0.5 font-display text-2xl font-semibold text-ink">{formatCOP(data.creditNotes.value)}</p>
          <p className="text-xs text-ink-faint">
            {formatNumber(data.creditNotes.count)} nota(s) · {formatNumber(Math.abs(data.creditNotes.units))} und. · no se
            restan de las ventas
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Total por vendedor (todas las tiendas)</h3>
        <p className="mb-3 text-xs text-ink-faint">Cada vendedor de SmartSale en el ERP, sumando las 6 tiendas.</p>
        {data.bySeller.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin ventas ERP de SmartSale en este rango.</p>
        ) : (
          <SellerList sellers={data.bySeller} whole={total} size="sm" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {orderedByStore.map((store) => {
          const info = storeById.get(store.storeId);
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
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas ERP</p>
                <p className="font-display text-xl font-semibold text-ink">{formatCOP(store.total)}</p>
                <p className="text-xs text-ink-faint">
                  {formatNumber(store.invoices)} fact. · {formatNumber(store.units)} und. · AVT{' '}
                  {formatAverageTicket(store.total, store.invoices)} · UPT {formatUpt(store.units, store.invoices)} ·{' '}
                  {share(store.total, total)} del total ERP
                </p>
                <p className="mt-1 text-xs tabular-nums text-ink-faint">{breakdownLine(store)}</p>
                <p className={`text-xs tabular-nums ${store.creditNotes.count > 0 ? 'text-danger' : 'text-ink-faint'}`}>
                  {creditNotesLine(store.creditNotes)}
                </p>
              </div>

              {store.bySeller.length === 0 ? (
                <p className="text-xs text-ink-faint">Sin ventas ERP de SmartSale en este rango.</p>
              ) : (
                <SellerList sellers={store.bySeller} whole={store.total} size="xs" />
              )}
            </div>
          );
        })}
      </div>

      {pilatos && data.pilatosByBrand.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <h3 className="mb-1 font-display text-base font-semibold text-ink">Marcas dentro de Pilatos</h3>
          <p className="mb-3 text-xs text-ink-faint">
            Pilatos agrupa varias marcas reales del ERP bajo un mismo total — este desglose es solo para ver cuál marca
            vende más (solo productos, sin fletes ni empaque); no cambia el total de Pilatos de la card de arriba. % sobre
            el total de ventas ERP ({formatCOP(total)}).
          </p>
          <ul className="flex flex-col gap-2">
            {data.pilatosByBrand.map((brand) => (
              <li key={brand.marca} className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{brand.marca}</span>
                <span className="font-medium tabular-nums text-ink">
                  {formatNumber(brand.invoices)} fact. · {formatNumber(brand.units)} und. · {formatCOP(brand.total)}{' '}
                  <span className="text-ink-faint">({share(brand.total, total)})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TipoRankingSections
        general={data.byTipo.map((t) => ({ tipo: t.tipo, units: t.units, sales: t.total }))}
        byStore={data.byStoreTipo.map((s) => ({ storeId: s.storeId, byTipo: s.byTipo.map((t) => ({ tipo: t.tipo, units: t.units, sales: t.total })) }))}
        stores={storeById}
        sourceLabel="ERP"
      />

      {data.byCategory.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
          <h3 className="mb-1 font-display text-base font-semibold text-ink">Por categoría</h3>
          <p className="mb-3 text-xs text-ink-faint">
            Combinando las 6 tiendas, solo productos, en unidades vendidas (una factura puede tener varias categorías a la
            vez). Categoría tal cual la registra el ERP — más granular que las categorías de VTEX.
            {data.byCategory.length > MAX_CATEGORIES_SHOWN && ` Mostrando las ${MAX_CATEGORIES_SHOWN} con más venta.`}
          </p>
          <ul className="flex flex-col gap-2">
            {data.byCategory.slice(0, MAX_CATEGORIES_SHOWN).map((category) => (
              <li key={category.categoria} className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{category.categoria}</span>
                <span className="font-medium tabular-nums text-ink">
                  {formatNumber(category.units)} und. · {formatCOP(category.total)}{' '}
                  <span className="text-ink-faint">({share(category.total, total)})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
