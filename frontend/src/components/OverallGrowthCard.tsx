import { StoreGrowth } from '@/types/trends';
import { formatCOP } from '@/lib/format';
import { GROWTH_STATUS_META, GrowthBadge } from './GrowthBadge';

interface OverallGrowthCardProps {
  overall: StoreGrowth;
}

/**
 * Crecimiento año contra año de las 6 tiendas COMBINADAS — mismo cálculo
 * y semáforo que cada fila de `StoreGrowthTable`, pero como un solo
 * número general del negocio completo. Se muestra ARRIBA del ranking
 * por tienda, con más énfasis visual (es el dato ejecutivo principal).
 */
export function OverallGrowthCard({ overall }: OverallGrowthCardProps) {
  const partial = overall.comparisonCoverage === 'partial';
  const meta = GROWTH_STATUS_META[overall.status];

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">General · las 6 tiendas</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            {formatCOP(overall.fullRangeCurrentSales)}
          </p>
          <p className="text-xs text-ink-faint">
            en el período{partial && ` (comparación sobre ${overall.comparableMonths} de los meses)`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <GrowthBadge status={overall.status} growthPercent={overall.growthPercent} className="text-lg" />
          <span className="text-xs text-ink-faint">{meta.label} vs. año anterior</span>
        </div>
      </div>
    </div>
  );
}
