import { GrowthStatus } from './trends';

/**
 * "Resumen" de `/smartsale`: POS + ERP (facturas de los vendedores
 * SmartSale) — ver `SmartSaleCombinedService` en el backend. `erpOrders`
 * son facturas; `posOrders`, documentos POS. `total*` ya vienen sumados
 * por el backend: úsalos tal cual.
 */
export interface SmartSaleCombinedPersonBreakdown {
  name: string;
  erpOrders: number;
  erpSales: number;
  posOrders: number;
  posSales: number;
  erpUnits: number;
  posUnits: number;
  totalSales: number;
  totalOrders: number;
  totalUnits: number;
}

export interface SmartSaleCombinedStoreSummary {
  storeId: string;
  erpOrders: number;
  erpSales: number;
  posOrders: number;
  posSales: number;
  erpUnits: number;
  posUnits: number;
  totalSales: number;
  totalOrders: number;
  totalUnits: number;
  byPerson: SmartSaleCombinedPersonBreakdown[];
}

export interface SmartSaleCombinedCategoryBreakdown {
  category: string;
  erpUnits: number;
  erpSales: number;
  posUnits: number;
  posSales: number;
  totalSales: number;
  totalUnits: number;
}

export interface SmartSaleCombinedSummaryResponse {
  filters: { startDate: string; endDate: string };
  totalErpOrders: number;
  totalErpSales: number;
  totalPosOrders: number;
  totalPosSales: number;
  totalErpUnits: number;
  totalPosUnits: number;
  totalSales: number;
  totalOrders: number;
  totalUnits: number;
  byStore: SmartSaleCombinedStoreSummary[];
  bySeller: SmartSaleCombinedPersonBreakdown[];
  byCategory: SmartSaleCombinedCategoryBreakdown[];
  /** Primer día con facturas ERP sincronizadas (`null` si no hay) — antes de ese día solo hay POS. */
  erpCoverageStartDay: string | null;
}

export interface SmartSaleCombinedMonthlyTrendPoint {
  month: string;
  erpSales: number;
  posSales: number;
  sales: number;
  orders: number;
  /** `false` = mes sin ERP sincronizado (solo POS) — sin % de crecimiento. */
  erpAvailable: boolean;
  growthPercent: number | null;
  status: GrowthStatus;
}
