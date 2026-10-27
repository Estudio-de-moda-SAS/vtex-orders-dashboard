/**
 * Espejo de `backend/src/modules/orders/interfaces/smartsale-combined.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí.
 */

import { GrowthStatus } from './trends';

export interface SmartSaleCombinedPersonBreakdown {
  name: string;
  vtexOrders: number;
  vtexSales: number;
  posOrders: number;
  posSales: number;
}

export interface SmartSaleCombinedStoreSummary {
  storeId: string;
  vtexOrders: number;
  vtexSales: number;
  posOrders: number;
  posSales: number;
  byPerson: SmartSaleCombinedPersonBreakdown[];
}

export interface SmartSaleCombinedSummaryResponse {
  filters: { startDate: string; endDate: string };
  totalVtexOrders: number;
  totalVtexSales: number;
  totalPosOrders: number;
  totalPosSales: number;
  byStore: SmartSaleCombinedStoreSummary[];
  bySeller: SmartSaleCombinedPersonBreakdown[];
}

export interface SmartSaleCombinedMonthlyTrendPoint {
  month: string;
  vtexSales: number;
  posSales: number;
  sales: number;
  orders: number;
  growthPercent: number | null;
  status: GrowthStatus;
}
