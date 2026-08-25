'use client';

import { useMemo, useState } from 'react';

import { StoreDashboardResult } from '@/types/dashboard';
import { CityComparisonTable } from './CityComparisonTable';
import { CityFilter } from './CityFilter';
import { GeneralCityBreakdown } from './GeneralCityBreakdown';

interface CitiesSectionProps {
  stores: StoreDashboardResult[];
}

/**
 * Agrupa el filtro de ciudades con los dos recuadros que lo usan: el
 * aporte general (todas las tiendas combinadas) y el ranking por tienda.
 * El filtro opera sobre el mismo rango de fechas ya consultado — no abre
 * un rango nuevo, solo acota qué ciudades se muestran en ambos recuadros.
 */
export function CitiesSection({ stores }: CitiesSectionProps) {
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    for (const store of stores) {
      if (!store.success || !store.data) continue;
      for (const city of Object.keys(store.data.cityBreakdown)) cities.add(city);
    }
    return Array.from(cities).sort((a, b) => a.localeCompare(b, 'es'));
  }, [stores]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Filtrar por ciudad</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Selecciona una o más ciudades para ver su aporte específico por tienda y en general, dentro del
          rango de fechas ya consultado.
        </p>
        <CityFilter
          availableCities={availableCities}
          selectedCities={selectedCities}
          onChange={setSelectedCities}
        />
      </div>

      <GeneralCityBreakdown stores={stores} selectedCities={selectedCities} />
      <CityComparisonTable stores={stores} selectedCities={selectedCities} />
    </div>
  );
}
