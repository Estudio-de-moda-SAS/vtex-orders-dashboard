'use client';

import { useEffect, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { ChartPanel } from '@/components/OrdersByStoreChart';
import { formatCOP } from '@/lib/format';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { DashboardResponse, StoreInfo } from '@/types/dashboard';
import { ErpSalesSummaryResponse } from '@/types/erp-sales';

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

interface ResumenData {
  vtex: DashboardResponse;
  erp: ErpSalesSummaryResponse;
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Margen y utilidad todavía no se calculan (pendiente: definición del usuario, incluye comisión por marketplace). */
const PENDING = '—';

/**
 * Resumen de `/presupuesto`: una sola tabla por marca con ventas VTEX,
 * ventas ERP (e-commerce), margen y utilidad, dentro del rango elegido.
 *
 * - Ventas VTEX = venta contabilizada, mismo dato que el Dashboard general
 *   y la pestaña "Ventas y presupuesto VTEX" (`/api/orders/dashboard`).
 * - Ventas ERP = facturas e-commerce del ERP (valor neto con IVA, sin
 *   notas crédito ni SmartSale) — mismo dato que "Presupuesto y ventas ERP".
 * - Margen y utilidad: en blanco a propósito, se definen en un paso
 *   siguiente (comisión por marketplace según `docto_referencia`, marcas
 *   dentro de Pilatos).
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
    `presupuesto-resumen:v1:${startDate}:${endDate}`,
    async () => {
      const [vtex, erp] = await Promise.all([
        ordersService.getDashboardData(startDate, endDate),
        ordersService.getErpSalesSummary(startDate, endDate),
      ]);
      return { vtex, erp };
    },
    { autoFetchOnKeyChange: false },
  );

  const isLoading = requestState.status === 'loading';

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-ink-muted">
        Ventas VTEX y ventas ERP por marca en el mismo rango. Margen y utilidad se agregan en el siguiente paso.
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
  const { vtex, erp } = data;
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const vtexByStore = new Map(vtex.stores.map((s) => [s.id, s.data?.revenueTotalValue ?? 0]));
  const erpByStore = new Map(erp.byStore.map((s) => [s.storeId, s.total]));
  const rows = STORE_DISPLAY_ORDER.map((storeId) => ({
    storeId,
    name: storeById.get(storeId)?.name ?? storeId,
    color: storeById.get(storeId)?.color,
    vtexSales: vtexByStore.get(storeId) ?? 0,
    erpSales: erpByStore.get(storeId) ?? 0,
  }));

  const erpNotice =
    erp.lastDataDay === null
      ? 'Todavía no hay facturas ERP sincronizadas — corre el sync diario desde un equipo con VPN.'
      : erp.lastDataDay < erp.filters.endDate
        ? `Facturas ERP sincronizadas hasta el ${dayLabel(erp.lastDataDay)} — los días posteriores del rango aún no tienen datos ERP.`
        : null;

  const cards = [
    { label: 'Ventas totales canal VTEX', value: formatCOP(vtex.summary.totalRevenueValue), hint: 'Venta contabilizada en VTEX', accent: true },
    { label: 'Ventas totales canal ERP', value: formatCOP(erp.channel.total), hint: 'Facturas e-commerce, con IVA' },
    { label: 'Margen total canal', value: PENDING, hint: 'Pendiente de definir' },
    { label: 'Utilidad total canal', value: PENDING, hint: 'Pendiente de definir' },
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
            <p className={`mt-1 font-display text-2xl font-semibold ${card.value === PENDING ? 'text-ink-faint' : 'text-ink'}`}>
              {card.value}
            </p>
            <p className="mt-1 text-xs text-ink-faint">{card.hint}</p>
          </div>
        ))}
      </div>

      <ChartPanel title="Resumen por marca">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Marca</th>
                <th className={`${th} text-right`}>Ventas VTEX</th>
                <th className={`${th} text-right`}>Ventas ERP</th>
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
                  <td className="px-3 py-2 text-right tabular-nums text-ink-faint">{PENDING}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-faint">{PENDING}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-surface-border font-semibold text-ink">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(vtex.summary.totalRevenueValue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(erp.channel.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-faint">{PENDING}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-faint">{PENDING}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ChartPanel>
    </>
  );
}
