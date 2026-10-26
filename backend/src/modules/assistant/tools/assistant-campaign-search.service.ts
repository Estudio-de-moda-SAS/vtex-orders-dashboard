import { Injectable } from '@nestjs/common';

import { GaQueryService } from '../../analytics-ga/ga-query.service';
import { GaCampaignBreakdownRow } from '../../analytics-ga/ga-analytics.interface';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import { ProductAnalyticsService } from '../../orders/services/product-analytics.service';

/**
 * SOLO ventas contabilizadas (lo que VTEX reporta como venta real, sin
 * canceladas) — a propósito NO expone el total bruto (`orders`/`sales`
 * de `CampaignComboTotal`, que incluye canceladas) junto al contabilizado
 * (`revenueOrders`/`revenueSales`): confirmado en producción, dejar los
 * dos campos lado a lado hacía que el modelo citara el bruto como si
 * fuera la venta real, un número que no coincidía con lo que el usuario
 * veía al buscar la misma campaña directo en VTEX.
 */
export interface CampaignStoreTotal {
  orders: number;
  sales: number;
}

export interface CampaignSearchResult {
  query: string;
  startDay: string;
  endDay: string;
  /** Campañas de DESCUENTO de VTEX (ratesAndBenefitsData) — miden venta CONTABILIZADA en pesos, sin doble conteo. */
  vtexCampaigns: {
    matchedNames: string[];
    totalsByStore: Record<string, CampaignStoreTotal>;
  };
  /** Campañas UTM de Google Analytics — miden tráfico/sesiones, sistema totalmente distinto del de arriba. */
  gaCampaigns: {
    byStore: Record<string, GaCampaignBreakdownRow[]>;
  };
}

/**
 * Herramienta `search_campaign` — busca por coincidencia de texto en DOS
 * sistemas de "campaña" completamente distintos y los trae ambos (nunca
 * se adivina cuál quiso decir el usuario, decisión ya tomada esta
 * sesión): las campañas de descuento de VTEX (lado venta, tabla
 * `sales_daily_by_discount_campaign`, totalizadas SIN doble conteo vía
 * `ProductAnalyticsService.getCampaignComboTotal`) y las campañas UTM de
 * Analytics (lado tráfico, `GaQueryService.getCampaigns`, sin tope —
 * trae TODAS las campañas del rango para que la búsqueda por texto
 * funcione sobre la lista completa). No encontrar nada en ninguno de los
 * dos NO es un error — se devuelven arreglos/objetos vacíos para que el
 * modelo pueda decir "no encontré campañas con ese nombre".
 */
@Injectable()
export class AssistantCampaignSearchService {
  constructor(
    private readonly productAnalyticsService: ProductAnalyticsService,
    private readonly dashboardQueryRepository: DashboardQueryRepository,
    private readonly gaQueryService: GaQueryService,
  ) {}

  async searchCampaigns(query: string, startDay: string, endDay: string, storeId?: string): Promise<CampaignSearchResult> {
    const [vtexCampaigns, gaCampaigns] = await Promise.all([
      this.searchVtexCampaigns(query, startDay, endDay, storeId),
      this.searchGaCampaigns(query, startDay, endDay, storeId),
    ]);
    return { query, startDay, endDay, vtexCampaigns, gaCampaigns };
  }

  private async searchVtexCampaigns(
    query: string,
    startDay: string,
    endDay: string,
    storeId?: string,
  ): Promise<{ matchedNames: string[]; totalsByStore: Record<string, CampaignStoreTotal> }> {
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'sales_daily_by_discount_campaign',
      'campaign_name',
      ['revenue_orders', 'revenue_sales'],
      startDay,
      endDay,
      storeId,
    );
    const needle = query.trim().toLowerCase();
    const matchedNames = Array.from(
      new Set(rows.map((r) => String(r.campaign_name)).filter((name) => name.toLowerCase().includes(needle))),
    );

    if (matchedNames.length === 0) {
      return { matchedNames: [], totalsByStore: {} };
    }

    const rawTotalsByStore = await this.productAnalyticsService.getCampaignComboTotal(startDay, endDay, matchedNames);
    const totalsByStore: Record<string, CampaignStoreTotal> = {};
    for (const [store, total] of Object.entries(rawTotalsByStore)) {
      if (storeId && store !== storeId) continue;
      totalsByStore[store] = { orders: total.revenueOrders, sales: total.revenueSales };
    }
    return { matchedNames, totalsByStore };
  }

  private async searchGaCampaigns(
    query: string,
    startDay: string,
    endDay: string,
    storeId?: string,
  ): Promise<{ byStore: Record<string, GaCampaignBreakdownRow[]> }> {
    const response = await this.gaQueryService.getCampaigns(startDay, endDay, storeId);
    const needle = query.trim().toLowerCase();

    const byStore: Record<string, GaCampaignBreakdownRow[]> = {};
    for (const [store, rows] of Object.entries(response.byStore)) {
      const matched = rows.filter((row) => row.campaignName.toLowerCase().includes(needle));
      if (matched.length > 0) byStore[store] = matched;
    }
    return { byStore };
  }
}
