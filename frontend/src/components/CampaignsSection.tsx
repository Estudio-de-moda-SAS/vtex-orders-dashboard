'use client';

import { useEffect, useMemo, useState } from 'react';

import { StoreDashboardResult } from '@/types/dashboard';
import { CampaignComboTotalsByStore, StoreHighlightsByStore } from '@/types/product-analytics';
import { ordersService } from '@/services/orders.service';
import { CampaignFilter } from './CampaignFilter';
import { CampaignsByStoreTable } from './CampaignsByStoreTable';

interface CampaignsSectionProps {
  stores: StoreDashboardResult[];
  highlights: StoreHighlightsByStore;
  startDate: string;
  endDate: string;
}

/**
 * Agrupa el filtro de campañas con el recuadro que lo usa — mismo patrón
 * que `CategoriesSection.tsx`. El filtro opera sobre el mismo rango de
 * fechas ya consultado, solo acota qué campañas se muestran por tienda.
 *
 * Cuando hay campañas seleccionadas, además pide el total EXACTO (sin
 * doble conteo por traslape entre campañas) al endpoint dedicado — ver
 * `CampaignsByStoreTable`, que lo usa en vez de sumar las filas
 * individuales de `highlights`.
 */
export function CampaignsSection({ stores, highlights, startDate, endDate }: CampaignsSectionProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [comboTotals, setComboTotals] = useState<CampaignComboTotalsByStore | null>(null);
  const [comboTotalsLoading, setComboTotalsLoading] = useState(false);

  const availableCampaigns = useMemo(() => {
    const campaigns = new Set<string>();
    for (const highlight of Object.values(highlights)) {
      for (const campaign of highlight.campaigns) campaigns.add(campaign.campaignName);
    }
    return Array.from(campaigns).sort((a, b) => a.localeCompare(b, 'es'));
  }, [highlights]);

  useEffect(() => {
    if (selectedCampaigns.length === 0) {
      setComboTotals(null);
      return;
    }
    let cancelled = false;
    setComboTotalsLoading(true);
    ordersService
      .getCampaignComboTotal(startDate, endDate, selectedCampaigns)
      .then((totals) => {
        if (!cancelled) setComboTotals(totals);
      })
      .catch(() => {
        if (!cancelled) setComboTotals(null);
      })
      .finally(() => {
        if (!cancelled) setComboTotalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCampaigns, startDate, endDate]);

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

      <CampaignsByStoreTable
        stores={stores}
        highlights={highlights}
        selectedCampaigns={selectedCampaigns}
        comboTotals={comboTotals}
        comboTotalsLoading={comboTotalsLoading}
      />
    </div>
  );
}
