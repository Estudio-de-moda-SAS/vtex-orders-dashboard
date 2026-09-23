'use client';

import { useMemo, useState } from 'react';

interface CampaignFilterProps {
  availableCampaigns: string[];
  selectedCampaigns: string[];
  onChange: (campaigns: string[]) => void;
}

/**
 * Selector múltiple de campañas de descuento — mismo patrón que
 * `CategoryFilter.tsx` (checkboxes + buscador, cualquier combinación
 * libre). El buscador solo acota qué checkboxes se ven, nunca limita qué
 * se puede seleccionar.
 */
export function CampaignFilter({ availableCampaigns, selectedCampaigns, onChange }: CampaignFilterProps) {
  const [search, setSearch] = useState('');

  const visibleCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return availableCampaigns;
    return availableCampaigns.filter((campaign) => campaign.toLowerCase().includes(term));
  }, [availableCampaigns, search]);

  function toggleCampaign(campaign: string, checked: boolean) {
    onChange(checked ? [...selectedCampaigns, campaign] : selectedCampaigns.filter((c) => c !== campaign));
  }

  // Selecciona TODAS las campañas visibles (las que coinciden con `search`
  // — o todas, si el buscador está vacío), sin descartar una selección
  // previa de campañas que hayan quedado fuera del filtro actual.
  const allVisibleSelected =
    visibleCampaigns.length > 0 && visibleCampaigns.every((c) => selectedCampaigns.includes(c));

  function selectAllVisible() {
    onChange(Array.from(new Set([...selectedCampaigns, ...visibleCampaigns])));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar campaña…"
          className="w-full max-w-xs rounded-xl border border-surface-border bg-surface px-3.5 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <div className="flex items-center gap-3">
          {visibleCampaigns.length > 0 && (
            <button
              type="button"
              onClick={selectAllVisible}
              disabled={allVisibleSelected}
              className="whitespace-nowrap text-xs font-medium text-accent underline transition hover:text-accent/80 disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
            >
              {search.trim() ? `Seleccionar filtradas (${visibleCampaigns.length})` : `Seleccionar todo (${visibleCampaigns.length})`}
            </button>
          )}
          {selectedCampaigns.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="whitespace-nowrap text-xs text-ink-faint underline transition hover:text-ink-muted"
            >
              Limpiar ({selectedCampaigns.length})
            </button>
          )}
        </div>
      </div>

      <div className="grid max-h-64 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-xl border border-surface-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCampaigns.length === 0 ? (
          <p className="text-sm text-ink-faint">Sin coincidencias.</p>
        ) : (
          visibleCampaigns.map((campaign) => {
            const checked = selectedCampaigns.includes(campaign);
            return (
              <label
                key={campaign}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition hover:bg-surface-panel"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleCampaign(campaign, e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-surface-border accent-accent"
                />
                <span className={checked ? 'font-medium text-ink' : 'text-ink-muted'}>{campaign}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
