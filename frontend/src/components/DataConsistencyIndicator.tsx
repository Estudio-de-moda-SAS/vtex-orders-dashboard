import { StoreDashboardData } from '@/types/dashboard';
import { formatDuration, formatNumber } from '@/lib/format';

interface DataConsistencyIndicatorProps {
  data: StoreDashboardData;
  /** Momento en que se generó esta respuesta (`DashboardResponse.generatedAt`). */
  generatedAt?: string;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function DataConsistencyIndicator({ data, generatedAt }: DataConsistencyIndicatorProps) {
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

      {data.syncInProgress && (
        <span className="inline-flex items-center gap-1.5 font-medium text-accent">
          ⏳ Sincronizando histórico en segundo plano ({formatNumber(data.pendingClosedDays)} días
          pendientes) — los totales subirán cuando termine.
        </span>
      )}

      {/* Falla real (páginas que no se pudieron descargar): esto sí requiere acción. */}
      {!data.isComplete && !data.syncInProgress && (
        <span className="inline-flex items-center gap-1.5 font-medium text-danger">
          ⚠ No se pudo completar la consulta a VTEX. Prueba "Forzar actualización".
        </span>
      )}

      {/* Aviso permanente y tranquilo (no es un error) para datos que incluyen
          días recientes: son una foto del momento exacto de la consulta, no
          una cifra fija — una nueva orden puede haber entrado un segundo
          después. Se muestra siempre que la consulta esté completa, para
          ser honestos sobre la naturaleza de un dato en vivo sin sonar como
          si algo estuviera roto. */}
      {data.isComplete && generatedAt && (
        <span className="text-ink-faint">
          Datos de los días recientes tomados a las {formatTime(generatedAt)} — pueden variar
          levemente si se consulta de nuevo (nuevas órdenes en tiempo real).
        </span>
      )}
    </div>
  );
}
