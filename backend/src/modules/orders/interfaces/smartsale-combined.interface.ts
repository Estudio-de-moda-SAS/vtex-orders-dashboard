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
  /**
   * `vtexSales + posSales`/`vtexOrders + posOrders`, YA SUMADOS acá —
   * confirmado en producción que dejarle esta suma al modelo de Vico daba
   * un total distinto cada vez (ver `AssistantSmartSaleService`). Nunca
   * los sumes de nuevo en otro lado, usa estos dos campos directo.
   */
  totalSales: number;
  totalOrders: number;
}

export interface SmartSaleCombinedStoreSummary {
  storeId: string;
  vtexOrders: number;
  vtexSales: number;
  posOrders: number;
  posSales: number;
  /** `vtexSales + posSales`/`vtexOrders + posOrders`, YA SUMADOS — ver comentario de `SmartSaleCombinedPersonBreakdown`. */
  totalSales: number;
  totalOrders: number;
  byPerson: SmartSaleCombinedPersonBreakdown[];
}

/**
 * `category` es el nombre CANÓNICO de VTEX cuando hay equivalencia
 * encontrada (`matchPosCategoryToVtex`); si una categoría de POS no tiene
 * equivalencia clara (ver `category-normalize.util.ts`), aparece con su
 * propio nombre crudo de POS y `vtexUnits`/`vtexSales` en 0 — nunca se
 * fuerza a una categoría VTEX solo para no dejarla fuera.
 */
export interface SmartSaleCombinedCategoryBreakdown {
  category: string;
  vtexUnits: number;
  vtexSales: number;
  posUnits: number;
  posSales: number;
  /** `vtexSales + posSales`/`vtexUnits + posUnits`, YA SUMADOS — ver comentario de `SmartSaleCombinedPersonBreakdown`. */
  totalSales: number;
  totalUnits: number;
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
  /** Combinando las 6 tiendas y los dos canales — ver comentario de `SmartSaleCombinedCategoryBreakdown`. */
  byCategory: SmartSaleCombinedCategoryBreakdown[];
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
