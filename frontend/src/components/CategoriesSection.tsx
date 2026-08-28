'use client';

import { useMemo, useState } from 'react';

import { StoreDashboardResult } from '@/types/dashboard';
import { CategoryContributionResponse, CategoryRankingByStore } from '@/types/product-analytics';
import { CategoryComparisonTable } from './CategoryComparisonTable';
import { CategoryFilter } from './CategoryFilter';
import { GeneralCategoryBreakdown } from './GeneralCategoryBreakdown';

interface CategoriesSectionProps {
  stores: StoreDashboardResult[];
  contribution: CategoryContributionResponse;
  /** Ranking por tienda sobre TODAS las órdenes — ver `CategoryComparisonTable` para por qué es un dataset distinto de `contribution`. */
  categoryRanking: CategoryRankingByStore;
}

/**
 * Agrupa el filtro de categorías con los dos recuadros que lo usan: el
 * aporte general (todas las tiendas combinadas, solo ventas
 * contabilizadas) y el ranking por tienda (todas las órdenes, igual
 * criterio que `StoreCard`). El filtro opera sobre el mismo rango de
 * fechas ya consultado — no abre un rango nuevo, solo acota qué
 * categorías se muestran en ambos recuadros. `contribution`/
 * `categoryRanking` ya vienen calculados por el backend (ver
 * `page.tsx`); este componente no hace fetch propio.
 *
 * `availableCategories` es la UNIÓN de categorías de ambas fuentes (no
 * solo de `contribution`): una categoría podría existir en el dataset de
 * "todas las órdenes" sin todavía tener ninguna orden contabilizada, y el
 * filtro debe poder seleccionarla igual.
 */
export function CategoriesSection({ stores, contribution, categoryRanking }: CategoriesSectionProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const availableCategories = useMemo(() => {
    const categories = new Set(Object.keys(contribution.general));
    for (const result of Object.values(categoryRanking)) {
      for (const entry of result.categories) categories.add(entry.category);
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'es'));
  }, [contribution.general, categoryRanking]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Filtrar por categoría</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Selecciona una o más categorías para ver su aporte específico por tienda y en general, dentro
          del rango de fechas ya consultado.
        </p>
        <CategoryFilter
          availableCategories={availableCategories}
          selectedCategories={selectedCategories}
          onChange={setSelectedCategories}
        />
      </div>

      <GeneralCategoryBreakdown general={contribution.general} selectedCategories={selectedCategories} />
      <CategoryComparisonTable
        stores={stores}
        categoryRanking={categoryRanking}
        selectedCategories={selectedCategories}
      />
    </div>
  );
}
