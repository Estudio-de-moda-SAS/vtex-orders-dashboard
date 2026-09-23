import { StoreGrowth } from '@/types/trends';
import { formatCOP } from '@/lib/format';
import { GrowthBadge } from './GrowthBadge';

interface StoreGrowthTableProps {
  storeGrowth: StoreGrowth[];
}

/**
 * Ranking de las 6 tiendas por % de crecimiento año contra año — semáforo
 * (color + ícono de dirección, no solo color) calculado en el backend
 * (`growth-thresholds.config.ts`). Ordenado de mayor a menor % — las
 * tiendas sin comparación disponible ('no-data') quedan al final, sin un
 * % que no tendría sentido. Ver `OverallGrowthCard` para el mismo cálculo
 * combinando las 6 tiendas en un solo número general.
 */
export function StoreGrowthTable({ storeGrowth }: StoreGrowthTableProps) {
  const sorted = [...storeGrowth].sort((a, b) => {
    if (a.growthPercent === null && b.growthPercent === null) return 0;
    if (a.growthPercent === null) return 1;
    if (b.growthPercent === null) return -1;
    return b.growthPercent - a.growthPercent;
  });

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">Ranking de crecimiento por tienda</h3>
      <p className="mb-4 text-xs text-ink-faint">
        Ordenado por % de crecimiento (no por valor de venta) — muestra qué tienda mejora o empeora, sin importar su
        tamaño.
      </p>

      <div className="flex flex-col gap-2">
        {sorted.map((store) => {
          const partial = store.comparisonCoverage === 'partial';
          return (
            <div
              key={store.storeId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface p-3.5"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">{store.storeName}</p>
                <p className="text-xs text-ink-faint">
                  {formatCOP(store.fullRangeCurrentSales)} en el período
                  {partial && ` (comparación sobre ${store.comparableMonths} de los meses)`}
                </p>
              </div>

              <GrowthBadge status={store.status} growthPercent={store.growthPercent} className="text-sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
