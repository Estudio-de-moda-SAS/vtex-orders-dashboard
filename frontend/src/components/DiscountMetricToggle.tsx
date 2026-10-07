'use client';

import { DiscountMetric } from '@/lib/discount';

interface DiscountMetricToggleProps {
  value: DiscountMetric;
  onChange: (metric: DiscountMetric) => void;
}

/** Alterna entre ver los descuentos por cantidad de PRODUCTOS o por VALOR EN PESOS vendido — mismo control reutilizado en el dashboard y en /descuentos, para que ambas vistas se lean con el mismo criterio. */
export function DiscountMetricToggle({ value, onChange }: DiscountMetricToggleProps) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-surface-border bg-surface p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange('units')}
        aria-pressed={value === 'units'}
        className={`rounded-md px-2.5 py-1 font-medium transition ${
          value === 'units' ? 'bg-accent text-white' : 'text-ink-faint hover:text-ink'
        }`}
      >
        Por producto
      </button>
      <button
        type="button"
        onClick={() => onChange('sales')}
        aria-pressed={value === 'sales'}
        className={`rounded-md px-2.5 py-1 font-medium transition ${
          value === 'sales' ? 'bg-accent text-white' : 'text-ink-faint hover:text-ink'
        }`}
      >
        Por valor ($)
      </button>
    </div>
  );
}
