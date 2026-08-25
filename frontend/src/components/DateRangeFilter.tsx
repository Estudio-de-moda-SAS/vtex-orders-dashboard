'use client';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSubmit: () => void;
  onForceRefresh: () => void;
  isLoading: boolean;
  hasResults: boolean;
}

/**
 * Selector de rango de fechas. Usa inputs nativos `type="date"` para
 * garantizar selección de día/mes/año consistente entre navegadores y
 * evitar bugs de librerías de calendario de terceros.
 */
export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onSubmit,
  onForceRefresh,
  isLoading,
  hasResults,
}: DateRangeFilterProps) {
  const isRangeValid = Boolean(startDate) && Boolean(endDate) && startDate <= endDate;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isRangeValid && !isLoading) onSubmit();
      }}
      className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel sm:flex-row sm:items-end sm:gap-6"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="startDate" className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Fecha inicial
        </label>
        <input
          id="startDate"
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="rounded-xl border border-surface-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="endDate" className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Fecha final
        </label>
        <input
          id="endDate"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="rounded-xl border border-surface-border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!isRangeValid || isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isLoading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Consultando…
            </>
          ) : (
            'Consultar'
          )}
        </button>

        {hasResults && (
          <button
            type="button"
            onClick={onForceRefresh}
            disabled={!isRangeValid || isLoading}
            title="Ignora el caché y vuelve a consultar todo el rango en VTEX, incluso días ya cerrados"
            className="inline-flex items-center justify-center rounded-xl border border-surface-border px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Forzar actualización
          </button>
        )}
      </div>

      {!isRangeValid && startDate && endDate && (
        <p className="text-xs text-danger sm:absolute sm:-bottom-6">
          La fecha inicial no puede ser posterior a la fecha final.
        </p>
      )}
    </form>
  );
}
