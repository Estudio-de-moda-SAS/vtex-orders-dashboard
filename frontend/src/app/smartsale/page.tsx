'use client';

import { Suspense, useState } from 'react';

import { ResumenTab } from '@/components/smartsale/ResumenTab';
import { VentasPosTab } from '@/components/smartsale/VentasPosTab';
import { VentasVtexTab } from '@/components/smartsale/VentasVtexTab';

type TabId = 'vtex' | 'pos' | 'resumen' | 'presupuesto' | 'indicadores';

const TABS: { id: TabId; label: string; disabled?: boolean; placeholder?: string }[] = [
  { id: 'vtex', label: 'Ventas VTEX' },
  { id: 'pos', label: 'Ventas POS' },
  { id: 'resumen', label: 'Resumen' },
  {
    id: 'presupuesto',
    label: 'Presupuesto',
    disabled: true,
    placeholder: 'Presupuesto por canal — falta definir si se arma por tienda, marca o canal.',
  },
  {
    id: 'indicadores',
    label: 'Indicadores',
    disabled: true,
    placeholder: 'KPIs del canal SmartSale: utilidad y otros indicadores de interés.',
  },
];

/** `useSearchParams` (dentro de `useDateRangeFilter`, usado por `VentasVtexTab`) exige un límite `<Suspense>` en Next.js App Router. */
export default function SmartSalePage() {
  return (
    <Suspense fallback={null}>
      <SmartSaleContent />
    </Suspense>
  );
}

function SmartSaleContent() {
  const [tab, setTab] = useState<TabId>('vtex');
  const activeTab = TABS.find((t) => t.id === tab);

  return (
    <main className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          SmartSale
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Canal SmartSale</h1>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-surface-border pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            onClick={() => setTab(t.id)}
            title={t.disabled ? 'Próximamente' : undefined}
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

      {tab === 'vtex' && <VentasVtexTab />}
      {tab === 'pos' && <VentasPosTab />}
      {tab === 'resumen' && <ResumenTab />}
      {activeTab?.placeholder && (
        <p className="rounded-2xl border border-surface-border bg-surface-panel p-6 text-sm text-ink-faint">
          {activeTab.placeholder}
        </p>
      )}
    </main>
  );
}
