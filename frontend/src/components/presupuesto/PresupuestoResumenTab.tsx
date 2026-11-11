'use client';

import { useEffect, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { ChartPanel } from '@/components/OrdersByStoreChart';
import { formatCOP, formatPercentage } from '@/lib/format';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { DashboardResponse, StoreInfo } from '@/types/dashboard';
import { ErpMarginSummaryResponse, ErpMarketplaceSummaryResponse, ErpSalesSummaryResponse } from '@/types/erp-sales';

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

interface ResumenData {
  vtex: DashboardResponse;
  erp: ErpSalesSummaryResponse;
  margin: ErpMarginSummaryResponse;
  marketplaces: ErpMarketplaceSummaryResponse;
}

function marginLabel(value: number | null): string {
  return value === null ? '—' : formatPercentage(value);
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}


/**
 * Resumen de `/presupuesto`: una sola tabla por marca con ventas VTEX,
 * ventas ERP (e-commerce), margen y utilidad, dentro del rango elegido.
 *
 * - Ventas VTEX = venta contabilizada, mismo dato que el Dashboard general
 *   y la pestaña "Ventas y presupuesto VTEX" (`/api/orders/dashboard`).
 * - Ventas ERP = facturas e-commerce del ERP (valor neto con IVA, sin
 *   notas crédito ni SmartSale) — mismo dato que "Presupuesto y ventas ERP".
 * - Utilidad = subtotal SIN IVA − costo (costo unitario × cantidad);
 *   margen = utilidad ÷ subtotal (`buildMarginSummary` en el backend).
 *   Margen total del canal: PONDERADO (utilidad total ÷ subtotal total)
 *   como cifra principal y el PROMEDIO SIMPLE de las marcas al lado — el
 *   usuario pidió ver los dos. Incluye fletes (costo $0 → todo utilidad) y
 *   empaque (facturado en $0, con costo → resta), con su efecto aparte.
 * - Cuadro de marketplaces (debajo): factura de marketplace = prefijo de
 *   `docto_referencia` del cuadro de comisiones; comisión = venta sin IVA ×
 *   %, utilidad = venta sin IVA − comisión (SIN costo, así lo calculan) —
 *   `buildMarketplaceSummary`. El cuadro de marcas NO resta comisiones.
 *   Pendiente: marcas dentro de Pilatos.
 */
export function PresupuestoResumenTab() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter(
    'vica-presupuesto-resumen-range',
    undefined,
    { start: 'resStartDate', end: 'resEndDate' },
  );

  const [stores, setStores] = useState<StoreInfo[]>([]);
  useEffect(() => {
    ordersService.getStores().then(setStores).catch(() => setStores([]));
  }, []);

  const { state: requestState, refetch: runQuery } = useCachedQuery<ResumenData>(
    // "v2": se agregó `margin` (margen y utilidad ERP). "v3": se agregó `marketplaces`.
    `presupuesto-resumen:v3:${startDate}:${endDate}`,
    async () => {
      const [vtex, erp, margin, marketplaces] = await Promise.all([
        ordersService.getDashboardData(startDate, endDate),
        ordersService.getErpSalesSummary(startDate, endDate),
        ordersService.getErpMarginSummary(startDate, endDate),
        ordersService.getErpMarketplaceSummary(startDate, endDate),
      ]);
      return { vtex, erp, margin, marketplaces };
    },
    { autoFetchOnKeyChange: false },
  );

  const isLoading = requestState.status === 'loading';

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-ink-muted">
        Ventas VTEX y ventas ERP por marca en el mismo rango, con el margen y la utilidad de lo facturado en el ERP
        (sobre el valor sin IVA).
      </p>

      <div className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onSubmit={() => runQuery()}
          isLoading={isLoading}
        />
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Consultando resumen…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && <ResumenContent data={requestState.data} stores={stores} />}
    </div>
  );
}

function ResumenContent({ data, stores }: { data: ResumenData; stores: StoreInfo[] }) {
  const { vtex, erp, margin } = data;
  const marginByStore = new Map(margin.byStore.map((s) => [s.storeId, s]));
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const vtexByStore = new Map(vtex.stores.map((s) => [s.id, s.data?.revenueTotalValue ?? 0]));
  const erpByStore = new Map(erp.byStore.map((s) => [s.storeId, s.total]));
  const rows = STORE_DISPLAY_ORDER.map((storeId) => ({
    storeId,
    name: storeById.get(storeId)?.name ?? storeId,
    color: storeById.get(storeId)?.color,
    vtexSales: vtexByStore.get(storeId) ?? 0,
    erpSales: erpByStore.get(storeId) ?? 0,
    marginPercent: marginByStore.get(storeId)?.marginPercent ?? null,
    utility: marginByStore.get(storeId)?.utility ?? 0,
    erpSubtotal: marginByStore.get(storeId)?.subtotal ?? 0,
  }));
  /** Las mismas marcas que entran al promedio simple del backend (`buildMarginSummary`): solo las que tuvieron venta. */
  const rowsWithMargin = rows.filter((r) => r.marginPercent !== null);

  const erpNotice =
    erp.lastDataDay === null
      ? 'Todavía no hay facturas ERP sincronizadas — corre el sync diario desde un equipo con VPN.'
      : erp.lastDataDay < erp.filters.endDate
        ? `Facturas ERP sincronizadas hasta el ${dayLabel(erp.lastDataDay)} — los días posteriores del rango aún no tienen datos ERP.`
        : null;

  const cards = [
    { label: 'Ventas totales canal VTEX', value: formatCOP(vtex.summary.totalRevenueValue), hint: 'Venta contabilizada en VTEX', accent: true },
    { label: 'Ventas totales canal ERP', value: formatCOP(erp.channel.total), hint: 'Facturas e-commerce, con IVA' },
    {
      label: 'Margen total canal',
      value: marginLabel(margin.channel.marginPercent),
      hint: `Ponderado (utilidad total ÷ venta sin IVA). Promedio simple de las ${margin.channel.storesInSimpleAverage} marcas: ${marginLabel(margin.channel.simpleAverageMarginPercent)}`,
    },
    {
      label: 'Utilidad total canal',
      value: formatCOP(margin.channel.utility),
      hint: `Venta sin IVA ${formatCOP(margin.channel.subtotal)} − costo ${formatCOP(margin.channel.cost)}`,
    },
  ];

  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint';

  return (
    <>
      {erpNotice && <p className="text-xs text-warning">{erpNotice}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border border-surface-border p-5 shadow-panel ${card.accent ? 'bg-accent/5' : 'bg-surface-panel'}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{card.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-ink-faint">{card.hint}</p>
          </div>
        ))}
      </div>

      <ChartPanel title="Resumen por marca">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Marca</th>
                <th className={`${th} text-right`}>Ventas VTEX</th>
                <th className={`${th} text-right`}>Ventas ERP</th>
                <th className={`${th} text-right`}>Ventas ERP sin IVA</th>
                <th className={`${th} text-right`}>Margen</th>
                <th className={`${th} text-right`}>Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.storeId} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-medium text-ink">
                    <span className="inline-flex items-center gap-2">
                      {row.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />}
                      {row.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.vtexSales)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.erpSales)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.erpSubtotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{marginLabel(row.marginPercent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.utility)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-surface-border font-semibold text-ink">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(vtex.summary.totalRevenueValue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(erp.channel.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(margin.channel.subtotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {marginLabel(margin.channel.marginPercent)}
                  <span className="block text-[11px] font-normal text-ink-faint">
                    simple {marginLabel(margin.channel.simpleAverageMarginPercent)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(margin.channel.utility)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-surface-border pt-3 text-xs text-ink-faint">
          <p>
            <span className="font-semibold text-ink-muted">Margen y utilidad:</span> sobre la venta sin IVA de lo facturado en el
            ERP (sin notas crédito).
          </p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>
              <span className="text-ink-muted">Utilidad por marca</span> = venta sin IVA − costo (costo unitario × cantidad) = venta
              sin IVA × margen.
            </li>
            <li>
              <span className="text-ink-muted">Margen por marca</span> = utilidad ÷ venta sin IVA.
            </li>
            <li>
              <span className="text-ink-muted">Margen total ponderado</span> = utilidad total ÷ venta total sin IVA ={' '}
              <span className="tabular-nums">
                {formatCOP(margin.channel.utility)} ÷ {formatCOP(margin.channel.subtotal)} ={' '}
                {marginLabel(margin.channel.marginPercent)}
              </span>
              . Cada marca pesa según lo que vende; cuadra con la utilidad total.
            </li>
            <li>
              <span className="text-ink-muted">Margen total simple</span> = suma de los márgenes de las marcas ÷ número de marcas ={' '}
              <span className="tabular-nums">
                (
                {rowsWithMargin.map((r, i) => (
                  <span key={r.storeId} className="whitespace-nowrap">
                    {i > 0 && ' + '}
                    {r.color && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: r.color }} />}
                    {r.name} {marginLabel(r.marginPercent)}
                  </span>
                ))}
                ) ÷ {rowsWithMargin.length} ={' '}
                {marginLabel(margin.channel.simpleAverageMarginPercent)}
              </span>
              . Todas las marcas pesan igual, sin importar cuánto venden (solo entran las que vendieron en el rango).
            </li>
          </ul>
          <p>
            <span className="font-semibold text-ink-muted">Fletes:</span> en el ERP no tienen costo, así que toda su venta cuenta
            como utilidad (+{formatCOP(margin.freight.utility)} en este rango). Lo que se paga a la transportadora no
            está en esta fuente.
          </p>
          <p>
            <span className="font-semibold text-ink-muted">Material de empaque:</span> se factura en $0 pero tiene costo, así que
            resta utilidad ({formatCOP(margin.packaging.utility)} en este rango).
          </p>
        </div>
      </ChartPanel>

      <MarketplaceTable data={data.marketplaces} />
    </>
  );
}

/**
 * Cuadro de marketplaces — una fila por marketplace del cuadro de
 * comisiones. Comisión = venta sin IVA × %; utilidad = venta sin IVA −
 * comisión (sin costo); margen = utilidad ÷ venta sin IVA.
 */
function MarketplaceTable({ data }: { data: ErpMarketplaceSummaryResponse }) {
  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint';
  const withMargin = data.rows.filter((r) => r.marginPercent !== null);

  return (
    <ChartPanel title="Resumen por marketplace">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Marketplace</th>
              <th className={`${th} text-right`}>Comisión %</th>
              <th className={`${th} text-right`}>Ventas VTEX</th>
              <th className={`${th} text-right`}>Ventas ERP</th>
              <th className={`${th} text-right`}>Ventas ERP sin IVA</th>
              <th className={`${th} text-right`}>Comisión</th>
              <th className={`${th} text-right`}>Utilidad</th>
              <th className={`${th} text-right`}>Margen</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.prefix} className="border-t border-surface-border">
                <td className="px-3 py-2 font-medium text-ink">
                  {row.name} <span className="ml-1 text-xs font-normal text-ink-faint">{row.prefix}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(row.commissionPercent)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.vtexSales)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.erpSales)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.erpSubtotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.commission)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.utility)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{marginLabel(row.marginPercent)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-surface-border font-semibold text-ink">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.vtexSales)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.erpSales)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.erpSubtotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.commission)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.utility)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {marginLabel(data.total.marginPercent)}
                <span className="block text-[11px] font-normal text-ink-faint">
                  simple {marginLabel(data.total.simpleAverageMarginPercent)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-1 border-t border-surface-border pt-3 text-xs text-ink-faint">
        <p>
          <span className="font-semibold text-ink-muted">Cómo se identifica:</span> una factura del ERP es de un marketplace
          cuando su referencia (docto_referencia) empieza por el ID VTEX del marketplace (ej. GVL1093638 → Agaval). Ventas
          VTEX es la venta contabilizada de ese marketplace en VTEX; puede no coincidir con ERP porque el ERP no siempre
          factura al mismo tiempo (agotados, tiempos de facturación, logística).
        </p>
        <ul className="ml-4 list-disc space-y-0.5">
          <li>
            <span className="text-ink-muted">Comisión</span> = venta ERP sin IVA × % de comisión del marketplace.
          </li>
          <li>
            <span className="text-ink-muted">Utilidad</span> = venta ERP sin IVA − comisión (no se resta el costo de la mercancía).
          </li>
          <li>
            <span className="text-ink-muted">Margen</span> = utilidad ÷ venta ERP sin IVA (equivale a 100% − % de comisión).
          </li>
          <li>
            <span className="text-ink-muted">Margen total ponderado</span> = utilidad total ÷ venta total sin IVA ={' '}
            <span className="tabular-nums">
              {formatCOP(data.total.utility)} ÷ {formatCOP(data.total.erpSubtotal)} = {marginLabel(data.total.marginPercent)}
            </span>
            .
          </li>
          <li>
            <span className="text-ink-muted">Margen total simple</span> = suma de los márgenes ÷ número de marketplaces con venta
            {withMargin.length > 0 ? (
              <span className="tabular-nums">
                {' '}= ({withMargin.map((r) => `${r.name} ${marginLabel(r.marginPercent)}`).join(' + ')}) ÷ {withMargin.length} ={' '}
                {marginLabel(data.total.simpleAverageMarginPercent)}
              </span>
            ) : (
              ' — sin ventas de marketplace en el rango'
            )}
            .
          </li>
        </ul>
        {data.otherPrefixes.length > 0 && (
          <p className="text-warning">
            <span className="font-semibold">Prefijos sin comisión definida (por validar):</span>{' '}
            {data.otherPrefixes
              .map((p) => `${p.prefix} — ${p.invoices} factura(s), ${formatCOP(p.erpSales)} con IVA (${formatCOP(p.erpSubtotal)} sin IVA)`)
              .join(' · ')}
            . No están en el cuadro de comisiones, así que no aparecen arriba.
          </p>
        )}
      </div>
    </ChartPanel>
  );
}
