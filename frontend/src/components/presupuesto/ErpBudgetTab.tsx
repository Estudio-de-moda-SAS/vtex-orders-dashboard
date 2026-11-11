'use client';

import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { ordersService } from '@/services/orders.service';
import { StoreInfo } from '@/types/dashboard';
import { ErpEcommerceBreakdownResponse, ErpSalesBreakdown } from '@/types/erp-sales';

import { ChannelBudgetConfig, ChannelBudgetTab, ChannelSales } from './VtexBudgetTab';

/** Se muestran los 10 primeros; el backend devuelve la lista completa (el "Resumen" podrá filtrarla). */
const TOP_N = 10;

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function share(part: number, whole: number): string {
  return formatPercentage(whole > 0 ? (part / whole) * 100 : 0);
}

/** Una fila "nombre · facturas · unidades · venta (%)" — mismo formato que las listas de Ventas ERP de `/smartsale`. */
function RankedList({ items, whole, label }: { items: (ErpSalesBreakdown & { name: string })[]; whole: number; label: 'fact.' | 'und.' }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-ink">
            <span className="mr-2 tabular-nums text-ink-faint">{i + 1}.</span>
            {item.name}
          </span>
          <span className="font-medium tabular-nums text-ink">
            {label === 'fact.' && <>{formatNumber(item.invoices)} fact. · </>}
            {formatNumber(item.units)} und. · {formatCOP(item.total)} <span className="text-ink-faint">({share(item.total, whole)})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Secciones extra de "Presupuesto y ventas ERP" (canal e-commerce, sin
 * SmartSale, SOLO producto — flete y empaque no son marca ni tipo):
 * marcas dentro de Pilatos (todas), tipo más vendido en general y por
 * marca (top 10, ordenado por venta con IVA, con unidades).
 */
function ErpBreakdownSections({ data, stores }: { data: ErpEcommerceBreakdownResponse; stores: StoreInfo[] }) {
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const pilatosTotal = data.pilatosByBrand.reduce((a, b) => a + b.total, 0);
  const tipoTotal = data.byTipo.reduce((a, t) => a + t.total, 0);
  const orderedStores = [...data.byStore].sort((a, b) => STORE_DISPLAY_ORDER.indexOf(a.storeId) - STORE_DISPLAY_ORDER.indexOf(b.storeId));
  const panel = 'rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel';

  return (
    <div className="flex flex-col gap-4">
      <div className={panel}>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Marcas dentro de Pilatos</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Venta de la tienda virtual de Pilatos por marca real del ERP — solo productos (sin flete ni empaque), así que la
          suma ({formatCOP(pilatosTotal)}) es un poco menor que la venta total de Pilatos de arriba. % sobre esa suma.
        </p>
        {data.pilatosByBrand.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin ventas de Pilatos en este rango.</p>
        ) : (
          <RankedList items={data.pilatosByBrand.map((b) => ({ ...b, name: b.marca }))} whole={pilatosTotal} label="fact." />
        )}
      </div>

      <div className={panel}>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Tipo más vendido en general</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Las 6 marcas juntas, ordenado por venta (con IVA), solo productos (flete y empaque no son tipo de producto).
          {data.byTipo.length > TOP_N && ` Mostrando los ${TOP_N} primeros de ${data.byTipo.length} tipos.`} % sobre la venta
          de productos ({formatCOP(tipoTotal)}).
        </p>
        {data.byTipo.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin ventas de productos en este rango.</p>
        ) : (
          <RankedList items={data.byTipo.slice(0, TOP_N).map((t) => ({ ...t, name: t.tipo }))} whole={tipoTotal} label="und." />
        )}
      </div>

      <div className={panel}>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Tipo más vendido por marca</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Los {TOP_N} tipos con más venta de cada marca (algunas marcas venden menos tipos). % sobre la venta de productos de esa
          marca.
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {orderedStores.map((store) => {
            const info = storeById.get(store.storeId);
            const storeTotal = store.byTipo.reduce((a, t) => a + t.total, 0);
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
                          {formatNumber(t.units)} und. · {formatCOP(t.total)}{' '}
                          <span className="text-ink-faint">({share(t.total, storeTotal)})</span>
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
    </div>
  );
}

/**
 * Venta ERP = facturas e-commerce del ERP ("Conní"), ya sincronizadas en
 * Supabase por `npm run daily-sync` (requiere VPN). El backend ya descarta
 * notas crédito (NVF), el CO 810 y los vendedores SmartSale (082P/168A).
 * El presupuesto se mide contra el TOTAL (incluye fletes y empaque).
 */
const ERP_CONFIG: ChannelBudgetConfig = {
  channel: 'erp',
  label: 'ERP',
  intro: 'Presupuesto mensual por marca, ERP (facturas de las tiendas virtuales)',
  comparisonDescription:
    'Venta facturada en el ERP (valor neto con IVA, sin notas crédito ni SmartSale) contra el presupuesto del rango elegido — y, si el rango cae dentro de un solo mes, también contra la meta del mes completo. El cumplimiento se mide contra la venta total, que incluye fletes y material de empaque.',
  dateStorageKey: 'vica-presupuesto-erp-comparison-range',
  // "v2": se agregó `extra` (marcas dentro de Pilatos y tipos).
  cacheKeyPrefix: 'presupuesto-erp-comparison:v2',
  fetchSales: async (startDate, endDate) => {
    const [res, breakdown] = await Promise.all([
      ordersService.getErpSalesSummary(startDate, endDate),
      ordersService.getErpEcommerceBreakdown(startDate, endDate),
    ]);
    const notice =
      res.lastDataDay === null
        ? 'Todavía no hay facturas ERP sincronizadas — corre el sync diario desde un equipo con VPN.'
        : res.lastDataDay < res.filters.endDate
          ? `Facturas ERP sincronizadas hasta el ${dayLabel(res.lastDataDay)} — los días posteriores del rango aún no tienen datos.`
          : null;
    return {
      channelTotal: res.channel.total,
      storeTotals: Object.fromEntries(res.byStore.map((s) => [s.storeId, s.total])),
      breakdown: {
        channel: res.channel,
        stores: Object.fromEntries(res.byStore.map((s) => [s.storeId, s])),
      },
      notice,
      extra: breakdown,
    };
  },
  renderExtra: (sales: ChannelSales, stores: StoreInfo[]) =>
    sales.extra ? <ErpBreakdownSections data={sales.extra as ErpEcommerceBreakdownResponse} stores={stores} /> : null,
};

export function ErpBudgetTab() {
  return <ChannelBudgetTab config={ERP_CONFIG} />;
}
