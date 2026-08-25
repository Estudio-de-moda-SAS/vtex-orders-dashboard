'use client';

import { useMemo, useState } from 'react';

interface CityFilterProps {
  availableCities: string[];
  selectedCities: string[];
  onChange: (cities: string[]) => void;
}

/**
 * Selector múltiple de ciudades: lista de checkboxes en orden alfabético
 * (el orden lo define `availableCities`, ya ordenado por quien lo llama).
 * Se pueden combinar libremente cualquier cantidad de ciudades, sin
 * importar si están o no entre las primeras del ranking — el buscador
 * solo acota qué checkboxes se ven, nunca limita qué se puede seleccionar.
 */
export function CityFilter({ availableCities, selectedCities, onChange }: CityFilterProps) {
  const [search, setSearch] = useState('');

  const visibleCities = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return availableCities;
    return availableCities.filter((city) => city.toLowerCase().includes(term));
  }, [availableCities, search]);

  function toggleCity(city: string, checked: boolean) {
    onChange(checked ? [...selectedCities, city] : selectedCities.filter((c) => c !== city));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ciudad…"
          className="w-full max-w-xs rounded-xl border border-surface-border bg-surface px-3.5 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
        />
        {selectedCities.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="whitespace-nowrap text-xs text-ink-faint underline transition hover:text-ink-muted"
          >
            Limpiar ({selectedCities.length})
          </button>
        )}
      </div>

      <div className="grid max-h-64 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-xl border border-surface-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCities.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin coincidencias.</p>
        ) : (
          visibleCities.map((city) => {
            const checked = selectedCities.includes(city);
            return (
              <label
                key={city}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition hover:bg-surface-panel"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleCity(city, e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-surface-border accent-accent"
                />
                <span className={checked ? 'font-medium text-ink' : 'text-ink-muted'}>{city}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
