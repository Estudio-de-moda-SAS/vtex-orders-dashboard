import { StoreDashboardData } from '@/types/dashboard';
import { formatDuration } from '@/lib/format';

interface DataConsistencyIndicatorProps {
  data: StoreDashboardData;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

/**
 * Ya no existe una consulta "en vivo" a VTEX por petición: todo dato
 * viene de la última corrida del cron de sincronización (`sync_logs`).
 * Este indicador muestra esa frescura (`lastSyncedAt`) en vez del viejo
 * "backfill en progreso"/"consulta incompleta".
 */
export function DataConsistencyIndicator({ data }: DataConsistencyIndicatorProps) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-surface-border pt-3 text-xs text-ink-faint">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span
          className={
            'inline-flex items-center gap-1.5 font-medium ' +
            (data.isConsistent ? 'text-positive' : 'text-warning')
          }
        >
          {data.isConsistent ? '✓ Datos consistentes' : '⚠ Revisar datos'}
        </span>
        <span>{formatDuration(data.responseTimeMs)} de respuesta</span>
      </div>

      {!data.isComplete && (
        <span className="inline-flex items-center gap-1.5 font-medium text-danger">
          ⚠ La última sincronización con VTEX para esta tienda falló — los datos pueden no estar
          al día.
        </span>
      )}

      {data.lastSyncedAt && (
        <span className="text-ink-faint">Última sincronización: {formatDateTime(data.lastSyncedAt)}</span>
      )}
    </div>
  );
}
