'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { parsePastedBudgetValues, parseRawBudgetValue } from '@/lib/parseRawBudgetValues';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ordersService } from '@/services/orders.service';
import { BudgetRangeSummaryResponse } from '@/types/budgets';
import { DashboardResponse, StoreInfo } from '@/types/dashboard';

const CODE_STORAGE_KEY = 'vica-budget-code';

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

/**
 * Bloque de métricas reusado tanto por el cuadro protagónico del canal
 * como por cada card de marca. Las 3 métricas se diferencian por el
 * TÍTULO corto (en mayúscula, negrita, un color distinto cada una — venta
 * en azul, presupuesto a la fecha en ámbar, presupuesto del mes en
 * verde), no por el tamaño del valor: los 3 valores en pesos comparten el
 * mismo tamaño, para que queden alineados y se lean como una fila
 * coherente en vez de que uno "compita" visualmente con los otros.
 *
 * `horizontal`: la card protagónica del canal usa las 3 métricas en fila
 * (aprovechando todo el ancho de la card, con tipografía más grande); las
 * cards por marca las apilan verticalmente en el mismo espacio angosto.
 */
function renderComparisonMetrics(
  actual: number,
  rangeBudget: number,
  fullMonthBudget: number | undefined,
  horizontal = false,
) {
  const rangePct = pct(actual, rangeBudget);
  const fullMonthPct = fullMonthBudget !== undefined ? pct(actual, fullMonthBudget) : null;
  const valueSize = horizontal ? 'text-2xl' : 'text-lg';
  const pctSize = horizontal ? 'text-base' : 'text-sm';
  const titleSize = horizontal ? 'text-sm' : 'text-xs';

  const salesBlock = (
    <div>
      <p className={`font-bold uppercase tracking-wide text-accent ${titleSize}`}>Venta VTEX</p>
      <p className="text-[11px] text-ink-faint">Contabilizada en el rango seleccionado</p>
      <p className={`mt-1 font-display font-semibold text-ink ${valueSize}`}>{formatCOP(actual)}</p>
    </div>
  );

  const rangeBlock = (
    <div>
      <p className={`font-bold uppercase tracking-wide text-purple-600 ${titleSize}`}>Ppto. a la fecha</p>
      <p className="text-[11px] text-ink-faint">Presupuesto del mismo rango seleccionado</p>
      <p className={`mt-1 font-display font-semibold text-ink ${valueSize}`}>{formatCOP(rangeBudget)}</p>
      <p className={`font-semibold ${pctSize} ${pctColor(rangePct)}`}>
        {rangePct !== null ? `${formatPercentage(rangePct)} cumplido` : '— (sin presupuesto cargado)'}
      </p>
    </div>
  );

  const fullMonthBlock = (
    <div className={horizontal ? '' : 'border-t border-surface-border pt-2'}>
      <p className={`font-bold uppercase tracking-wide text-teal-600 ${titleSize}`}>Ppto. mes</p>
      <p className="text-[11px] text-ink-faint">Meta total del mes completo</p>
      {fullMonthBudget !== undefined ? (
        <>
          <p className={`mt-1 font-display font-semibold text-ink ${valueSize}`}>{formatCOP(fullMonthBudget)}</p>
          <p className={`font-semibold ${pctSize} ${pctColor(fullMonthPct)}`}>
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
  );

  if (horizontal) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {salesBlock}
        {rangeBlock}
        {fullMonthBlock}
      </div>
    );
  }

  return (
    <>
      <div className="mb-3">{salesBlock}</div>
      <div className="mb-2">{rangeBlock}</div>
      {fullMonthBlock}
    </>
  );
}

/** "24,5" (o vacío) formateado como número es-CO, para la vista previa junto a cada input. */
function formatRawPreview(raw: string): string {
  const parsed = parseRawBudgetValue(raw);
  if (parsed === null) return '—';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(parsed);
}

/**
 * Presupuesto (canal VTEX) — herramienta manual, sin relación con el
 * pipeline de sincronización de VTEX. UN SOLO filtro en toda la página:
 * el rango de fechas de "Ventas vs. presupuesto" (propio de esta página,
 * no comparte estado con el Dashboard `/` — así ese no crece ni se acopla
 * a presupuesto).
 *
 * Ese rango alimenta dos cosas:
 * 1. Las cards de "Ventas vs. presupuesto" — venta real (mismo dato que
 *    ya usa el Dashboard general, `GET /api/orders/dashboard`) contra el
 *    presupuesto del rango exacto y, si el rango cae dentro de un solo
 *    mes calendario, también contra la meta del mes completo. Si cruza
 *    más de un mes, "presupuesto del mes completo" queda oculto con un
 *    aviso, porque un rango así no tiene un solo "mes" al cual referirse.
 * 2. El mes que edita el panel de captura ("Crear presupuesto") — se
 *    deriva de la fecha "Hasta" del rango, sin un segundo selector de
 *    año/mes redundante. El panel solo aparece al hacer clic en el
 *    botón, y solo entonces pide el código compartido (ver
 *    `BudgetCodeGuard` en el backend) — cualquiera puede ver los
 *    presupuestos ya creados, pero solo crear/editar requiere el código.
 */
export default function PresupuestoPage() {
  return (
    <Suspense fallback={null}>
      <PresupuestoContent />
    </Suspense>
  );
}

function PresupuestoContent() {
  const [stores, setStores] = useState<StoreInfo[]>([]);
  useEffect(() => {
    ordersService.getStores().then(setStores).catch(() => setStores([]));
  }, []);

  // --- Ventas vs. presupuesto (rango de fechas PROPIO, independiente del Dashboard) ---
  // Cacheado en sessionStorage por rango (ver `useCachedQuery`): volver a
  // /presupuesto después de visitar otra página (ej. el Dashboard) con el
  // mismo rango ya consultado lo muestra al instante, sin volver a pedirlo.
  const {
    startDate: cmpStartDate,
    setStartDate: setCmpStartDate,
    endDate: cmpEndDate,
    setEndDate: setCmpEndDate,
  } = useDateRangeFilter('vica-presupuesto-comparison-range');

  const { state: cmpState, refetch: runComparison } = useCachedQuery<{ budget: BudgetRangeSummaryResponse; sales: DashboardResponse }>(
    `presupuesto-comparison:${cmpStartDate}:${cmpEndDate}`,
    async () => {
      const [budget, sales] = await Promise.all([
        ordersService.getBudgetRangeSummary(cmpStartDate, cmpEndDate),
        ordersService.getDashboardData(cmpStartDate, cmpEndDate),
      ]);
      return { budget, sales };
    },
    { autoFetchOnKeyChange: false },
  );
  const cmpBudget = cmpState.status === 'success' ? cmpState.data.budget : null;
  const cmpSales = cmpState.status === 'success' ? cmpState.data.sales : null;
  const cmpLoading = cmpState.status === 'loading';
  const cmpError = cmpState.status === 'error' ? cmpState.message : null;

  // --- Mes de trabajo para "Crear presupuesto" (multiplicador + grilla) ---
  // Un solo filtro en toda la página: el rango de fechas de arriba. El mes
  // que se edita/crea es el de la fecha "Hasta" del rango — evita un
  // segundo selector de año/mes redundante con el que ya existe.
  const [year, month] = useMemo(() => {
    const [y, m] = cmpEndDate.split('-').map(Number);
    return [y || new Date().getFullYear(), m || new Date().getMonth() + 1];
  }, [cmpEndDate]);

  // --- Código de acceso (solo al abrir el panel de captura, una vez por sesión de navegador) ---
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
      .getBudgetMultiplier(year, month)
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
      const res = await ordersService.setBudgetMultiplier(year, month, code, value, confirmOverwrite);
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

  // --- Tienda + grilla de días (dentro del panel de captura) ---
  const [storeId, setStoreId] = useState('');
  const [dayDates, setDayDates] = useState<string[]>([]);
  const [rawInputs, setRawInputs] = useState<string[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !storeId || multiplier === null || showMultiplierForm) return;
    let cancelled = false;
    setGridLoading(true);
    setGridError(null);
    ordersService
      .getBudgets(storeId, year, month)
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
  }, [code, storeId, year, month, multiplier, showMultiplierForm]);

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
    if (!code || !storeId) return;
    if (invalidRowIndexes.length > 0) {
      setSaveError('Hay valores inválidos en la grilla (marcados en rojo) — corrígelos antes de guardar.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const values = parsedValues.map((v) => v ?? 0);
      const res = await ordersService.saveBudgetsBulk(storeId, year, month, code, values, confirmOverwrite);
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

  const isMultiplierStepDone = multiplier !== null && !showMultiplierForm;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Presupuesto · Canal VTEX
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Presupuesto (VTEX)</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Presupuesto mensual por marca, VTEX
        </p>
      </header>

      {/* --- Único filtro de la página: rango de fechas. El mes de "Crear presupuesto" se deriva de la fecha "Hasta". --- */}
      <div className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Ventas vs. presupuesto</h2>
            <p className="text-xs text-ink-faint">
              Venta real (mismo dato del Dashboard general, ventas contabilizadas) contra el presupuesto del rango
              elegido — y, si el rango cae dentro de un solo mes, también contra la meta del mes completo.
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
            {/* --- Canal VTEX (todas las marcas): cuadro protagónico, separado de las cards por marca --- */}
            <div className="rounded-2xl border border-accent/30 bg-accent/10 p-6 shadow-panel">
              <h3 className="mb-3 font-display text-base font-semibold text-ink">Canal VTEX — todas las marcas juntas</h3>
              {renderComparisonMetrics(
                cmpSales.summary.totalRevenueValue,
                cmpBudget.channelTotal,
                cmpBudget.fullMonth?.channelTotal,
                true,
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => {
                const actual = cmpSales.stores.find((s) => s.id === store.id)?.data?.revenueTotalValue ?? 0;
                const rangeBudget = cmpBudget.stores.find((s) => s.storeId === store.id)?.total ?? 0;
                const fullMonthBudget = cmpBudget.fullMonth?.stores.find((s) => s.storeId === store.id)?.total;

                return (
                  <div
                    key={store.id}
                    className="rounded-xl border border-surface-border bg-surface p-4"
                    style={{ borderTopColor: store.color, borderTopWidth: 3 }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: store.color }} />
                      <h3 className="font-display text-sm font-semibold text-ink">{store.name}</h3>
                    </div>
                    {renderComparisonMetrics(actual, rangeBudget, fullMonthBudget)}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* --- Modal de código (solo al abrir "Crear presupuesto") --- */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={handleVerifyCode}
            className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel"
          >
            <h2 className="mb-1 font-display text-lg font-semibold text-ink">Código de acceso</h2>
            <p className="mb-4 text-sm text-ink-muted">Necesario para crear o editar el presupuesto de cualquier marca.</p>
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

      {/* --- Panel de captura (solo tras verificar el código) --- */}
      {code && showCreatePanel && (
        <div className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">
              Cargar presupuesto — {MONTH_NAMES[month - 1]} {year}
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
                  ? 'Obligatorio antes de cargar valores — se aplica a las 6 marcas de este mes por igual.'
                  : 'Ojo: cambiarlo afecta a las 6 marcas a la vez para este mes, no solo a la que estás editando.'}
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

          {isMultiplierStepDone && (
            <div className="rounded-2xl border border-surface-border bg-surface-panel p-4 shadow-panel">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                Marca
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
                >
                  <option value="">Selecciona una marca</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {isMultiplierStepDone && storeId && gridLoading && <p className="text-sm text-ink-faint">Consultando presupuesto…</p>}
          {isMultiplierStepDone && storeId && gridError && <p className="text-sm text-danger">{gridError}</p>}

          {isMultiplierStepDone && storeId && !gridLoading && dayDates.length > 0 && (
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
                  {MONTH_NAMES[month - 1]} {year} — {stores.find((s) => s.id === storeId)?.name}
                </h3>
                {/* `overflow-x-auto` + ancho mínimo fijo: en mobile la fila completa (día, fecha, valor, vista previa) se lee mejor deslizando horizontalmente que apretujada o partida en varias líneas — mismo criterio que las tablas comparativas del resto de la app. */}
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
              {MONTH_NAMES[month - 1]} {year} ya tiene un multiplicador (×{formatNumber(multiplierConfirm.currentValue)}).
              Cambiarlo a ×{formatNumber(multiplierConfirm.pendingValue)} afecta a <strong>las 6 marcas a la vez</strong> para
              este mes.
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
                {multiplierSaving ? 'Guardando…' : 'Sí, cambiar para las 6 marcas'}
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
              Ya hay valores guardados para {stores.find((s) => s.id === storeId)?.name} en {MONTH_NAMES[month - 1]} {year}.
              Guardar de nuevo reemplaza TODO el mes.
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
    </main>
  );
}
