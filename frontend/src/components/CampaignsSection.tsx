'use client';

import { useMemo, useState } from 'react';

import { StoreDashboardResult } from '@/types/dashboard';
import { StoreHighlightsByStore } from '@/types/product-analytics';
import { CampaignFilter } from './CampaignFilter';
import { CampaignsByStoreTable } from './CampaignsByStoreTable';

interface CampaignsSectionProps {
  stores: StoreDashboardResult[];
  highlights: StoreHighlightsByStore;
}

/**
 * Agrupa el filtro de campañas con el recuadro que lo usa — mismo patrón
 * que `CategoriesSection.tsx`. El filtro opera sobre el mismo rango de
 * fechas ya consultado, solo acota qué campañas se muestran por tienda.
 */
export function CampaignsSection({ stores, highlights }: CampaignsSectionProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);

  const availableCampaigns = useMemo(() => {
    const campaigns = new Set<string>();
    for (const highlight of Object.values(highlights)) {
      for (const campaign of highlight.campaigns) campaigns.add(campaign.campaignName);
    }
    return Array.from(campaigns).sort((a, b) => a.localeCompare(b, 'es'));
  }, [highlights]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Filtrar por campaña</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Selecciona una o más campañas de descuento para ver sus órdenes y valor por tienda.
        </p>
        <CampaignFilter
          availableCampaigns={availableCampaigns}
          selectedCampaigns={selectedCampaigns}
          onChange={setSelectedCampaigns}
        />
      </div>

      <CampaignsByStoreTable stores={stores} highlights={highlights} selectedCampaigns={selectedCampaigns} />
    </div>
  );
}
