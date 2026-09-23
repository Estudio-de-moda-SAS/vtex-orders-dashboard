import { GrowthStatus } from '@/types/trends';
import { formatPercentage } from '@/lib/format';

export const GROWTH_STATUS_META: Record<GrowthStatus, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  green: {
    label: 'Creciendo',
    badgeClass: 'bg-positive/10 text-positive',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M10 15V5M10 5L5 10M10 5l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  yellow: {
    label: 'Estable',
    badgeClass: 'bg-warning/10 text-warning',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M5 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  red: {
    label: 'Cayendo',
    badgeClass: 'bg-danger/10 text-danger',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M10 5v10M10 15l-5-5M10 15l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  new: {
    label: 'Nuevo',
    badgeClass: 'bg-accent/10 text-accent',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M10 3l1.8 4.6L16 9l-4.2 1.4L10 15l-1.8-4.6L4 9l4.2-1.4L10 3z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  'no-data': {
    label: 'Sin dato',
    badgeClass: 'bg-surface text-ink-faint',
    icon: <span className="text-sm leading-none">—</span>,
  },
};

interface GrowthBadgeProps {
  status: GrowthStatus;
  growthPercent: number | null;
  className?: string;
}

/** Semáforo de crecimiento — color + ícono de dirección (no solo color). Compartido entre `StoreGrowthTable` y `OverallGrowthCard`. */
export function GrowthBadge({ status, growthPercent, className = '' }: GrowthBadgeProps) {
  const meta = GROWTH_STATUS_META[status];
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${meta.badgeClass} ${className}`}>
      {meta.icon}
      {growthPercent !== null ? (
        <span className="tabular-nums">{formatPercentage(growthPercent)}</span>
      ) : (
        <span>{meta.label}</span>
      )}
    </div>
  );
}
