import { GrowthStatus } from './trends.interface';

/**
 * Un vendedor combinando POS (`nit_vendedor`) + ERP (facturas,
 * `codigo_vendedor` 082P/168A) — emparejados por NOMBRE amigable (ver
 * `SmartSaleCombinedService`). `erpOrders` son FACTURAS y `posOrders`
 * documentos POS. `erpSales` es la venta TOTAL de ERP (incluye fletes y
 * empaque, sin desglose en el Resumen — decisión del usuario). `0` en el
 * lado que no vendió nada en el rango, nunca `null`.
 */
export interface SmartSaleCombinedPersonBreakdown {
  name: string;
  erpOrders: number;
  erpSales: number;
  posOrders: number;
  posSales: number;
  erpUnits: number;
  posUnits: number;
  /**
   * `erpSales + posSales`/`erpOrders + posOrders`/`erpUnits + posUnits`,
   * YA SUMADOS acá — confirmado en producción que dejarle esta suma al
   * modelo de Vico daba un total distinto cada vez (ver
   * `AssistantSmartSaleService`). Nunca los sumes de nuevo en otro lado,
   * usa estos campos directo.
   */
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
  /** YA SUMADOS — ver comentario de `SmartSaleCombinedPersonBreakdown`. */
  totalSales: number;
  totalOrders: number;
  totalUnits: number;
  byPerson: SmartSaleCombinedPersonBreakdown[];
}

/**
 * `category` es el nombre de POS (sin el código que antepone el ERP, ver
 * `stripErpCategoryCode`) — POS y ERP vienen del mismo ERP, así que
 * coinciden exacto. Solo líneas de producto (sin fletes/empaque).
 */
export interface SmartSaleCombinedCategoryBreakdown {
  category: string;
  erpUnits: number;
  erpSales: number;
  posUnits: number;
  posSales: number;
  /** YA SUMADOS — ver comentario de `SmartSaleCombinedPersonBreakdown`. */
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
  /** `totalErpSales + totalPosSales`, YA SUMADO. */
  totalSales: number;
  totalOrders: number;
  totalUnits: number;
  byStore: SmartSaleCombinedStoreSummary[];
  /** Combinando las 6 tiendas. */
  bySeller: SmartSaleCombinedPersonBreakdown[];
  /** Combinando las 6 tiendas y los dos canales — ver comentario de `SmartSaleCombinedCategoryBreakdown`. */
  byCategory: SmartSaleCombinedCategoryBreakdown[];
  /**
   * Primer día con facturas ERP sincronizadas (`null` si no hay ninguna) —
   * si el rango empieza antes, esos días solo traen POS (el histórico ERP
   * llegará por Excel).
   */
  erpCoverageStartDay: string | null;
}

export interface SmartSaleCombinedMonthlyTrendPoint {
  month: string;
  erpSales: number;
  posSales: number;
  /** `erpSales + posSales`. */
  sales: number;
  orders: number;
  /** `false` = mes sin ERP sincronizado (solo POS) — sin % de crecimiento. */
  erpAvailable: boolean;
  growthPercent: number | null;
  status: GrowthStatus;
}
