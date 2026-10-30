'use client';

import { useEffect, useMemo, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { parsePastedBudgetValues, parseRawBudgetValue } from '@/lib/parseRawBudgetValues';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { BudgetRangeSummaryResponse } from '@/types/budgets';
import { SmartSaleCombinedSummaryResponse } from '@/types/smartsale-combined';

/** Mismo código de acceso compartido que `/presupuesto` (VTEX) — misma llave de sessionStorage a propósito: verificarlo en una pestaña lo deja verificado en la otra. */
const CODE_STORAGE_KEY = 'vica-budget-code';

/** Único "store_id" de este canal — ver migración 0025 (fila sintética en `stores`, nunca agregada a `getStoresConfig()`). */
const SMARTSALE_STORE_ID = 'smartsale';
const SMARTSALE_CHANNEL = 'smartsale';

/**
 * Vendedores entre los que se reparte el presupuesto del canal en partes
 * iguales (confirmado con el usuario: no hay presupuesto propio por
 * vendedor). A PROPÓSITO es una lista independiente de
 * `getSmartSalePeople()` (VTEX, 3 personas, incluye a Andrea Idárraga
 * que no tiene venta POS) y del mapeo de `pos-sales.util.ts` — crece acá
 * cuando haya un vendedor nuevo en el reparto, sin arrastrar a nadie que
 * el usuario no haya confirmado explícitamente.
 */
const SMARTSALE_BUDGET_SELLERS = ['Juana Pinilla', 'Felipe Rengifo'];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const MULTIPLIER_PRESETS = [
  { label: '×1', value: '1' },
  { label: '×1.000', value: '1000' },
  { label: '×1.000.000', value: '1000000' },
  { label: '×10.000.000', value: '10000000' },
  { label: 'Otro', value: 'custom' },
];

/** Fuerza UTC al formatear — un `Date` construido desde "YYYY-MM-DD" no debe correr un día por el huso horario del navegador. */
function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const label = new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: 'UTC' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fullDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** `null` cuando el presupuesto es 0 (no hay base contra la cual medir "a tiempo") — se muestra "—" en vez de un % engañoso. */
function pct(actual: number, budget: number): number | null {
  if (budget <= 0) return null;
  return (actual / budget) * 100;
}

function pctColor(p: number | null): string {
  if (p === null) return 'text-ink-faint';
  if (p >= 100) return 'text-positive';
  if (p < 70) return 'text-danger';
  return 'text-warning';
}

/** Mismo patrón que `renderComparisonMetrics` de `VtexBudgetTab.tsx` — duplicado a propósito (ver decisión del usuario: componente nuevo y separado, sin tocar el flujo de VTEX en producción). */
function renderComparisonMetrics(actual: number, rangeBudget: number, fullMonthBudget: number | undefined) {
  const rangePct = pct(actual, rangeBudget);
  const fullMonthPct = fullMonthBudget !== undefined ? pct(actual, fullMonthBudget) : null;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-accent">Venta SmartSale (VTEX + POS)</p>
        <p className="text-[11px] text-ink-faint">Contabilizada en el rango seleccionado — VTEX es un acercamiento</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatCOP(actual)}</p>
      </div>
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-purple-600">Ppto. a la fecha</p>
        <p className="text-[11px] text-ink-faint">Presupuesto del mismo rango seleccionado</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatCOP(rangeBudget)}</p>
        <p className={`text-base font-semibold ${pctColor(rangePct)}`}>
          {rangePct !== null ? `${formatPercentage(rangePct)} cumplido` : '— (sin presupuesto cargado)'}
        </p>
      </div>
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-teal-600">Ppto. mes</p>
        <p className="text-[11px] text-ink-faint">Meta total del mes completo</p>
        {fullMonthBudget !== undefined ? (
          <>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatCOP(fullMonthBudget)}</p>
            <p className={`text-base font-semibold ${pctColor(fullMonthPct)}`}>
              {fullMonthPct !== null ? `${formatPercentage(fullMonthPct)} cumplido` : '— (sin presupuesto cargado)'}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-ink-faint">
            El rango seleccionado cruza más de un mes — selecciona un rango dentro de un solo mes para ver el presupuesto
            del mes.
          </p>
        )}
      </div>
    </div>
  );
}

/** "24,5" (o vacío) formateado como número es-CO, para la vista previa junto a cada input. */
function formatRawPreview(raw: string): string {
  const parsed = parseRawBudgetValue(raw);
  if (parsed === null) return '—';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(parsed);
}

/**
 * Presupuesto del canal SmartSale (único para las 6 tiendas combinadas,
 * no por marca) — mismo mecanismo que `/presupuesto` (VTEX): valor crudo
 * diario × multiplicador del mes, guardado en `budgets_daily`/
 * `budget_multipliers` pero con `channel: 'smartsale'` y un `store_id`
 * sintético (`'smartsale'`, ver migración 0025) en vez de una de las 6
 * marcas reales. La venta real para comparar es VTEX + POS
 * (`SmartSaleCombinedService`) — VTEX es un acercamiento hasta que haya
 * ERP. Arriba del presupuesto del canal se muestra un reparto en partes
 * iguales entre los vendedores de `SMARTSALE_BUDGET_SELLERS`.
 */
export function SmartSaleBudgetTab() {
  // --- Ventas vs. presupuesto (rango de fechas PROPIO de esta pestaña) ---
  const {
    startDate: cmpStartDate,
    setStartDate: setCmpStartDate,
    endDate: cmpEndDate,
    setEndDate: setCmpEndDate,
  } = useDateRangeFilter('vica-smartsale-budget-range');

  const { state: cmpState, refetch: runComparison } = useCachedQuery<{
    budget: BudgetRangeSummaryResponse;
    sales: SmartSaleCombinedSummaryResponse;
  }>(
    `smartsale-budget-comparison:${cmpStartDate}:${cmpEndDate}`,
    async () => {
      const [budget, sales] = await Promise.all([
        ordersService.getBudgetRangeSummary(cmpStartDate, cmpEndDate, SMARTSALE_CHANNEL),
        ordersService.getSmartSaleCombinedSummary(cmpStartDate, cmpEndDate),
      ]);
      return { budget, sales };
    },
    { autoFetchOnKeyChange: false },
  );
  const cmpBudget = cmpState.status === 'success' ? cmpState.data.budget : null;
  const cmpSales = cmpState.status === 'success' ? cmpState.data.sales : null;
  const cmpLoading = cmpState.status === 'loading';
  const cmpError = cmpState.status === 'error' ? cmpState.message : null;

  const totalSmartSaleSales = cmpSales ? cmpSales.totalVtexSales + cmpSales.totalPosSales : 0;
  const channelBudget = cmpBudget?.channelTotal ?? 0;

  // --- Mes de trabajo para "Crear presupuesto" (multiplicador + grilla) — se deriva de la fecha "Hasta" del rango. ---
  const [year, month] = useMemo(() => {
    const [y, m] = cmpEndDate.split('-').map(Number);
    return [y || new Date().getFullYear(), m || new Date().getMonth() + 1];
  }, [cmpEndDate]);

  // --- Código de acceso (mismo que VTEX) ---
  const [code, setCode] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(CODE_STORAGE_KEY);
      if (stored) setCode(stored);
    } catch {
      // Modo privado / storage bloqueado — simplemente vuelve a pedir el código.
    }
  }, []);

  function handleClickCrearPresupuesto() {
    if (code) {
      setShowCreatePanel(true);
    } else {
      setShowCodeModal(true);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setCodeError(null);
    try {
      await ordersService.verifyBudgetCode(codeInput);
      try {
        sessionStorage.setItem(CODE_STORAGE_KEY, codeInput);
      } catch {
        // Ignorado a propósito — solo implica que volverá a pedir el código en la próxima carga.
      }
      setCode(codeInput);
      setShowCodeModal(false);
      setShowCreatePanel(true);
      setCodeInput('');
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : 'Error inesperado verificando el código.');
    } finally {
      setVerifying(false);
    }
  }

  // --- Multiplicador del mes (dentro del panel de captura) ---
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const [multiplierLoading, setMultiplierLoading] = useState(false);
  const [showMultiplierForm, setShowMultiplierForm] = useState(false);
  const [multiplierPreset, setMultiplierPreset] = useState('1000000');
  const [multiplierCustom, setMultiplierCustom] = useState('');
  const [multiplierSaving, setMultiplierSaving] = useState(false);
  const [multiplierError, setMultiplierError] = useState<string | null>(null);
  const [multiplierConfirm, setMultiplierConfirm] = useState<{ pendingValue: number; currentValue: number } | null>(null);

  useEffect(() => {
    if (!code || !showCreatePanel) {
      setMultiplier(null);
      return;
    }
    let cancelled = false;
    setMultiplierLoading(true);
    ordersService
      .getBudgetMultiplier(year, month, SMARTSALE_CHANNEL)
      .then((res) => {
        if (cancelled) return;
        setMultiplier(res.multiplier);
        setShowMultiplierForm(res.multiplier === null);
      })
      .catch(() => {
        if (!cancelled) setMultiplier(null);
      })
      .finally(() => {
        if (!cancelled) setMultiplierLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, showCreatePanel, year, month]);

  function resolveMultiplierDraft(): number | null {
    if (multiplierPreset === 'custom') {
      const parsed = parseRawBudgetValue(multiplierCustom);
      return parsed !== null && parsed > 0 ? parsed : null;
    }
    return Number(multiplierPreset);
  }

  async function submitMultiplier(confirmOverwrite: boolean) {
    if (!code) return;
    const value = confirmOverwrite && multiplierConfirm ? multiplierConfirm.pendingValue : resolveMultiplierDraft();
    if (value === null) {
      setMultiplierError('Ingresa un multiplicador válido (mayor que 0).');
      return;
    }
    setMultiplierSaving(true);
    setMultiplierError(null);
    try {
      const res = await ordersService.setBudgetMultiplier(year, month, code, value, confirmOverwrite, SMARTSALE_CHANNEL);
      if ('needsConfirmation' in res) {
        setMultiplierConfirm({ pendingValue: value, currentValue: res.currentValue });
      } else {
        setMultiplier(value);
        setShowMultiplierForm(false);
        setMultiplierConfirm(null);
        runComparison();
      }
    } catch (error) {
      setMultiplierError(error instanceof Error ? error.message : 'Error inesperado guardando el multiplicador.');
    } finally {
      setMultiplierSaving(false);
    }
  }

  function openChangeMultiplier() {
    if (multiplier !== null) {
      setMultiplierPreset('custom');
      setMultiplierCustom(String(multiplier).replace('.', ','));
    }
    setMultiplierError(null);
    setShowMultiplierForm(true);
  }

  // --- Grilla de días (dentro del panel de captura) — sin selector de marca, el store_id siempre es 'smartsale'. ---
  const [dayDates, setDayDates] = useState<string[]>([]);
  const [rawInputs, setRawInputs] = useState<string[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  const isMultiplierStepDone = multiplier !== null && !showMultiplierForm;

  useEffect(() => {
    if (!code || multiplier === null || showMultiplierForm) return;
    let cancelled = false;
    setGridLoading(true);
    setGridError(null);
    ordersService
      .getBudgets(SMARTSALE_STORE_ID, year, month, SMARTSALE_CHANNEL)
      .then((res) => {
        if (cancelled) return;
        if (res.needsMultiplier) {
          setDayDates([]);
          setRawInputs([]);
          return;
        }
        setDayDates(res.days.map((d) => d.date));
        setRawInputs(res.days.map((d) => (d.rawValue !== null ? String(d.rawValue).replace('.', ',') : '')));
      })
      .catch((error) => {
        if (!cancelled) setGridError(error instanceof Error ? error.message : 'Error inesperado consultando el presupuesto.');
      })
      .finally(() => {
        if (!cancelled) setGridLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, year, month, multiplier, showMultiplierForm]);

  // --- Pegado masivo ---
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  function applyPaste() {
    const { values, invalidLineIndexes } = parsePastedBudgetValues(pasteText);
    if (values.length !== dayDates.length) {
      setPasteError(`Se pegaron ${values.length} valor(es), se esperaban ${dayDates.length} (días de ${MONTH_NAMES[month - 1]} ${year}).`);
      return;
    }
    if (invalidLineIndexes.length > 0) {
      setPasteError(`Hay línea(s) que no se pudieron interpretar como número: ${invalidLineIndexes.map((i) => i + 1).join(', ')}.`);
      return;
    }
    setPasteError(null);
    setRawInputs(values.map((v) => (v !== null ? String(v).replace('.', ',') : '')));
  }

  // --- Vista previa / total ---
  const parsedValues = useMemo(() => rawInputs.map((s) => parseRawBudgetValue(s)), [rawInputs]);
  const invalidRowIndexes = useMemo(() => parsedValues.flatMap((v, i) => (v === null ? [i] : [])), [parsedValues]);
  const gridTotal = useMemo(() => {
    const m = multiplier;
    if (m === null) return 0;
    return parsedValues.reduce<number>((acc, v) => acc + (v !== null ? v * m : 0), 0);
  }, [parsedValues, multiplier]);

  // --- Guardar ---
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNeedsConfirmation, setSaveNeedsConfirmation] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function submitSave(confirmOverwrite: boolean) {
    if (!code) return;
    if (invalidRowIndexes.length > 0) {
      setSaveError('Hay valores inválidos en la grilla (marcados en rojo) — corrígelos antes de guardar.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const values = parsedValues.map((v) => v ?? 0);
      const res = await ordersService.saveBudgetsBulk(SMARTSALE_STORE_ID, year, month, code, values, confirmOverwrite, SMARTSALE_CHANNEL);
      if ('needsConfirmation' in res) {
        setSaveNeedsConfirmation(true);
      } else {
        setSaveSuccess(true);
        setSaveNeedsConfirmation(false);
        runComparison();
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Error inesperado guardando el presupuesto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-ink-muted">
        Presupuesto mensual del canal SmartSale completo (no por marca) — venta real = VTEX + POS, un acercamiento hasta
        que haya notas/facturas del ERP.
      </p>

      <div className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Ventas vs. presupuesto</h2>
            <p className="text-xs text-ink-faint">
              Venta real combinada (VTEX + POS) contra el presupuesto del rango elegido — y, si el rango cae dentro de un
              solo mes, también contra la meta del mes completo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClickCrearPresupuesto}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
          >
            {showCreatePanel ? 'Editando presupuesto…' : `Crear presupuesto (${MONTH_NAMES[month - 1]} ${year})`}
          </button>
        </div>

        <DateRangeFilter
          startDate={cmpStartDate}
          endDate={cmpEndDate}
          onStartDateChange={setCmpStartDate}
          onEndDateChange={setCmpEndDate}
          onSubmit={() => runComparison()}
          isLoading={cmpLoading}
        />

        {cmpError && <p className="text-sm text-danger">{cmpError}</p>}

        {!cmpLoading && cmpBudget && cmpSales && (
          <>
            <div className="rounded-2xl border border-accent/30 bg-accent/10 p-6 shadow-panel">
              <h3 className="mb-3 font-display text-base font-semibold text-ink">Canal SmartSale — presupuesto</h3>
              {renderComparisonMetrics(totalSmartSaleSales, cmpBudget.channelTotal, cmpBudget.fullMonth?.channelTotal)}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-surface-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas VTEX</p>
                <p className="mt-0.5 font-display text-lg font-semibold text-ink">{formatCOP(cmpSales.totalVtexSales)}</p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Acercamiento — la versión válida será la del ERP, próximamente.
                </p>
              </div>
              <div className="rounded-xl border border-surface-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas POS</p>
                <p className="mt-0.5 font-display text-lg font-semibold text-ink">{formatCOP(cmpSales.totalPosSales)}</p>
              </div>
              <div className="rounded-xl border border-dashed border-surface-border bg-surface/60 p-4 opacity-70">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ventas ERP</p>
                <p className="mt-0.5 font-display text-lg font-semibold text-ink-faint">Próximamente</p>
              </div>
            </div>

            <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
              <h3 className="mb-1 font-display text-base font-semibold text-ink">Presupuesto por vendedor</h3>
              <p className="mb-3 text-xs text-ink-faint">
                El presupuesto del canal dividido en partes iguales entre {SMARTSALE_BUDGET_SELLERS.length} vendedor(es) —
                no es un presupuesto propio por vendedor.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="py-2 pr-3 font-medium">Vendedor</th>
                      <th className="py-2 pr-3 font-medium">Ppto. a la fecha</th>
                      <th className="py-2 pr-3 font-medium">Venta real (VTEX + POS)</th>
                      <th className="py-2 font-medium">% cumplido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SMARTSALE_BUDGET_SELLERS.map((name) => {
                      const sellerBudget = channelBudget / SMARTSALE_BUDGET_SELLERS.length;
                      const sellerSales = cmpSales.bySeller.find((p) => p.name === name)?.totalSales ?? 0;
                      const sellerPct = pct(sellerSales, sellerBudget);
                      return (
                        <tr key={name} className="border-b border-surface-border last:border-0">
                          <td className="py-2 pr-3 font-medium text-ink">{name}</td>
                          <td className="py-2 pr-3 tabular-nums text-ink">{formatCOP(sellerBudget)}</td>
                          <td className="py-2 pr-3 tabular-nums text-ink">{formatCOP(sellerSales)}</td>
                          <td className={`py-2 font-semibold tabular-nums ${pctColor(sellerPct)}`}>
                            {sellerPct !== null ? formatPercentage(sellerPct) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handleVerifyCode}
            className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel"
          >
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">Código de acceso</h2>
            <p className="mb-4 text-sm text-ink-muted">Necesario para crear o editar el presupuesto del canal.</p>
            <input
              type="password"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              autoFocus
              className="w-full rounded-xl border border-surface-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent"
              placeholder="Código"
            />
            {codeError && <p className="mt-2 text-xs text-danger">{codeError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCodeModal(false);
                  setCodeError(null);
                  setCodeInput('');
                }}
                className="flex-1 rounded-xl border border-surface-border px-4 py-2.5 text-sm text-ink-muted transition hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={verifying || !codeInput}
                className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {verifying ? 'Verificando…' : 'Entrar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {code && showCreatePanel && (
        <div className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">
              Cargar presupuesto SmartSale — {MONTH_NAMES[month - 1]} {year}
            </h2>
            <button
              type="button"
              onClick={() => setShowCreatePanel(false)}
              className="rounded-lg border border-surface-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted transition hover:bg-surface-panel"
            >
              Cerrar
            </button>
          </div>

          {multiplierLoading && <p className="text-sm text-ink-faint">Consultando multiplicador…</p>}

          {!multiplierLoading && !showMultiplierForm && multiplier !== null && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface-border bg-surface-panel p-4 shadow-panel">
              <p className="text-sm text-ink">
                Multiplicador de {MONTH_NAMES[month - 1]} {year}: <span className="font-semibold">×{formatNumber(multiplier)}</span>
              </p>
              <button
                type="button"
                onClick={openChangeMultiplier}
                className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface"
              >
                Cambiar multiplicador de este mes
              </button>
            </div>
          )}

          {!multiplierLoading && showMultiplierForm && (
            <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
              <h3 className="mb-1 font-display text-base font-semibold text-ink">
                {multiplier === null ? 'Define el multiplicador de este mes' : 'Cambiar multiplicador de este mes'}
              </h3>
              <p className="mb-3 text-xs text-ink-faint">
                {multiplier === null
                  ? 'Obligatorio antes de cargar valores — es propio del canal SmartSale, independiente del multiplicador de VTEX.'
                  : 'Ojo: cambiarlo afecta todo el presupuesto ya cargado de SmartSale para este mes.'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={multiplierPreset}
                  onChange={(e) => setMultiplierPreset(e.target.value)}
                  className="rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
                >
                  {MULTIPLIER_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {multiplierPreset === 'custom' && (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={multiplierCustom}
                    onChange={(e) => setMultiplierCustom(e.target.value)}
                    placeholder="ej. 500000"
                    className="w-40 rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
                  />
                )}
                <button
                  type="button"
                  onClick={() => submitMultiplier(false)}
                  disabled={multiplierSaving}
                  className="rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {multiplierSaving ? 'Guardando…' : 'Guardar multiplicador'}
                </button>
                {multiplier !== null && (
                  <button
                    type="button"
                    onClick={() => setShowMultiplierForm(false)}
                    className="rounded-xl border border-surface-border px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              {multiplierError && <p className="mt-2 text-xs text-danger">{multiplierError}</p>}
            </div>
          )}

          {isMultiplierStepDone && gridLoading && <p className="text-sm text-ink-faint">Consultando presupuesto…</p>}
          {isMultiplierStepDone && gridError && <p className="text-sm text-danger">{gridError}</p>}

          {isMultiplierStepDone && !gridLoading && dayDates.length > 0 && (
            <>
              <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
                <h3 className="mb-1 font-display text-base font-semibold text-ink">Pegado masivo</h3>
                <p className="mb-3 text-xs text-ink-faint">
                  Pega un valor por línea (uno por cada día del mes, en orden) — separadores de miles/decimales en formato
                  es-CO (ej. "24,5").
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder={`24,5\n26,1\n25,0\n...`}
                  className="w-full rounded-xl border border-surface-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={applyPaste}
                    disabled={!pasteText.trim()}
                    className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Aplicar a la grilla
                  </button>
                  {pasteError && <p className="text-xs text-danger">{pasteError}</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
                <h3 className="mb-3 font-display text-base font-semibold text-ink">
                  {MONTH_NAMES[month - 1]} {year} — Canal SmartSale
                </h3>
                <div className="overflow-x-auto">
                  <div className="flex min-w-[42rem] flex-col gap-1.5">
                    {dayDates.map((date, i) => {
                      const isInvalid = invalidRowIndexes.includes(i);
                      return (
                        <div key={date} className="grid grid-cols-[2.5rem_7rem_10rem_10rem_10rem] items-center gap-2 text-sm">
                          <span className="tabular-nums text-ink-faint">{i + 1}</span>
                          <span className="text-xs text-ink-faint">{weekdayLabel(date)}</span>
                          <span className="text-ink-muted">{fullDateLabel(date)}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={rawInputs[i] ?? ''}
                            onChange={(e) => {
                              const next = [...rawInputs];
                              next[i] = e.target.value;
                              setRawInputs(next);
                            }}
                            className={`rounded-lg border px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent ${
                              isInvalid ? 'border-danger' : 'border-surface-border bg-surface'
                            }`}
                          />
                          <span className="tabular-nums text-xs text-ink-faint">
                            {rawInputs[i]
                              ? `${formatRawPreview(rawInputs[i])} × ${formatNumber(multiplier ?? 0)} = ${
                                  parseRawBudgetValue(rawInputs[i]) !== null && multiplier !== null
                                    ? formatCOP(parseRawBudgetValue(rawInputs[i])! * multiplier)
                                    : '—'
                                }`
                              : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-4">
                  <p className="text-sm font-medium text-ink">
                    Total del mes: <span className="font-display text-lg font-semibold text-ink">{formatCOP(gridTotal)}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => submitSave(false)}
                    disabled={saving}
                    className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
                {invalidRowIndexes.length > 0 && (
                  <p className="mt-2 text-xs text-danger">
                    Hay {invalidRowIndexes.length} día(s) con un valor que no se pudo interpretar (marcados en rojo).
                  </p>
                )}
                {saveError && <p className="mt-2 text-xs text-danger">{saveError}</p>}
                {saveSuccess && <p className="mt-2 text-xs font-medium text-positive">✓ Presupuesto guardado</p>}
              </div>
            </>
          )}
        </div>
      )}

      {multiplierConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
            <h3 className="mb-2 font-display text-base font-semibold text-ink">¿Cambiar el multiplicador?</h3>
            <p className="mb-4 text-sm text-ink-muted">
              {MONTH_NAMES[month - 1]} {year} ya tiene un multiplicador de SmartSale (×
              {formatNumber(multiplierConfirm.currentValue)}). Cambiarlo a ×{formatNumber(multiplierConfirm.pendingValue)}{' '}
              afecta todo el presupuesto ya cargado del canal para este mes.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMultiplierConfirm(null)}
                className="rounded-xl border border-surface-border px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => submitMultiplier(true)}
                disabled={multiplierSaving}
                className="rounded-xl bg-danger px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {multiplierSaving ? 'Guardando…' : 'Sí, cambiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveNeedsConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
            <h3 className="mb-2 font-display text-base font-semibold text-ink">¿Sobrescribir presupuesto existente?</h3>
            <p className="mb-4 text-sm text-ink-muted">
              Ya hay valores guardados del canal SmartSale en {MONTH_NAMES[month - 1]} {year}. Guardar de nuevo reemplaza
              TODO el mes.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveNeedsConfirmation(false)}
                className="rounded-xl border border-surface-border px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => submitSave(true)}
                disabled={saving}
                className="rounded-xl bg-danger px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Sí, sobrescribir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
