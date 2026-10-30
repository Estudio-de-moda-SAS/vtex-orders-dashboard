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
  vtexUnits: number;
  posUnits: number;
  /** `vtexSales + posSales`/`vtexOrders + posOrders`/`vtexUnits + posUnits`, ya sumados en el backend. */
  totalSales: number;
  totalOrders: number;
  totalUnits: number;
}

export interface SmartSaleCombinedStoreSummary {
  storeId: string;
  vtexOrders: number;
  vtexSales: number;
  posOrders: number;
  posSales: number;
  vtexUnits: number;
  posUnits: number;
  totalSales: number;
  totalOrders: number;
  totalUnits: number;
  byPerson: SmartSaleCombinedPersonBreakdown[];
}

/** `category` es el nombre canónico de VTEX cuando hubo equivalencia, o el nombre crudo de POS cuando no la hubo (ver `category-normalize.util.ts` en el backend). */
export interface SmartSaleCombinedCategoryBreakdown {
  category: string;
  vtexUnits: number;
  vtexSales: number;
  posUnits: number;
  posSales: number;
  /** `vtexSales + posSales`/`vtexUnits + posUnits`, ya sumados en el backend. */
  totalSales: number;
  totalUnits: number;
}

export interface SmartSaleCombinedSummaryResponse {
  filters: { startDate: string; endDate: string };
  totalVtexOrders: number;
  totalVtexSales: number;
  totalPosOrders: number;
  totalPosSales: number;
  totalVtexUnits: number;
  totalPosUnits: number;
  byStore: SmartSaleCombinedStoreSummary[];
  bySeller: SmartSaleCombinedPersonBreakdown[];
  byCategory: SmartSaleCombinedCategoryBreakdown[];
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
