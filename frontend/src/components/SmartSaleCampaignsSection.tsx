'use client';

import { useEffect, useMemo, useState } from 'react';

import { StoreDashboardResult } from '@/types/dashboard';
import { CampaignComboTotalsByStore } from '@/types/product-analytics';
import { SmartSaleCampaignsByStore, SmartSaleSummaryByStore } from '@/types/smartsale';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { ordersService } from '@/services/orders.service';
import { CampaignFilter } from './CampaignFilter';

const NO_CAMPAIGN_LABEL = 'Sin campaña';

interface SmartSaleCampaignsSectionProps {
  stores: StoreDashboardResult[];
  campaigns: SmartSaleCampaignsByStore;
  /** Para calcular el % de cada campaña sobre `smartSaleSales` de esa tienda (el total del canal, no el de la tienda completa). */
  summary: SmartSaleSummaryByStore;
  startDate: string;
  endDate: string;
}

/**
 * Campañas de descuento usadas en ventas de SmartSale, por tienda — mismo
 * patrón que `CampaignsByStoreTable` del dashboard general, incluyendo el
 * mismo desglose "Total tienda / con alguna campaña / Sin campaña": el
 * backend ya trae una fila "Sin campaña" para SmartSale (mismo mecanismo
 * que las campañas generales, ver `daily-aggregator.ts`), antes solo no
 * se mostraba en esta sección.
 *
 * El % de cada campaña es sobre el total del canal SmartSale de esa
 * tienda (`summary[store.id].smartSaleSales`). Una orden puede calificar
 * para varias campañas a la vez (ej. un % de descuento + envío gratis
 * simultáneos), así que sumar los % de todas las campañas de una tienda
 * puede superar el 100% — no es un error, cada campaña se mide por
 * separado, igual que en el dashboard general.
 */
export function SmartSaleCampaignsSection({ stores, campaigns, summary, startDate, endDate }: SmartSaleCampaignsSectionProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [comboTotals, setComboTotals] = useState<CampaignComboTotalsByStore | null>(null);
  const [comboTotalsLoading, setComboTotalsLoading] = useState(false);

  const availableCampaigns = useMemo(() => {
    const names = new Set<string>();
    for (const list of Object.values(campaigns)) {
      for (const c of list) names.add(c.campaignName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [campaigns]);

  const isFiltered = selectedCampaigns.length > 0;

  // Total EXACTO (sin doble conteo) de las campañas seleccionadas, por
  // tienda — mismo mecanismo que `CampaignsSection` del dashboard general.
  useEffect(() => {
    if (selectedCampaigns.length === 0) {
      setComboTotals(null);
      return;
    }
    let cancelled = false;
    setComboTotalsLoading(true);
    ordersService
      .getSmartSaleCampaignComboTotal(startDate, endDate, selectedCampaigns)
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
            // El backend entrega las campañas ordenadas por cantidad de
            // órdenes, no por venta — se reordena acá por venta descendente
            // para que se lea de arriba hacia abajo igual con o sin filtro.
            const list = (isFiltered
              ? (campaigns[store.id] ?? []).filter((c) => selectedCampaigns.includes(c.campaignName))
              : (campaigns[store.id] ?? [])
            )
              .slice()
              .sort((a, b) => b.sales - a.sales);
            if (list.length === 0) return null;
            const smartSaleSales = summary[store.id]?.smartSaleSales ?? 0;
            const smartSaleOrders = summary[store.id]?.smartSaleOrders ?? 0;
            const sinCampanaOrders = campaigns[store.id]?.find((c) => c.campaignName === NO_CAMPAIGN_LABEL)?.orders ?? 0;
            const withCampaignOrders = smartSaleOrders - sinCampanaOrders;
            const combo = comboTotals?.[store.id];
            const comboParticipation = combo && smartSaleSales > 0 ? (combo.revenueSales / smartSaleSales) * 100 : 0;
            return (
              <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                  {store.name}
                </p>

                {!isFiltered && (
                  <p className="mb-2 text-xs tabular-nums text-ink-faint">
                    Total SmartSale tienda (contabilizado): {formatNumber(smartSaleOrders)} ord. · {formatCOP(smartSaleSales)}
                    <br />
                    Con alguna campaña: {formatNumber(withCampaignOrders)} ord. · Sin campaña:{' '}
                    {formatNumber(sinCampanaOrders)} ord.
                  </p>
                )}

                {isFiltered && (
                  <p className="mb-2 rounded-lg bg-accent/5 px-2.5 py-2 text-xs tabular-nums text-ink">
                    {comboTotalsLoading ? (
                      <span className="text-ink-faint">Calculando total exacto…</span>
                    ) : !combo ? (
                      <span className="text-danger">
                        No se pudo calcular el total exacto (verifica que el backend esté corriendo).
                      </span>
                    ) : (
                      <>
                        Total real {selectedCampaigns.length === 1 ? 'de esta campaña' : 'de las campañas filtradas'}{' '}
                        (sin doble conteo): <span className="font-semibold">{formatCOP(combo.revenueSales)}</span> ·{' '}
                        {formatNumber(combo.revenueOrders)} ord. ·{' '}
                        <span className="font-semibold">{formatPercentage(comboParticipation)}</span> del total
                        SmartSale de la tienda ({formatCOP(smartSaleSales)})
                      </>
                    )}
                  </p>
                )}

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
