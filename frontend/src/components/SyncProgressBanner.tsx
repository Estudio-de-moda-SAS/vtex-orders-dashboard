import { SyncJob } from '@/types/dashboard';
import { formatNumber } from '@/lib/format';

interface SyncProgressBannerProps {
  jobs: SyncJob[];
}

/**
 * Banner que muestra el progreso de uno o más backfills históricos en
 * segundo plano (ej. la primera vez que se pide "todo el año pasado").
 * El dashboard mientras tanto ya muestra lo que sí está disponible
 * (caché + días recientes en vivo); este banner explica que el resto
 * está en camino y se completará solo.
 */
export function SyncProgressBanner({ jobs }: SyncProgressBannerProps) {
  const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'running');
  if (activeJobs.length === 0) return null;

  const totalDays = activeJobs.reduce((acc, j) => acc + j.totalDays, 0);
  const completedDays = activeJobs.reduce((acc, j) => acc + j.completedDays, 0);
  const percentage = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3.5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        Trayendo histórico por primera vez — esto puede tardar unos minutos, el resto de datos ya
        disponibles se muestran mientras tanto.
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-ink-muted">
          {formatNumber(completedDays)} / {formatNumber(totalDays)} días ({percentage}%)
        </span>
      </div>
    </div>
  );
}
