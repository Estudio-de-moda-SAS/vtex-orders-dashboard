'use client';

import { useEffect, useRef, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { ChartPanel } from '@/components/OrdersByStoreChart';
import { getDefaultDateRange } from '@/lib/date';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { creditNotesService } from '@/services/credit-notes.service';
import { CreditNotesSummaryResponse } from '@/types/credit-notes';

const STORES = [
  { id: 'pilatos', name: 'Pilatos' },
  { id: 'kipling', name: 'Kipling' },
  { id: 'diesel', name: 'Diesel' },
  { id: 'superdry', name: 'Superdry' },
  { id: 'girbaud', name: 'Girbaud' },
  { id: 'replay', name: 'Replay' },
];

/** Fuerza UTC al formatear — un `Date` construido desde "YYYY-MM-DD" no debe correr un día por el huso horario del navegador (mismo criterio que `VtexBudgetTab`). */
function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const label = new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: 'UTC' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fullDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

/**
 * Notas crédito (API "Conní" del ERP) — pestaña nueva dentro de
 * `/presupuesto`. A diferencia del resto del dashboard, esta tabla la
 * llena un script LOCAL (`cli/credit-notes-sync.ts`), corrido manualmente
 * desde una máquina conectada a la VPN de la compañía — el backend
 * desplegado nunca puede alcanzar esa API él solo. Esta vista solo LEE lo
 * que ya se sincronizó; si parece desactualizada, hay que correr el script
 * de nuevo, no es un botón de esta página.
 */
export function CreditNotesTab() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter(
    'vica-credit-notes-range',
    getDefaultDateRange,
    { start: 'ncStartDate', end: 'ncEndDate' },
  );
  const [storeId, setStoreId] = useState('');

  const { state: requestState, refetch: runQuery } = useCachedQuery<CreditNotesSummaryResponse>(
    `credit-notes:v2:${startDate}:${endDate}:${storeId}`,
    () => creditNotesService.getSummary(startDate, endDate, storeId || undefined),
    { autoFetchOnKeyChange: false },
  );

  // El rango de fechas necesita el botón "Consultar" a propósito (son dos campos
  // separados — disparar en cada cambio consultaría con "Hasta" todavía desactualizado,
  // ver `useCachedQuery`). La marca es una sola elección atómica, sin ese problema, así
  // que cambiarla SÍ dispara la consulta de inmediato — confirmado que, tal como estaba,
  // elegir una marca no cambiaba nada hasta volver a tocar "Consultar".
  const isFirstStoreRender = useRef(true);
  useEffect(() => {
    if (isFirstStoreRender.current) {
      isFirstStoreRender.current = false;
      return;
    }
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const isLoading = requestState.status === 'loading';

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-ink-muted">
        Notas crédito del ERP, por fecha de la nota. Esta tabla se llena con un script manual corrido desde una
        máquina conectada a la VPN de la compañía — si los datos parecen desactualizados, hay que correr esa
        sincronización de nuevo (ver README), no hay botón de actualizar acá.
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
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Marca
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">Todas las marcas</option>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Consultando notas crédito…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Valor de venta total</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatCOP(requestState.data.totalSalesValue)}</p>
              <p className="mt-1 text-xs text-ink-faint">Ventas contabilizadas del mismo rango/marca</p>
            </div>
            <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Notas crédito</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatNumber(requestState.data.totalCount)}</p>
            </div>
            <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5 shadow-panel">
              <p className="text-xs font-medium uppercase tracking-wide text-danger">Valor neto total (NC)</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatCOP(requestState.data.totalValue)}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {requestState.data.totalSalesValue > 0
                  ? `${formatPercentage((requestState.data.totalValue / requestState.data.totalSalesValue) * 100)} de las ventas`
                  : '— (sin ventas en el rango para comparar)'}
              </p>
            </div>
          </div>

          {requestState.data.totalCount === 0 && (
            <p className="rounded-2xl border border-surface-border bg-surface-panel px-4 py-3 text-sm text-ink-faint">
              Sin notas crédito sincronizadas para este rango — puede ser que de verdad no haya habido, o que todavía
              no se haya corrido la sincronización para estas fechas.
            </p>
          )}

          {requestState.data.totalCount > 0 && (
            <>
              <ChartPanel title="Notas crédito por día">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">Día</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Cantidad</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Valor neto</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">% del total NC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestState.data.byDay.map((d) => (
                        <tr key={d.date} className="border-t border-surface-border">
                          <td className="px-3 py-2 text-ink">
                            {weekdayLabel(d.date)} <span className="text-ink-faint">{fullDateLabel(d.date)}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">{formatNumber(d.count)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(d.totalValue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                            {formatPercentage(requestState.data.totalValue > 0 ? (d.totalValue / requestState.data.totalValue) * 100 : 0)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-surface-border font-semibold text-ink">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(requestState.data.totalCount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCOP(requestState.data.totalValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercentage(100)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </ChartPanel>

              <ChartPanel title="Notas crédito por marca">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">Marca</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Cantidad</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Valor neto</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">% del total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestState.data.byStore.map((s) => (
                        <tr key={`${s.storeId ?? 'sin-tienda'}-${s.marca}`} className="border-t border-surface-border">
                          <td className="px-3 py-2 font-medium text-ink">
                            {s.marca}
                            {!s.storeId && <span className="ml-1.5 text-xs font-normal text-ink-faint">(sin tienda reconocida)</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">{formatNumber(s.count)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink">{formatCOP(s.totalValue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                            {formatPercentage(requestState.data.totalValue > 0 ? (s.totalValue / requestState.data.totalValue) * 100 : 0)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-surface-border font-semibold text-ink">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(requestState.data.totalCount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCOP(requestState.data.totalValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercentage(100)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </ChartPanel>
            </>
          )}
        </>
      )}
    </div>
  );
}
