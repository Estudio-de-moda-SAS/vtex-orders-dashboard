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

      {/*
       * `lastSyncStatus` distingue dos situaciones que antes se mostraban
       * con el MISMO mensaje de advertencia, dando a entender que algo
       * estaba roto en ambos casos:
       * - 'error': la corrida realmente falló (red, credenciales, etc.) —
       *   esto sí amerita sonar como advertencia real.
       * - 'partial': VTEX reportó un total de órdenes que no cuadró exacto
       *   con lo que se logró traer, típicamente por 1-4 órdenes de miles
       *   (inestabilidad conocida de paginación de VTEX, no una falla
       *   nuestra) — se muestra como informativo (ícono "ℹ", color
       *   `accent`, no `danger`/`warning`), explicando la causa en
       *   palabras simples para que no se lea como "el dato está mal".
       */}
      {data.lastSyncStatus === 'error' && (
        <span className="inline-flex items-center gap-1.5 font-medium text-danger">
          ⚠ La sincronización con VTEX falló por un problema técnico (ej. de conexión) — estos datos podrían no
          estar al día. Prueba &quot;Resincronizar&quot; arriba; si sigue fallando, avisa para revisarlo.
        </span>
      )}

      {data.incompleteDays.length > 0 ? (
        <span className="inline-flex items-start gap-1.5 font-medium text-accent">
          ℹ VTEX tardó en confirmar el número exacto de órdenes en{' '}
          {data.incompleteDays.length === 1 ? 'este día' : 'estos días'}: {describeIncompleteDays(data.incompleteDays)}.
          Es normal (puede faltar 1 o 2 pedidos por confirmar, no una falla) y suele corregirse solo en la próxima
          sincronización — si quieres verificarlo ya, usa &quot;Resincronizar&quot; arriba.
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
