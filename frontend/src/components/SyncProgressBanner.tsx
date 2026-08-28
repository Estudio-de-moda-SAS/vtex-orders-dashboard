import { SyncJob } from '@/types/dashboard';
import { EnrichmentStatus } from '@/types/product-analytics';
import { formatNumber } from '@/lib/format';

interface SyncProgressBannerProps {
  jobs: SyncJob[];
  /** Estado de enriquecimiento (ciudad + descuento + categoría + marca) por tienda, para el rango consultado. */
  enrichmentStatusByStore?: Record<string, EnrichmentStatus>;
}

/**
 * Banner que muestra el progreso de trabajos en segundo plano que afectan
 * lo que se ve en el dashboard: backfills históricos grandes (ej. la
 * primera vez que se pide "todo el año pasado") y el enriquecimiento de
 * producto (ciudad, descuento, categoría, marca). El dashboard mientras
 * tanto ya muestra lo que sí está disponible; este banner explica que el
 * resto está en camino y se completará solo — a propósito con un tono
 * más tranquilo para el enriquecimiento que para el backfill, porque no
 * bloquea nada, solo va completando datos de a poco.
 */
export function SyncProgressBanner({ jobs, enrichmentStatusByStore = {} }: SyncProgressBannerProps) {
  const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'running');

  const incompleteEnrichment = Object.values(enrichmentStatusByStore).filter((s) => !s.isComplete);
  const enrichmentTotal = incompleteEnrichment.reduce((acc, s) => acc + s.totalOrders, 0);
  const enrichmentDone = incompleteEnrichment.reduce((acc, s) => acc + s.enrichedOrders, 0);
  const enrichmentPercentage = enrichmentTotal > 0 ? Math.round((enrichmentDone / enrichmentTotal) * 100) : 100;
  const showEnrichmentBanner = incompleteEnrichment.length > 0;

  if (activeJobs.length === 0 && !showEnrichmentBanner) return null;

  const totalDays = activeJobs.reduce((acc, j) => acc + j.totalDays, 0);
  const completedDays = activeJobs.reduce((acc, j) => acc + j.completedDays, 0);
  const percentage = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      {activeJobs.length > 0 && (
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
      )}

      {showEnrichmentBanner && (
        <div className="flex flex-col gap-2 rounded-2xl border border-surface-border bg-surface-panel px-4 py-3.5">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-faint/30 border-t-ink-faint" />
            Completando ciudad, descuentos y categorías de productos recientes — puede que veas
            &quot;Pendiente de identificar&quot; en algunos datos mientras tanto.
          </div>
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-ink-faint/60 transition-all duration-500"
                style={{ width: `${enrichmentPercentage}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-ink-faint">
              {formatNumber(enrichmentDone)} / {formatNumber(enrichmentTotal)} órdenes ({enrichmentPercentage}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
