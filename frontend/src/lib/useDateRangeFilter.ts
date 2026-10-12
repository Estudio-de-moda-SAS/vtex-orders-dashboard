'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { getDefaultDateRange } from './date';

interface StoredDateRange {
  startDate: string;
  endDate: string;
}

/**
 * `sessionStorage` puede fallar (modo privado, storage bloqueado) — nunca
 * debe romper la página por eso, de ahí el try/catch en ambas funciones.
 */
function readStored(key: string): StoredDateRange | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDateRange;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: StoredDateRange): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignorado a propósito — perder la preferencia guardada no debe romper nada.
  }
}

/**
 * Rango de fechas (`startDate`/`endDate`) persistido en la URL (query
 * params, para que un link filtrado sea compartible) y en `sessionStorage`
 * (para que volver por un link del navbar — que no lleva query string —
 * no reinicie el filtro a los últimos 7 días DENTRO de la misma sesión del
 * navegador). A propósito NO es `localStorage`: al cerrar la pestaña/
 * navegador, `sessionStorage` se borra solo, así que la siguiente sesión
 * siempre arranca limpia con el rango por defecto (últimos 7 días) en vez
 * de arrastrar para siempre la última búsqueda de días/semanas atrás.
 *
 * `storageKey` debe ser único por página (ej. "vica-dashboard-range",
 * "vica-descuentos-range") para que cada ruta recuerde su propio filtro
 * por separado, sin pisarse entre sí.
 *
 * `getDefaultRange` es el rango que se usa cuando no hay nada en la URL
 * ni en `localStorage` (primera visita) — por defecto los últimos 7 días,
 * pero páginas de tendencias (ej. `/pilatos`) pueden pasar
 * `getYearToDateRange` para arrancar mostrando el año en curso completo.
 *
 * `paramNames` permite tener DOS instancias de este hook en la MISMA
 * página (ej. `/resumen`, que compara "Rango A" contra "Rango B") sin que
 * se pisen los query params — cada instancia usa su propio par de
 * nombres (`startDateA`/`endDateA`, `startDateB`/`endDateB`...) y el
 * efecto de sincronización FUSIONA sobre los params ya existentes en vez
 * de reemplazar toda la URL, para no borrar los de la otra instancia.
 *
 * Requiere `useSearchParams`, así que el componente que use este hook
 * debe estar envuelto en `<Suspense>` (exigencia de Next.js App Router).
 */
export function useDateRangeFilter(
  storageKey: string,
  getDefaultRange: () => StoredDateRange = getDefaultDateRange,
  paramNames: { start: string; end: string } = { start: 'startDate', end: 'endDate' },
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estado inicial: la URL manda si trae los params de esta instancia
  // (link compartido, recarga); si no trae NINGUNO, se restaura lo
  // último guardado en localStorage; si tampoco hay nada guardado, el
  // rango por defecto. Todo calculado UNA sola vez al inicializar el
  // estado — nunca en un efecto aparte, para evitar que un efecto con
  // valores viejos sobrescriba lo que se acaba de restaurar.
  const hasUrlRange = searchParams.has(paramNames.start) || searchParams.has(paramNames.end);

  const [startDate, setStartDate] = useState(() => {
    if (searchParams.has(paramNames.start)) return searchParams.get(paramNames.start) ?? '';
    if (!hasUrlRange) {
      const stored = readStored(storageKey);
      if (stored) return stored.startDate;
    }
    return getDefaultRange().startDate;
  });

  const [endDate, setEndDate] = useState(() => {
    if (searchParams.has(paramNames.end)) return searchParams.get(paramNames.end) ?? '';
    if (!hasUrlRange) {
      const stored = readStored(storageKey);
      if (stored) return stored.endDate;
    }
    return getDefaultRange().endDate;
  });

  // Cada vez que el rango cambia, se refleja en la URL (`replace`, no
  // `push`, para no llenar el historial del navegador) y se guarda en
  // localStorage. Arranca de los params YA EXISTENTES (no de uno vacío)
  // para no borrar los de otra instancia de este mismo hook en la misma
  // página (ver `paramNames`).
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (startDate) params.set(paramNames.start, startDate);
    if (endDate) params.set(paramNames.end, endDate);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    if (startDate && endDate) writeStored(storageKey, { startDate, endDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, pathname, router, storageKey, paramNames.start, paramNames.end]);

  return { startDate, setStartDate, endDate, setEndDate };
}
