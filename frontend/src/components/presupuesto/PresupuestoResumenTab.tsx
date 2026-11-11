'use client';

import { useEffect, useRef, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { ChartPanel } from '@/components/OrdersByStoreChart';
import { formatCOP, formatPercentage } from '@/lib/format';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { DashboardResponse, StoreInfo } from '@/types/dashboard';
import { ErpResumenFilteredResponse, ErpSalesSummaryResponse } from '@/types/erp-sales';

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];
const PILATOS_STORE_ID = 'pilatos';
/** Valor que se muestra cuando un dato no aplica con los filtros elegidos. */
const NA = 'N/A';

interface ResumenFilters {
  storeIds: string[];
  marcas: string[];
  tipos: string[];
}

interface ResumenData {
  vtex: DashboardResponse;
  /** Solo para el aviso de "sincronizado hasta". */
  erp: ErpSalesSummaryResponse;
  /** Incluye las opciones COMBINADAS de los filtros (`resumen.options`). */
  resumen: ErpResumenFilteredResponse;
}

/**
 * Venta VTEX de una tienda (no Pilatos) con filtro de marca:
 * - no vende ninguna de las marcas elegidas → 0;
 * - todas sus marcas están elegidas → su venta VTEX completa;
 * - solo algunas (ej. Girbaud también vende Converse) → `null` ("N/A"):
 *   VTEX no separa la venta por marca en esa tienda.
 */
function singleBrandStoreVtex(storeMarcas: string[] | undefined, selected: string[], storeTotal: number): number | null {
  const marcas = storeMarcas ?? [];
  const chosen = marcas.filter((m) => selected.includes(m));
  if (chosen.length === 0) return 0;
  return chosen.length === marcas.length ? storeTotal : null;
}

const FILTERS_STORAGE_KEY = 'vica-presupuesto-resumen-filters';
const EMPTY_FILTERS: ResumenFilters = { storeIds: [], marcas: [], tipos: [] };

/** Filtros recordados en sessionStorage (igual que el rango) — al volver a la pestaña, la key coincide con lo ya consultado. */
function readStoredFilters(): ResumenFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw) as Partial<ResumenFilters>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { storeIds: list(parsed.storeIds), marcas: list(parsed.marcas), tipos: list(parsed.tipos) };
  } catch {
    return EMPTY_FILTERS;
  }
}

function marginLabel(value: number | null): string {
  return value === null ? '—' : formatPercentage(value);
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Resumen de `/presupuesto`: tabla por marca con ventas VTEX, ventas ERP
 * (e-commerce), venta sin IVA, margen y utilidad, más el cuadro de
 * marketplaces — dentro del rango y con FILTROS de selección múltiple:
 *
 * Los filtros se COMBINAN (tienda Y marca Y tipo). Siempre se muestran
 * todas las tiendas (o las elegidas): las que no venden la combinación
 * salen en 0, para no confundir con tiendas "desaparecidas". Las opciones
 * de cada filtro vienen acotadas por los otros dos (`buildResumenFilterOptions`).
 * - Marca: la del ERP, en todas las tiendas. VTEX de Pilatos = marcas VTEX
 *   equivalentes; VTEX de una tienda de una sola marca = su venta completa
 *   solo si todas sus marcas están elegidas, si no "N/A".
 * - Tipo: la venta VTEX queda "N/A" (VTEX no usa los tipos del ERP — el
 *   usuario enviará la equivalencia después).
 *
 * Utilidad = venta sin IVA − costo (costo unitario × cantidad); margen =
 * utilidad ÷ venta sin IVA; total ponderado + promedio simple
 * (`buildMarginSummary`). Marketplaces: comisión = venta sin IVA × %,
 * utilidad = venta sin IVA − comisión (`buildMarketplaceSummary`). El
 * cuadro de marcas NO resta comisiones.
 */
export function PresupuestoResumenTab() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter(
    'vica-presupuesto-resumen-range',
    undefined,
    { start: 'resStartDate', end: 'resEndDate' },
  );
  const [filters, setFilters] = useState<ResumenFilters>(readStoredFilters);
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Storage bloqueado — solo implica que los filtros no se recordarán.
    }
  }, [filters]);

  const [stores, setStores] = useState<StoreInfo[]>([]);
  useEffect(() => {
    ordersService.getStores().then(setStores).catch(() => setStores([]));
  }, []);

  const filterKey = JSON.stringify(filters);
  const { state: requestState, refetch: runQuery } = useCachedQuery<ResumenData>(
    // "v4": filtros de tienda/marca/tipo. "v5": filtros combinados y opciones en `resumen.options`.
    // "v6": siempre todas las tiendas (las que no cumplen el filtro en 0).
    `presupuesto-resumen:v6:${startDate}:${endDate}:${filterKey}`,
    async () => {
      const [vtex, erp, resumen] = await Promise.all([
        ordersService.getDashboardData(startDate, endDate),
        ordersService.getErpSalesSummary(startDate, endDate),
        ordersService.getErpResumen(startDate, endDate, filters),
      ]);
      return { vtex, erp, resumen };
    },
    { autoFetchOnKeyChange: false },
  );

  // Las fechas necesitan "Consultar" (dos campos); los filtros son una
  // elección atómica, así que cambiarlos SÍ consulta de inmediato — mismo
  // criterio que el filtro de marca de "Notas crédito". Se compara contra
  // la última key vista (no un "primer render"): en desarrollo React monta
  // dos veces y un flag de primer render disparaba una consulta al volver
  // a la pestaña aunque ya estuviera en caché.
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const isLoading = requestState.status === 'loading';
  const options = requestState.status === 'success' ? requestState.data.resumen.options : null;
  // Mientras no hay datos, la opción elegida se mantiene visible en el desplegable.
  const withSelected = (available: string[] | undefined, selected: string[]) =>
    Array.from(new Set([...selected, ...(available ?? [])]));

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-ink-muted">
        Ventas VTEX y ventas ERP por marca en el mismo rango, con el margen y la utilidad de lo facturado en el ERP
        (sobre el valor sin IVA). Filtra por tienda, marca y tipo de producto — los filtros se combinan.
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
        <div className="flex flex-wrap items-start gap-4 border-t border-surface-border pt-4">
          <MultiSelectDropdown
            label="Tienda"
            allLabel="Todas las tiendas"
            options={STORE_DISPLAY_ORDER.filter((id) => !options || options.storeIds.includes(id) || filters.storeIds.includes(id)).map(
              (id) => ({ value: id, label: stores.find((s) => s.id === id)?.name ?? id }),
            )}
            selected={filters.storeIds}
            onChange={(storeIds) => setFilters((f) => ({ ...f, storeIds }))}
          />
          <MultiSelectDropdown
            label="Marca"
            allLabel="Todas las marcas"
            options={withSelected(options?.marcas, filters.marcas).map((m) => ({ value: m, label: m }))}
            selected={filters.marcas}
            onChange={(marcas) => setFilters((f) => ({ ...f, marcas }))}
          />
          <MultiSelectDropdown
            label="Tipo de producto"
            allLabel="Todos los tipos"
            options={withSelected(options?.tipos, filters.tipos).map((t) => ({ value: t, label: t }))}
            selected={filters.tipos}
            onChange={(tipos) => setFilters((f) => ({ ...f, tipos }))}
          />
          {(filters.storeIds.length > 0 || filters.marcas.length > 0 || filters.tipos.length > 0) && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-5 text-xs text-ink-faint underline transition hover:text-ink-muted"
            >
              Quitar filtros
            </button>
          )}
        </div>
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
  const { vtex, erp, resumen } = data;
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const vtexByStore = new Map(vtex.stores.map((s) => [s.id, s.data?.revenueTotalValue ?? 0]));
  const resumenByStore = new Map(resumen.byStore.map((s) => [s.storeId, s]));
  const tipoActive = resumen.vtex.tipoFilterActive;
  const marcaActive = resumen.filters.marcas.length > 0;

  /**
   * Venta VTEX de una tienda con los filtros: N/A con tipo; con marca,
   * Pilatos = marcas VTEX equivalentes y una tienda de una sola marca = su
   * venta completa solo si todas sus marcas están elegidas (si no, N/A).
   */
  function vtexFor(storeId: string): number | null {
    if (tipoActive) return null;
    if (!marcaActive) return vtexByStore.get(storeId) ?? 0;
    if (storeId === PILATOS_STORE_ID) return resumen.vtex.pilatosBrands?.sales ?? null;
    return singleBrandStoreVtex(resumen.options.storeMarcas[storeId], resumen.filters.marcas, vtexByStore.get(storeId) ?? 0);
  }

  const rows = STORE_DISPLAY_ORDER.filter((id) => resumenByStore.has(id)).map((storeId) => {
    const r = resumenByStore.get(storeId)!;
    return {
      storeId,
      name: storeById.get(storeId)?.name ?? storeId,
      color: storeById.get(storeId)?.color,
      vtexSales: vtexFor(storeId),
      erpSales: r.erpSales,
      erpSubtotal: r.subtotal,
      marginPercent: r.marginPercent,
      utility: r.utility,
    };
  });
  /** Las mismas marcas que entran al promedio simple del backend (`buildMarginSummary`): solo las que tuvieron venta. */
  const rowsWithMargin = rows.filter((r) => r.marginPercent !== null);
  // Si alguna tienda queda en N/A, el total VTEX tampoco es comparable.
  const vtexTotal = rows.some((r) => r.vtexSales === null) ? null : rows.reduce((a, r) => a + (r.vtexSales ?? 0), 0);
  const channel = resumen.channel;

  const erpNotice =
    erp.lastDataDay === null
      ? 'Todavía no hay facturas ERP sincronizadas — corre el sync diario desde un equipo con VPN.'
      : erp.lastDataDay < erp.filters.endDate
        ? `Facturas ERP sincronizadas hasta el ${dayLabel(erp.lastDataDay)} — los días posteriores del rango aún no tienen datos ERP.`
        : null;

  const cards = [
    {
      label: 'Ventas totales canal VTEX',
      value: vtexTotal === null ? NA : formatCOP(vtexTotal),
      hint: tipoActive
        ? 'VTEX no usa los mismos tipos que el ERP'
        : vtexTotal === null
          ? 'Alguna tienda no se puede separar por marca en VTEX'
          : 'Venta contabilizada en VTEX',
      accent: true,
    },
    { label: 'Ventas totales canal ERP', value: formatCOP(channel.erpSales), hint: 'Facturas e-commerce, con IVA' },
    {
      label: 'Margen total canal',
      value: marginLabel(channel.marginPercent),
      hint: `Ponderado (utilidad total ÷ venta sin IVA). Promedio simple de las ${channel.storesInSimpleAverage} marcas: ${marginLabel(channel.simpleAverageMarginPercent)}`,
    },
    {
      label: 'Utilidad total canal',
      value: formatCOP(channel.utility),
      hint: `Venta sin IVA ${formatCOP(channel.subtotal)} − costo ${formatCOP(channel.cost)}`,
    },
  ];

  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint';
  const unmatched = resumen.vtex.pilatosBrands?.unmatched ?? [];

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
            <p className={`mt-1 font-display text-2xl font-semibold ${card.value === NA ? 'text-ink-faint' : 'text-ink'}`}>{card.value}</p>
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
                  <td className={`px-3 py-2 text-right tabular-nums ${row.vtexSales === null ? 'text-ink-faint' : 'text-ink'}`}>
                    {row.vtexSales === null ? NA : formatCOP(row.vtexSales)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.erpSales)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.erpSubtotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{marginLabel(row.marginPercent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(row.utility)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-surface-border font-semibold text-ink">
                <td className="px-3 py-2">Total</td>
                <td className={`px-3 py-2 text-right tabular-nums ${vtexTotal === null ? 'text-ink-faint' : ''}`}>
                  {vtexTotal === null ? NA : formatCOP(vtexTotal)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(channel.erpSales)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(channel.subtotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {marginLabel(channel.marginPercent)}
                  <span className="block text-[11px] font-normal text-ink-faint">simple {marginLabel(channel.simpleAverageMarginPercent)}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCOP(channel.utility)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-surface-border pt-3 text-xs text-ink-faint">
          {(tipoActive || marcaActive) && (
            <p className="text-warning">
              <span className="font-semibold">Filtros:</span>
              {tipoActive && ' con un tipo de producto elegido, Ventas VTEX es N/A porque VTEX no usa los mismos tipos que el ERP.'}
              {' las tiendas que no venden la combinación elegida salen en $0.'}
              {marcaActive &&
                !tipoActive &&
                ' Con marca: VTEX de Pilatos suma las marcas VTEX equivalentes; en las demás tiendas es su venta completa si vende solo esa(s) marca(s), $0 si no la vende, y N/A si también vende otras marcas no elegidas (VTEX no la separa).'}
              {marcaActive && !tipoActive && unmatched.length > 0 && ` Sin equivalencia en VTEX (no suman en VTEX): ${unmatched.join(', ')}.`}
            </p>
          )}
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
                {formatCOP(channel.utility)} ÷ {formatCOP(channel.subtotal)} = {marginLabel(channel.marginPercent)}
              </span>
              . Cada marca pesa según lo que vende; cuadra con la utilidad total.
            </li>
            <li>
              <span className="text-ink-muted">Margen total simple</span> = suma de los márgenes de las marcas ÷ número de marcas
              {rowsWithMargin.length > 0 ? (
                <span className="tabular-nums">
                  {' '}= (
                  {rowsWithMargin.map((r, i) => (
                    <span key={r.storeId} className="whitespace-nowrap">
                      {i > 0 && ' + '}
                      {r.color && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: r.color }} />}
                      {r.name} {marginLabel(r.marginPercent)}
                    </span>
                  ))}
                  ) ÷ {rowsWithMargin.length} = {marginLabel(channel.simpleAverageMarginPercent)}
                </span>
              ) : (
                ' — sin ventas en el rango'
              )}
              . Todas las marcas pesan igual, sin importar cuánto venden (solo entran las que vendieron en el rango).
            </li>
          </ul>
          <p>
            <span className="font-semibold text-ink-muted">Fletes:</span> en el ERP no tienen costo, así que toda su venta cuenta
            como utilidad (+{formatCOP(resumen.freight.utility)} en este rango). Lo que se paga a la transportadora no está en esta
            fuente.
          </p>
          <p>
            <span className="font-semibold text-ink-muted">Material de empaque:</span> se factura en $0 pero tiene costo, así que
            resta utilidad ({formatCOP(resumen.packaging.utility)} en este rango).
          </p>
        </div>
      </ChartPanel>

      <MarketplaceTable data={resumen.marketplaces} vtexNotApplicable={tipoActive || marcaActive} />
    </>
  );
}

/**
 * Cuadro de marketplaces — una fila por marketplace del cuadro de
 * comisiones, con los mismos filtros. Comisión = venta sin IVA × %;
 * utilidad = venta sin IVA − comisión (sin costo); margen = utilidad ÷
 * venta sin IVA. Con filtro de marca o tipo, VTEX por marketplace es N/A.
 */
function MarketplaceTable({ data, vtexNotApplicable }: { data: ErpResumenFilteredResponse['marketplaces']; vtexNotApplicable: boolean }) {
  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint';
  const withMargin = data.rows.filter((r) => r.marginPercent !== null);
  const vtexCell = (value: number) => (vtexNotApplicable ? NA : formatCOP(value));

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
                <td className={`px-3 py-2 text-right tabular-nums ${vtexNotApplicable ? 'text-ink-faint' : 'text-ink'}`}>{vtexCell(row.vtexSales)}</td>
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
              <td className={`px-3 py-2 text-right tabular-nums ${vtexNotApplicable ? 'text-ink-faint' : ''}`}>{vtexCell(data.total.vtexSales)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.erpSales)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.erpSubtotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.commission)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCOP(data.total.utility)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {marginLabel(data.total.marginPercent)}
                <span className="block text-[11px] font-normal text-ink-faint">simple {marginLabel(data.total.simpleAverageMarginPercent)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-1 border-t border-surface-border pt-3 text-xs text-ink-faint">
        <p>
          <span className="font-semibold text-ink-muted">Cómo se identifica:</span> una factura del ERP es de un marketplace
          cuando su referencia (docto_referencia) empieza por el ID VTEX del marketplace (ej. GVL1093638 → Agaval). Ventas VTEX es
          la venta contabilizada de ese marketplace en VTEX; puede no coincidir con ERP porque el ERP no siempre factura al
          mismo tiempo (agotados, tiempos de facturación, logística).
          {vtexNotApplicable && ' Con filtro de marca o tipo, Ventas VTEX es N/A.'}
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
      </div>
    </ChartPanel>
  );
}
