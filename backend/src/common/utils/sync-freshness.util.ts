/**
 * El cron de VTEX corre cada `SYNC_CRON_INTERVAL_HOURS` (default 4h) —
 * más de 12h sin sincronizar son 3 ciclos seguidos sin correr, una señal
 * real de que algo falló (mismo tipo de falla silenciosa que tuvo GA4
 * este mes — ver `ga-sync-cron.service.ts`), no una demora normal.
 */
export const DEFAULT_STALE_SYNC_HOURS = 12;

export interface SyncFreshnessCheck {
  isStale: boolean;
  /** `null` si nunca se ha sincronizado (no hay `lastSyncedAt` en `sync_logs`). */
  hoursSinceSync: number | null;
}

/**
 * Determina si la última sincronización de una tienda está desactualizada
 * — puro y determinista a propósito (el modelo del asistente NUNCA debe
 * calcular "cuántas horas pasaron" por su cuenta, mismo criterio que el
 * resto de los cálculos de este proyecto). `nowMs` es inyectable para
 * pruebas; en producción se omite y usa `Date.now()`.
 */
export function checkSyncFreshness(lastSyncedAt: string | null, maxHours: number = DEFAULT_STALE_SYNC_HOURS, nowMs: number = Date.now()): SyncFreshnessCheck {
  if (!lastSyncedAt) return { isStale: true, hoursSinceSync: null };
  const hoursSinceSync = (nowMs - new Date(lastSyncedAt).getTime()) / (60 * 60 * 1000);
  return { isStale: hoursSinceSync >= maxHours, hoursSinceSync };
}

/** `0 horas` se lee raro — "menos de 1 hora" para cualquier cosa por debajo de 1h completa. */
function formatHours(hours: number): string {
  const rounded = Math.floor(hours);
  if (rounded <= 0) return 'menos de 1 hora';
  if (rounded === 1) return '1 hora';
  return `${rounded} horas`;
}

/**
 * Nota ya redactada en español, SIEMPRE presente (nunca `null`) — a
 * diferencia de una advertencia que solo aparece cuando algo falla, el
 * usuario pidió que la última sincronización se mencione de forma breve y
 * discreta en TODA respuesta de ventas, y que solo escale a una
 * recomendación cuando pasen las `maxHours` configuradas (12h = 3 ciclos
 * del cron) — ahí sí apunta al botón "Resincronizar" del Dashboard (`/`),
 * el único mecanismo manual de resync de VTEX que existe hoy. El
 * asistente decide el tono (discreto vs. destacado) él mismo, pero el
 * CONTENIDO de la nota ya refleja cuál es — nunca calcula las horas de su
 * propia cuenta.
 */
export function buildSyncNote(storeName: string, check: SyncFreshnessCheck): string {
  if (check.hoursSinceSync === null) {
    return `${storeName} no tiene ninguna sincronización de VTEX registrada todavía — estos datos podrían no existir o estar muy desactualizados. Resincroniza manualmente desde el Dashboard ("Resincronizar este rango con VTEX").`;
  }
  const hoursLabel = formatHours(check.hoursSinceSync);
  // Caso normal (al día): una etiqueta cortísima a propósito — el usuario pidió que sea
  // "muy sutil", nunca una oración completa como el caso de abajo (que sí debe notarse).
  if (!check.isStale) {
    return `sync: hace ${hoursLabel}`;
  }
  return `${storeName} no se sincroniza con VTEX desde hace ${hoursLabel} (más de lo normal) — estos datos podrían estar desactualizados. Considera resincronizar manualmente desde el Dashboard ("Resincronizar este rango con VTEX").`;
}
