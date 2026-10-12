'use client';

import { Suspense } from 'react';

import { ErrorState } from '@/components/ErrorState';
import { ResumenFormulaModal } from '@/components/ResumenFormulaModal';
import { ResumenRankingTable } from '@/components/ResumenRankingTable';
import { ResumenStoreCard } from '@/components/ResumenStoreCard';
import { resumenService } from '@/services/resumen.service';
import { getDefaultDateRange, getPreviousPeriodRange } from '@/lib/date';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import { ResumenResponse } from '@/types/resumen';

/** Rango B por defecto (solo al cargar sin nada guardado/en la URL): el período inmediatamente anterior al rango A por defecto. El usuario puede cambiar cualquiera de los dos libremente después. */
function getDefaultRangeB() {
  return getPreviousPeriodRange(getDefaultDateRange());
}

/** `useSearchParams` (dentro de `useDateRangeFilter`) exige un límite `<Suspense>` en Next.js App Router. */
export default function ResumenPage() {
  return (
    <Suspense fallback={null}>
      <ResumenContent />
    </Suspense>
  );
}

function ResumenContent() {
  // Dos instancias INDEPENDIENTES del mismo hook — cada una con su propio par de
  // query params (`startDateA`/`endDateA` vs. `startDateB`/`endDateB`) y su propia
  // clave de `sessionStorage`, para que elegir el Rango A no toque el Rango B ni
  // viceversa (ver la nota de `paramNames` en `useDateRangeFilter`).
  const rangeA = useDateRangeFilter('vica-resumen-range-a', getDefaultDateRange, { start: 'startDateA', end: 'endDateA' });
  const rangeB = useDateRangeFilter('vica-resumen-range-b', getDefaultRangeB, { start: 'startDateB', end: 'endDateB' });

  const { state: requestState, refetch: runQuery } = useCachedQuery<ResumenResponse>(
    `resumen:v3:${rangeA.startDate}:${rangeA.endDate}:${rangeB.startDate}:${rangeB.endDate}`,
    () => resumenService.getSummary(rangeA.startDate, rangeA.endDate, rangeB.startDate, rangeB.endDate),
    { autoFetchOnKeyChange: false },
  );

  const isLoading = requestState.status === 'loading';
  const isRangeAValid = Boolean(rangeA.startDate) && Boolean(rangeA.endDate) && rangeA.startDate <= rangeA.endDate;
  const isRangeBValid = Boolean(rangeB.startDate) && Boolean(rangeB.endDate) && rangeB.startDate <= rangeB.endDate;
  const canSubmit = isRangeAValid && isRangeBValid && !isLoading;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Resumen
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Semáforo de ventas por tienda</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Elige los dos rangos a comparar — qué tienda mejoró o empeoró del Rango B al Rango A, qué lo explica
          (tráfico, conversión o ticket) y qué lo frenó.
        </p>
      </header>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-4 text-xs text-ink-muted">
        <p className="mb-2 font-medium text-ink">¿Qué significa cada color? ¿Con qué porcentaje se decide?</p>
        <ul className="flex flex-col gap-1.5">
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-positive" />
            <span><span className="font-medium text-ink">Verde</span> — las ventas subieron más de lo que esa tienda considera normal (piso por defecto: +10% o más).</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-warning" />
            <span><span className="font-medium text-ink">Amarillo</span> — variación dentro de lo normal para esa tienda (piso por defecto: entre -5% y +10%).</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />
            <span><span className="font-medium text-ink">Rojo</span> — las ventas cayeron más de lo que esa tienda considera normal (piso por defecto: más de -5% abajo).</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-ink-faint" />
            <span><span className="font-medium text-ink">Gris</span> — sin opinión (muy pocos datos o sin ventas en el período de comparación).</span>
          </li>
        </ul>
        <p className="mt-2">
          Esos +10%/-5% son el piso que se usa cuando una tienda no tiene suficiente historial propio. Si lo tiene, el
          límite se ensancha según qué tan volátiles son normalmente SUS ventas — por ejemplo, una tienda con ventas
          muy variables mes a mes necesita una subida o bajada más grande para contar como verde o rojo real, porque
          para ella eso sigue siendo "normal". Por eso no hay un solo porcentaje igual para todas: el número EXACTO
          que se usó para cada tienda en esta consulta aparece junto al color de su tarjeta, y el detalle completo en
          "¿Cómo se calculó este color?".
        </p>
        <div className="mt-2">
          <ResumenFormulaModal />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) runQuery();
        }}
        className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <DateRangeInputs
            legend="Rango A (actual)"
            startDate={rangeA.startDate}
            endDate={rangeA.endDate}
            onStartDateChange={rangeA.setStartDate}
            onEndDateChange={rangeA.setEndDate}
            idPrefix="rangeA"
          />
          <DateRangeInputs
            legend="Rango B (comparación)"
            startDate={rangeB.startDate}
            endDate={rangeB.endDate}
            onStartDateChange={rangeB.setStartDate}
            onEndDateChange={rangeB.setEndDate}
            idPrefix="rangeB"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          {(!isRangeAValid || !isRangeBValid) && (
            <p className="text-xs text-danger">La fecha inicial de cada rango no puede ser posterior a su fecha final.</p>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Comparando…
              </>
            ) : (
              'Comparar'
            )}
          </button>
        </div>
      </form>

      {isLoading && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Calculando resumen…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {requestState.data.stores.map((store) => (
              <ResumenStoreCard key={store.storeId} result={store} />
            ))}
          </div>

          <ResumenRankingTable stores={requestState.data.stores} />

          <p className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
            ⚠ La conversión según Analytics registra solo una parte de las compras reales (bloqueadores de anuncios,
            rechazo de cookies, pagos fuera del sitio) — es un tope aproximado, no la cifra exacta.
          </p>
          {requestState.data.stores.some((s) => s.provisional) && (
            <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-accent">
              ℹ Alguno de los rangos incluye días incompletos o que todavía pueden cambiar — si es el Rango A y el
              Rango B no tiene esa misma condición, la variación puede salir más baja de lo real.
            </p>
          )}
        </>
      )}
    </main>
  );
}

/** Par de inputs de fecha (sin botón propio — `/resumen` usa UN solo botón "Comparar" para los dos rangos). */
function DateRangeInputs({
  legend,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  idPrefix,
}: {
  legend: string;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  idPrefix: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-surface-border p-3.5">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{legend}</legend>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-start`} className="text-xs text-ink-faint">
            Fecha inicial
          </label>
          <input
            id={`${idPrefix}-start`}
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="rounded-xl border border-surface-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-end`} className="text-xs text-ink-faint">
            Fecha final
          </label>
          <input
            id={`${idPrefix}-end`}
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="rounded-xl border border-surface-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>
    </fieldset>
  );
}
