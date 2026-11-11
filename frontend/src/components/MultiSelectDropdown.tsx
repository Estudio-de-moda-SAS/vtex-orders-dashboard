'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Texto del botón cuando no hay nada seleccionado (ej. "Todas"). */
  allLabel: string;
  disabled?: boolean;
  /** Motivo mostrado cuando está deshabilitado (ej. "Solo aplica a Pilatos"). */
  disabledHint?: string;
}

/**
 * Selector múltiple compacto (botón + panel desplegable con buscador y
 * checkboxes) — mismo patrón de checkboxes que `CategoryFilter`, pero en
 * un desplegable para poder poner varios filtros en una sola fila. Nada
 * seleccionado = todos. Se cierra al hacer clic fuera o con Escape.
 */
export function MultiSelectDropdown({ label, options, selected, onChange, allLabel, disabled, disabledHint }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  }, [options, search]);

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} seleccionadas`;

  function toggle(value: string, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={disabled ? disabledHint : undefined}
        className="flex min-w-[12rem] items-center justify-between gap-2 rounded-xl border border-surface-border bg-surface px-3.5 py-2 text-left text-sm text-ink outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected.length === 0 ? 'text-ink-muted' : 'font-medium'}`}>{disabled ? 'N/A' : summary}</span>
        <span aria-hidden className="text-ink-faint">
          ▾
        </span>
      </button>
      {disabled && disabledHint && <span className="text-[11px] text-ink-faint">{disabledHint}</span>}

      {open && !disabled && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-xl border border-surface-border bg-surface-panel p-3 shadow-panel">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              autoFocus
              className="w-full rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
            />
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="whitespace-nowrap text-xs text-ink-faint underline transition hover:text-ink-muted"
              >
                Limpiar ({selected.length})
              </button>
            )}
          </div>
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-1.5 py-1 text-sm text-ink-faint">Sin coincidencias.</p>
            ) : (
              visible.map((o) => {
                const checked = selected.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggle(o.value, e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-surface-border accent-accent"
                    />
                    <span className={checked ? 'font-medium text-ink' : 'text-ink-muted'}>{o.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
