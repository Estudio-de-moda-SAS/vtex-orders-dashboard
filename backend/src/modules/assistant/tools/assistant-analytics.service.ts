import { Injectable } from '@nestjs/common';

import { GaQueryService } from '../../analytics-ga/ga-query.service';
import { AssistantToolError } from '../assistant-tool.error';

export type AnalyticsBreakdownType = 'channel' | 'device' | 'landing_page' | 'user_type' | 'city' | 'product' | 'campaign';

export interface AnalyticsBreakdownResult {
  storeId: string;
  startDay: string;
  endDay: string;
  breakdown: AnalyticsBreakdownType;
  rows: unknown[];
}

/**
 * Herramienta `get_analytics` — datos de TRÁFICO de Google Analytics 4
 * (sesiones, conversión según Analytics, rebote), NO ventas confirmadas
 * de VTEX (para eso está `get_sales`). Delgada a propósito: cada caso
 * delega al método de `GaQueryService` que ya calcula ese corte (mismas
 * filas, mismos % ya calculados que usa `/analytics`) y solo extrae la
 * tienda pedida — `storeId` es obligatorio acá porque ninguna de estas
 * lecturas tiene un "combinado de las 6 tiendas" ya resuelto en el
 * código existente (a diferencia de `get_sales`/`get_smartsale_sales`).
 */
@Injectable()
export class AssistantAnalyticsService {
  constructor(private readonly gaQueryService: GaQueryService) {}

  async getAnalyticsBreakdown(storeId: string, startDay: string, endDay: string, breakdown: AnalyticsBreakdownType): Promise<AnalyticsBreakdownResult> {
    const rows = await this.loadRows(storeId, startDay, endDay, breakdown);
    return { storeId, startDay, endDay, breakdown, rows };
  }

  private async loadRows(storeId: string, startDay: string, endDay: string, breakdown: AnalyticsBreakdownType): Promise<unknown[]> {
    switch (breakdown) {
      case 'channel': {
        const response = await this.gaQueryService.getChannels(startDay, endDay, storeId);
        return response.byStore[storeId] ?? [];
      }
      case 'device': {
        const response = await this.gaQueryService.getDevices(startDay, endDay, storeId);
        return response.byStore[storeId] ?? [];
      }
      case 'landing_page': {
        const response = await this.gaQueryService.getLandingPages(startDay, endDay, storeId);
        return response.byStore[storeId] ?? [];
      }
      case 'user_type': {
        const response = await this.gaQueryService.getUserTypes(startDay, endDay, storeId);
        return response.byStore[storeId] ?? [];
      }
      case 'city': {
        const response = await this.gaQueryService.getCities(startDay, endDay, storeId);
        return response.byStore[storeId] ?? [];
      }
      case 'product': {
        const response = await this.gaQueryService.getProducts(startDay, endDay, storeId);
        return response.byStore[storeId] ?? [];
      }
      case 'campaign': {
        const response = await this.gaQueryService.getCampaigns(startDay, endDay, storeId);
        return response.byStore[storeId] ?? [];
      }
      default:
        throw new AssistantToolError(`Corte de analytics desconocido: "${breakdown}".`);
    }
  }
}
