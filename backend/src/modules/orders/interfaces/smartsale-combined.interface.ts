import { GrowthStatus } from './trends.interface';

/**
 * Un vendedor combinando VTEX (`utmiCampaign`) + POS (`nit_vendedor`) —
 * emparejados por NOMBRE (ver `SmartSaleCombinedService`, confirmado que
 * los nombres "amigables" de ambos lados coinciden exactamente para los
 * vendedores que venden por los dos canales). `0` en el lado que no
 * vendió nada en el rango, nunca `null` — igual criterio que el resto del
 * dashboard para "sin datos".
 */
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
  /** Combinando las 6 tiendas. */
  bySeller: SmartSaleCombinedPersonBreakdown[];
}

export interface SmartSaleCombinedMonthlyTrendPoint {
  month: string;
  vtexSales: number;
  posSales: number;
  /** `vtexSales + posSales`. */
  sales: number;
  orders: number;
  growthPercent: number | null;
  status: GrowthStatus;
}
