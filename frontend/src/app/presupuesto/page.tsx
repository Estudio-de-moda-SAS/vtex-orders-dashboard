'use client';

import { Suspense, useState } from 'react';

import { CreditNotesTab } from '@/components/presupuesto/CreditNotesTab';
import { VtexBudgetTab } from '@/components/presupuesto/VtexBudgetTab';

type TabId = 'vtex' | 'notas-credito' | 'erp' | 'resumen';

const TABS: { id: TabId; label: string; disabled?: boolean }[] = [
  { id: 'vtex', label: 'Ventas y presupuesto VTEX' },
  { id: 'notas-credito', label: 'Notas crédito' },
  { id: 'erp', label: 'Presupuesto y ventas ERP', disabled: true },
  { id: 'resumen', label: 'Resumen (VTEX + ERP + NC)', disabled: true },
];

/** `useSearchParams` (dentro de `useDateRangeFilter`, usado por ambas pestañas) exige un límite `<Suspense>` en Next.js App Router. */
export default function PresupuestoPage() {
  return (
    <Suspense fallback={null}>
      <PresupuestoContent />
    </Suspense>
  );
}

function PresupuestoContent() {
  const [tab, setTab] = useState<TabId>('vtex');

  return (
    <main className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Presupuesto
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Presupuesto y ventas reales</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Ventas y presupuesto del canal VTEX, notas crédito del ERP, y (más adelante) presupuesto/ventas ERP y un
          resumen combinado para medir ventas reales y utilidad.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-surface-border pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            onClick={() => setTab(t.id)}
            title={t.disabled ? 'Próximamente — todavía no tenemos esa fuente de datos' : undefined}
            className={`-mb-px rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-accent text-accent'
                : t.disabled
                  ? 'cursor-not-allowed border-transparent text-ink-faint/60'
                  : 'border-transparent text-ink-muted hover:border-surface-border hover:text-ink'
            }`}
          >
            {t.label}
            {t.disabled && <span className="ml-1.5 text-[10px] uppercase tracking-wide">(próximamente)</span>}
          </button>
        ))}
      </nav>

      {tab === 'vtex' && <VtexBudgetTab />}
      {tab === 'notas-credito' && <CreditNotesTab />}
      {tab === 'erp' && (
        <p className="rounded-2xl border border-surface-border bg-surface-panel p-6 text-sm text-ink-faint">
          Todavía no tenemos facturas/ventas del ERP como fuente de datos — esta pestaña queda lista para cuando esa
          información esté disponible.
        </p>
      )}
      {tab === 'resumen' && (
        <p className="rounded-2xl border border-surface-border bg-surface-panel p-6 text-sm text-ink-faint">
          Este resumen va a combinar VTEX + ERP + notas crédito para medir ventas reales y utilidad — depende de que
          la pestaña &quot;Presupuesto y ventas ERP&quot; tenga datos primero.
        </p>
      )}
    </main>
  );
}
