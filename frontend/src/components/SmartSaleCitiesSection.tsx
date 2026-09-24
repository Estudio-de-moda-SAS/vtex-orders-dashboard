'use client';

import { useMemo, useState } from 'react';

import { CityBreakdown, StoreDashboardResult } from '@/types/dashboard';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { CityFilter } from './CityFilter';
import { ChartPanel } from './OrdersByStoreChart';

interface SmartSaleCitiesSectionProps {
  stores: StoreDashboardResult[];
  citiesByStore: Record<string, Record<string, CityBreakdown>>;
}

/** Filtro por ciudad + aporte general + desglose por tienda, todo sobre ventas del canal SmartSale. */
export function SmartSaleCitiesSection({ stores, citiesByStore }: SmartSaleCitiesSectionProps) {
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const availableCities = useMemo(() => {
    const names = new Set<string>();
    for (const byCity of Object.values(citiesByStore)) {
      for (const city of Object.keys(byCity)) names.add(city);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [citiesByStore]);

  const isFiltered = selectedCities.length > 0;

  const general = useMemo(() => {
    const totals = new Map<string, { totalValue: number; count: number }>();
    let grandTotal = 0;
    for (const byCity of Object.values(citiesByStore)) {
      for (const [city, breakdown] of Object.entries(byCity)) {
        const current = totals.get(city) ?? { totalValue: 0, count: 0 };
        current.totalValue += breakdown.totalValue;
        current.count += breakdown.count;
        totals.set(city, current);
        grandTotal += breakdown.totalValue;
      }
    }
    const ranked = Array.from(totals.entries())
      .map(([city, t]) => ({ city, ...t, percentage: grandTotal > 0 ? (t.totalValue / grandTotal) * 100 : 0 }))
      .sort((a, b) => b.totalValue - a.totalValue);
    return { ranked, grandTotal };
  }, [citiesByStore]);

  const shownGeneral = isFiltered ? general.ranked.filter((r) => selectedCities.includes(r.city)) : general.ranked.slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Filtrar por ciudad (SmartSale)</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Selecciona una o más ciudades de envío para ver su aporte dentro de las ventas de SmartSale.
        </p>
        <CityFilter availableCities={availableCities} selectedCities={selectedCities} onChange={setSelectedCities} />
      </div>

      <ChartPanel title="Aporte general por ciudad (SmartSale)">
        <p className="-mt-1 mb-3 text-xs text-ink-faint">Total: {formatCOP(general.grandTotal)}</p>
        {shownGeneral.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin datos de ciudad en ventas de SmartSale para este rango.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shownGeneral.map((entry, index) => (
              <li key={entry.city} className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">
                  <span className="text-ink-faint">#{index + 1}</span> {entry.city}
                </span>
                <span className="font-medium tabular-nums text-ink">
                  {formatCOP(entry.totalValue)} <span className="text-ink-faint">({formatPercentage(entry.percentage)})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartPanel>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-4 font-display text-base font-semibold text-ink">Ciudades por tienda (SmartSale)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => {
            const byCity = citiesByStore[store.id] ?? {};
            const entries = Object.entries(byCity)
              .filter(([city]) => !isFiltered || selectedCities.includes(city))
              .sort((a, b) => b[1].totalValue - a[1].totalValue);
            if (entries.length === 0) return null;
            return (
              <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                  {store.name}
                </p>
                <ul className="flex flex-col gap-1">
                  {entries.map(([city, breakdown]) => (
                    <li key={city} className="flex items-baseline justify-between gap-2 text-xs text-ink-muted">
                      <span className="truncate">{city}</span>
                      <span className="shrink-0 tabular-nums text-ink">
                        {formatNumber(breakdown.count)} ord. · {formatCOP(breakdown.totalValue)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {stores.every((s) => Object.keys(citiesByStore[s.id] ?? {}).length === 0) && (
          <p className="text-sm text-ink-faint">Sin ventas de SmartSale en este rango.</p>
        )}
      </div>
    </div>
  );
}
