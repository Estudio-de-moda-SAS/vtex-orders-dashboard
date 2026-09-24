'use client';

import { useMemo, useState } from 'react';

import { StoreDashboardResult } from '@/types/dashboard';
import { SmartSaleCampaignsByStore, SmartSaleSummaryByStore } from '@/types/smartsale';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { CampaignFilter } from './CampaignFilter';

interface SmartSaleCampaignsSectionProps {
  stores: StoreDashboardResult[];
  campaigns: SmartSaleCampaignsByStore;
  /** Para calcular el % de cada campaña sobre `smartSaleSales` de esa tienda (el total del canal, no el de la tienda completa). */
  summary: SmartSaleSummaryByStore;
}

/**
 * Campañas de descuento usadas en ventas de SmartSale, por tienda — mismo
 * patrón que `CampaignsSection` del dashboard general, pero sin el
 * desglose "con alguna campaña / Sin campaña" (acá no se rastrea "Sin
 * campaña" a propósito, es menos relevante para este canal específico).
 *
 * El % de cada campaña es sobre el total del canal SmartSale de esa
 * tienda (`summary[store.id].smartSaleSales`). Una orden puede calificar
 * para varias campañas a la vez (ej. un % de descuento + envío gratis
 * simultáneos), así que sumar los % de todas las campañas de una tienda
 * puede superar el 100% — no es un error, cada campaña se mide por
 * separado, igual que en el dashboard general.
 */
export function SmartSaleCampaignsSection({ stores, campaigns, summary }: SmartSaleCampaignsSectionProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);

  const availableCampaigns = useMemo(() => {
    const names = new Set<string>();
    for (const list of Object.values(campaigns)) {
      for (const c of list) names.add(c.campaignName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [campaigns]);

  const isFiltered = selectedCampaigns.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Filtrar por campaña (SmartSale)</h3>
        <p className="mb-3 text-xs text-ink-faint">
          Campañas de descuento usadas en ventas del canal SmartSale, por tienda.
        </p>
        <CampaignFilter
          availableCampaigns={availableCampaigns}
          selectedCampaigns={selectedCampaigns}
          onChange={setSelectedCampaigns}
        />
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
        <h3 className="mb-4 font-display text-base font-semibold text-ink">Campañas de descuento por tienda (SmartSale)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => {
            const list = isFiltered
              ? (campaigns[store.id] ?? []).filter((c) => selectedCampaigns.includes(c.campaignName))
              : (campaigns[store.id] ?? []);
            if (list.length === 0) return null;
            const smartSaleSales = summary[store.id]?.smartSaleSales ?? 0;
            return (
              <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                  {store.name}
                </p>
                <ul className="flex flex-col gap-1">
                  {list.map((c) => {
                    const percentage = smartSaleSales > 0 ? (c.sales / smartSaleSales) * 100 : 0;
                    return (
                      <li key={c.campaignName} className="flex items-baseline justify-between gap-2 text-xs text-ink-muted">
                        <span className="truncate">{c.campaignName}</span>
                        <span className="shrink-0 tabular-nums text-ink">
                          {formatNumber(c.orders)} ord. · {formatCOP(c.sales)}{' '}
                          <span className="text-ink-faint">({formatPercentage(percentage)})</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        {stores.every((s) => (campaigns[s.id] ?? []).length === 0) && (
          <p className="text-sm text-ink-faint">Sin campañas registradas en ventas de SmartSale en este rango.</p>
        )}
      </div>
    </div>
  );
}
