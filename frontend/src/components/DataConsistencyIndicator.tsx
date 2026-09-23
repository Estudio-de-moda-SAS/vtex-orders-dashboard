import { StoreDashboardData } from '@/types/dashboard';
import { formatDuration } from '@/lib/format';

interface DataConsistencyIndicatorProps {
  data: StoreDashboardData;
  /** Cada cuántas horas corre el cron — usado para estimar cuándo será la próxima sincronización. */
  cronIntervalHours: number;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

function formatDayOnly(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' }).format(new Date(year, month - 1, day));
}

const MAX_LISTED_DAYS = 5;

function describeIncompleteDays(days: string[]): string {
  if (days.length <= MAX_LISTED_DAYS) return days.map(formatDayOnly).join(', ');
  return `${days.slice(0, MAX_LISTED_DAYS).map(formatDayOnly).join(', ')} y ${days.length - MAX_LISTED_DAYS} día(s) más`;
}

/**
 * El cron corre cada `cronIntervalHours` desde que arrancó el backend, no
 * desde `lastSyncedAt` de CADA tienda — pero como una corrida tarda
 * minutos (no horas), `lastSyncedAt + cronIntervalHours` es una
 * estimación suficientemente buena de cuándo será la próxima. Si ya se
 * pasó esa hora estimada (el backend estuvo caído, o la corrida más
 * reciente fue 'error'/'partial' y por eso `lastSyncedAt` quedó
 * desactualizado), se muestra "en cualquier momento" en vez de una hora
 * pasada, que confundiría más de lo que ayuda.
 */
function estimateNextSync(lastSyncedAt: string, cronIntervalHours: number): string {
  const nextSyncMs = new Date(lastSyncedAt).getTime() + cronIntervalHours * 60 * 60 * 1000;
  if (nextSyncMs <= Date.now()) return 'en cualquier momento';
  return formatDateTime(new Date(nextSyncMs).toISOString());
}

/**
 * Ya no existe una consulta "en vivo" a VTEX por petición: todo dato
 * viene de la última corrida del cron de sincronización (`sync_logs`).
 * Este indicador muestra esa frescura (`lastSyncedAt`) en vez del viejo
 * "backfill en progreso"/"consulta incompleta".
 */
export function DataConsistencyIndicator({ data, cronIntervalHours }: DataConsistencyIndicatorProps) {
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

      {data.incompleteDays.length > 0 ? (
        <span className="inline-flex items-start gap-1.5 font-medium text-warning">
          ⚠ Posible diferencia menor con VTEX en {data.incompleteDays.length === 1 ? 'este día' : 'estos días'} del
          rango: {describeIncompleteDays(data.incompleteDays)}. Prueba el botón &quot;Resincronizar&quot; de arriba.
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 font-medium text-positive">
          ✓ Sin diferencias conocidas con VTEX para este rango
        </span>
      )}

      {data.lastSyncedAt && (
        <span className="text-ink-faint">Última sincronización: {formatDateTime(data.lastSyncedAt)}</span>
      )}

      {data.lastSyncedAt && (
        <span className="text-ink-faint">
          Próxima sincronización estimada: {estimateNextSync(data.lastSyncedAt, cronIntervalHours)} (cada{' '}
          {cronIntervalHours}h)
        </span>
      )}
    </div>
  );
}
