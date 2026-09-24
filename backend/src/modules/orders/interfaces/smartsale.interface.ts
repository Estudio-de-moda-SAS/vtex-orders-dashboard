/**
 * Módulo `/smartsale` — ventas del canal SmartSale (identificado por
 * `marketingData.utmiCampaign` en el detalle de orden de VTEX, ver
 * `config/smartsale.config.ts`). Sin histórico a propósito: este campo
 * nunca se guardó antes, así que solo hay datos desde que este módulo
 * empezó a sincronizar. "Ventas" = solo estados contabilizados, igual
 * criterio que el resto del dashboard.
 */

import { GrowthStatus } from './trends.interface';

export interface SmartSalePersonBreakdown {
  utmiCampaign: string;
  /** Nombre resuelto desde `config/smartsale.config.ts` — el propio `utmiCampaign` si no hay nombre configurado para ese id. */
  name: string;
  orders: number;
  sales: number;
  /** % sobre `smartSaleSales` (el total del canal, no el de la tienda). */
  percentage: number;
}

export interface SmartSaleStoreSummary {
  /** Venta total de la tienda en el rango, SIN filtrar por canal — la referencia de contexto en la card. */
  storeTotalSales: number;
  smartSaleOrders: number;
  smartSaleSales: number;
  byPerson: SmartSalePersonBreakdown[];
}

export type SmartSaleSummaryByStore = Record<string, SmartSaleStoreSummary>;

export interface SmartSaleCampaignBreakdown {
  campaignName: string;
  orders: number;
  sales: number;
}

export type SmartSaleCampaignsByStore = Record<string, SmartSaleCampaignBreakdown[]>;

/**
 * Un mes de la tendencia de ventas del canal SmartSale, combinando las 6
 * tiendas (no por tienda ni por persona — "general canal"). `growthPercent`/
 * `status` son sobre el mes ANTERIOR de la serie (`null`/'no-data' en el
 * primer mes, no hay nada con qué comparar). Sin histórico a propósito:
 * la serie arranca en el primer mes con datos reales, nunca antes.
 */
export interface SmartSaleMonthlyTrendPoint {
  /** "YYYY-MM". */
  month: string;
  orders: number;
  sales: number;
  growthPercent: number | null;
  status: GrowthStatus;
}
