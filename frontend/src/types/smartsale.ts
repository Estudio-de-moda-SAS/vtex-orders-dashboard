/**
 * Espejo de `backend/src/modules/orders/interfaces/smartsale.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí.
 */

import { GrowthStatus } from './trends';

export interface SmartSalePersonBreakdown {
  utmiCampaign: string;
  name: string;
  orders: number;
  sales: number;
  percentage: number;
}

export interface SmartSaleStoreSummary {
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

export interface SmartSaleSegmentEntry {
  storeId: string;
  label: string;
  orders: number;
  sales: number;
}

export interface SmartSaleSegmentsResponse {
  sellers: SmartSaleSegmentEntry[];
  marketplaces: SmartSaleSegmentEntry[];
}

export interface SmartSaleMonthlyTrendPoint {
  month: string;
  orders: number;
  sales: number;
  growthPercent: number | null;
  status: GrowthStatus;
}
