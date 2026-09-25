'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { ErrorState } from '@/components/ErrorState';
import { OverallGrowthCard } from '@/components/OverallGrowthCard';
import { StoreGrowthTable } from '@/components/StoreGrowthTable';
import { TrendLineChart } from '@/components/TrendLineChart';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { ordersService } from '@/services/orders.service';
import { TrendsResponse } from '@/types/trends';

const STORES = [
  { id: 'pilatos', name: 'Pilatos' },
  { id: 'kipling', name: 'Kipling' },
  { id: 'diesel', name: 'Diesel' },
  { id: 'superdry', name: 'Superdry' },
  { id: 'girbaud', name: 'Girbaud' },
  { id: 'replay', name: 'Replay' },
];

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const STORAGE_KEY = 'tendencias-filters';

interface StoredFilters {
  year: number;
  month: string;
  storeId: string;
}

/**
 * El navbar enlaza a `/tendencias` sin query params (a diferencia de un
 * link compartido, que sí los trae) — sin esto, volver por el navbar
 * después de visitar otra ruta reiniciaba el filtro cada vez dentro de la
 * misma sesión. `sessionStorage` (no `localStorage` a propósito): se borra
 * solo al cerrar la pestaña/navegador, así que una sesión nueva siempre
 * arranca con el filtro por defecto en vez de arrastrar la última
 * búsqueda para siempre. Puede fallar (modo privado, storage bloqueado) —
 * nunca debe romper la página por eso, de ahí el try/catch.
 */
function readStoredFilters(): StoredFilters | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredFilters;
  } catch {
    return null;
  }
}

function writeStoredFilters(filters: StoredFilters): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignorado a propósito — perder la preferencia guardada no debe romper nada.
  }
}

/**
 * `useSearchParams` exige un límite `<Suspense>` en Next.js App Router
 * (si no, el build falla) — de ahí que el contenido real esté separado
 * en `TendenciasContent`.
 */
export default function TendenciasPage() {
  return (
    <Suspense fallback={null}>
      <TendenciasContent />
    </Suspense>
  );
}

function TendenciasContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estado inicial: la URL manda si trae AL MENOS uno de estos params
  // (link compartido, recarga de página); si no trae NINGUNO (ej. se
  // llegó por el link "Tendencias" del navbar, que no lleva query
  // string), se restaura el último filtro guardado en localStorage. Se
  // calcula UNA sola vez, antes de que corra ningún efecto — así no hay
  // una ventana donde un efecto vea el valor por defecto y sobrescriba lo
  // que el otro acaba de restaurar.
  const hasUrlFilters = searchParams.has('year') || searchParams.has('month') || searchParams.has('store');
  const [year, setYear] = useState(() => {
    const fromUrl = Number(searchParams.get('year'));
    if (YEAR_OPTIONS.includes(fromUrl)) return fromUrl;
    const stored = !hasUrlFilters ? readStoredFilters() : null;
    if (stored && YEAR_OPTIONS.includes(stored.year)) return stored.year;
    return CURRENT_YEAR;
  });
  const [storeId, setStoreId] = useState<string>(() => {
    if (searchParams.has('store')) return searchParams.get('store') ?? '';
    return !hasUrlFilters ? readStoredFilters()?.storeId ?? '' : '';
  });
  /** '' = año corrido completo; un número (como string) = ese mes puntual aislado. */
  const [month, setMonth] = useState<string>(() => {
    if (searchParams.has('month')) return searchParams.get('month') ?? '';
    return !hasUrlFilters ? readStoredFilters()?.month ?? '' : '';
  });

  const lastAvailableMonth = year === CURRENT_YEAR ? CURRENT_MONTH : 12;

  // Cada vez que un filtro cambia, se refleja en la URL (query params) —
  // `replace` (no `push`) para no llenar el historial del navegador con
  // cada ajuste de filtro — y también se guarda en localStorage para que
  // volver por el navbar (sin query string) lo recuerde.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('year', String(year));
    if (month) params.set('month', month);
    if (storeId) params.set('store', storeId);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    writeStoredFilters({ year, month, storeId });
  }, [year, month, storeId, pathname, router]);

  // Cacheado en sessionStorage por combinación de filtros: volver a
  // /tendencias con el mismo año/mes/tienda ya consultado (ej. después de
  // visitar otra página del navbar) lo muestra al instante.
  const { state: requestState, refetch: runQuery } = useCachedQuery<TrendsResponse>(
    `tendencias:${year}:${month}:${storeId}`,
    () => {
      const monthNumber = month ? Number(month) : undefined;
      return ordersService.getTrends(year, monthNumber, monthNumber, storeId || undefined);
    },
  );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Tendencias · Año contra año
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Comparativo año vs. año</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Ventas contabilizadas del año seleccionado contra el mismo período del año anterior — todo el año corrido, o
          un mes puntual (filtro "Mes") para validar cuánto creció o cayó ese mes específico. No hay historial antes
          de julio de 2025 — esos meses se muestran sin comparación.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-surface-border bg-surface-panel p-4 shadow-panel">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Año
          <select
            value={year}
            onChange={(e) => {
              const newYear = Number(e.target.value);
              setYear(newYear);
              const maxMonth = newYear === CURRENT_YEAR ? CURRENT_MONTH : 12;
              if (month && Number(month) > maxMonth) setMonth('');
            }}
            className="rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Mes
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">Año corrido</option>
            {Array.from({ length: lastAvailableMonth }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Solo {MONTH_NAMES[m - 1]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Tienda (solo afecta la línea de tendencia)
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">Todas las tiendas</option>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {requestState.status === 'loading' && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Consultando tendencias…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' && (
        <>
          <OverallGrowthCard overall={requestState.data.overallGrowth} />
          <TrendLineChart monthly={requestState.data.monthly} year={year} priorYear={year - 1} />
          <StoreGrowthTable storeGrowth={requestState.data.storeGrowth} />
        </>
      )}
    </main>
  );
}
