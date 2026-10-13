'use client';

import { useMemo, useState } from 'react';

import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { CampaignFilter } from './CampaignFilter';
import { ChartPanel } from './OrdersByStoreChart';

export interface GaCampaignsTableRow {
  campaignName: string;
  sourceMedium: string;
  sessions: number;
  sessionsPercent: number;
  addToCarts: number;
  addToCartsPercent: number;
  checkouts: number;
  checkoutsPercent: number;
  purchases: number;
  purchasesPercent: number;
  gaRevenue: number;
  revenuePercent: number;
  conversionPercent: number;
}

interface GaCampaignsTableProps {
  rows: GaCampaignsTableRow[];
  totalSessions: number;
}

function cell(value: string, percent: number): string {
  return `${value} (${formatPercentage(percent)})`;
}

/**
 * Desglose por campaña (UTM) + fuente/medio — a diferencia de
 * `GaBreakdownTable`, trae un buscador (`CampaignFilter`, mismo
 * componente que SmartSale/Descuentos) porque `rows` viene SIN tope ni
 * agrupación "(otros)": cada campaña real queda con su propio nombre, así
 * que se puede escribir ej. "bazar" y encontrar todo lo relacionado. Sin
 * filtro, se muestran todas — las campañas son deliberadas (alguien las
 * crea por cada promo/envío), no una lista de cardinalidad descontrolada
 * como landing pages/ciudades/productos.
 */
export function GaCampaignsTable({ rows, totalSessions }: GaCampaignsTableProps) {
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);

  const availableCampaigns = useMemo(
    () => Array.from(new Set(rows.map((r) => r.campaignName))).sort((a, b) => a.localeCompare(b, 'es')),
    [rows],
  );

  const isFiltered = selectedCampaigns.length > 0;
  const visibleRows = isFiltered ? rows.filter((r) => selectedCampaigns.includes(r.campaignName)) : rows;

  return (
    <ChartPanel title="Campañas (UTM)">
      <p className="-mt-1 mb-3 text-xs text-ink-faint">
        Total de sesiones de la tienda en el rango:{' '}
        <span className="font-medium text-ink-muted">{formatNumber(totalSessions)}</span>. La mayoría del tráfico no
        tiene campaña asociada (navegación orgánica/directa) y aparece como &quot;(not set)&quot; — es tráfico real,
        no un error. Busca por nombre para encontrar una campaña puntual (ej. &quot;bazar&quot;).
      </p>

      <div className="mb-4">
        <CampaignFilter availableCampaigns={availableCampaigns} selectedCampaigns={selectedCampaigns} onChange={setSelectedCampaigns} />
      </div>

      {visibleRows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">Sin datos para mostrar.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface-panel px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Campaña
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">Fuente / medio</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Sesiones</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Carritos</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Checkouts</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Compras</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">Ingresos</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Conversión<span className="block normal-case text-[10px] font-normal text-ink-faint">(según Analytics)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={`${row.campaignName}::${row.sourceMedium}`} className="border-t border-surface-border">
                  <td
                    className="sticky left-0 max-w-[280px] truncate bg-surface-panel px-3 py-2 font-medium text-ink"
                    title={row.campaignName}
                  >
                    {row.campaignName}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-ink-muted" title={row.sourceMedium}>
                    {row.sourceMedium}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">{cell(formatNumber(row.sessions), row.sessionsPercent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{cell(formatNumber(row.addToCarts), row.addToCartsPercent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{cell(formatNumber(row.checkouts), row.checkoutsPercent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{cell(formatNumber(row.purchases), row.purchasesPercent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{cell(formatCOP(row.gaRevenue), row.revenuePercent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{formatPercentage(row.conversionPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartPanel>
  );
}
