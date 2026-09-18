'use client';

import { useMemo, useState } from 'react';

interface CategoryFilterProps {
  availableCategories: string[];
  selectedCategories: string[];
  onChange: (categories: string[]) => void;
}

/**
 * Selector múltiple de categorías: lista de checkboxes en orden alfabético
 * (el orden lo define `availableCategories`, ya ordenado por quien lo
 * llama). Se pueden combinar libremente cualquier cantidad de categorías,
 * sin importar si están o no entre las primeras del ranking — el buscador
 * solo acota qué checkboxes se ven, nunca limita qué se puede seleccionar.
 */
export function CategoryFilter({ availableCategories, selectedCategories, onChange }: CategoryFilterProps) {
  const [search, setSearch] = useState('');

  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return availableCategories;
    return availableCategories.filter((category) => category.toLowerCase().includes(term));
  }, [availableCategories, search]);

  function toggleCategory(category: string, checked: boolean) {
    onChange(checked ? [...selectedCategories, category] : selectedCategories.filter((c) => c !== category));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar categoría…"
          className="w-full max-w-xs rounded-xl border border-surface-border bg-surface px-3.5 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
        />
        {selectedCategories.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="whitespace-nowrap text-xs text-ink-faint underline transition hover:text-ink-muted"
          >
            Limpiar ({selectedCategories.length})
          </button>
        )}
      </div>

      <div className="grid max-h-64 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-xl border border-surface-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCategories.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin coincidencias.</p>
        ) : (
          visibleCategories.map((category) => {
            const checked = selectedCategories.includes(category);
            return (
              <label
                key={category}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition hover:bg-surface-panel"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleCategory(category, e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-surface-border accent-accent"
                />
                <span className={checked ? 'font-medium text-ink' : 'text-ink-muted'}>{category}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
