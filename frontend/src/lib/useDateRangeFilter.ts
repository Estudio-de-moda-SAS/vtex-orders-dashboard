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
 * Requiere `useSearchParams`, así que el componente que use este hook
 * debe estar envuelto en `<Suspense>` (exigencia de Next.js App Router).
 */
export function useDateRangeFilter(storageKey: string, getDefaultRange: () => StoredDateRange = getDefaultDateRange) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estado inicial: la URL manda si trae `startDate`/`endDate` (link
  // compartido, recarga); si no trae NINGUNO, se restaura lo último
  // guardado en localStorage; si tampoco hay nada guardado, los últimos
  // 7 días. Todo calculado UNA sola vez al inicializar el estado — nunca
  // en un efecto aparte, para evitar que un efecto con valores viejos
  // sobrescriba lo que se acaba de restaurar.
  const hasUrlRange = searchParams.has('startDate') || searchParams.has('endDate');

  const [startDate, setStartDate] = useState(() => {
    if (searchParams.has('startDate')) return searchParams.get('startDate') ?? '';
    if (!hasUrlRange) {
      const stored = readStored(storageKey);
      if (stored) return stored.startDate;
    }
    return getDefaultRange().startDate;
  });

  const [endDate, setEndDate] = useState(() => {
    if (searchParams.has('endDate')) return searchParams.get('endDate') ?? '';
    if (!hasUrlRange) {
      const stored = readStored(storageKey);
      if (stored) return stored.endDate;
    }
    return getDefaultRange().endDate;
  });

  // Cada vez que el rango cambia, se refleja en la URL (`replace`, no
  // `push`, para no llenar el historial del navegador) y se guarda en
  // localStorage.
  useEffect(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    if (startDate && endDate) writeStored(storageKey, { startDate, endDate });
  }, [startDate, endDate, pathname, router, storageKey]);

  return { startDate, setStartDate, endDate, setEndDate };
}
