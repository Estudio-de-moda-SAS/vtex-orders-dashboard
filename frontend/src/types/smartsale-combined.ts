import { ErpMarginFigures } from './erp-sales';
import { GrowthStatus } from './trends';

/** Tipo de producto POS + ERP ("208 - TENIS"); `total*` ya sumados. */
export interface SmartSaleCombinedTipo {
  tipo: string;
  posUnits: number;
  posSales: number;
  erpUnits: number;
  erpSales: number;
  totalSales: number;
  totalUnits: number;
}

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
  /** Margen y utilidad por marca, POS + ERP (sin IVA, sin notas crédito). `channel.marginPercent` es el ponderado. */
  margin: {
    byStore: (ErpMarginFigures & { storeId: string })[];
    channel: ErpMarginFigures & { simpleAverageMarginPercent: number | null; storesInSimpleAverage: number };
    freight: { subtotal: number; cost: number; utility: number };
    packaging: { subtotal: number; cost: number; utility: number };
  };
  /** Documentos POS del rango vs. cuántos ya tienen margen (están en la consulta de facturas). */
  posMarginCoverage: { posDocuments: number; posDocumentsWithMargin: number };
  byTipo: SmartSaleCombinedTipo[];
  byStoreTipo: { storeId: string; byTipo: SmartSaleCombinedTipo[] }[];
  /** Notas crédito POS (NPE) + ERP (NVF), YA RESTADAS en las ventas — por tienda y total (valores negativos). */
  creditNotes: {
    byStore: { storeId: string; posCount: number; posValue: number; erpCount: number; erpValue: number; totalCount: number; totalValue: number }[];
    total: { posCount: number; posValue: number; erpCount: number; erpValue: number; totalCount: number; totalValue: number };
  };
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
