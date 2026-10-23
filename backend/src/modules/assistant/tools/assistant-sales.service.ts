import { Injectable } from '@nestjs/common';

import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import { AssistantToolError } from '../assistant-tool.error';

export type SalesBreakdownType =
  | 'status'
  | 'payment'
  | 'city'
  | 'category'
  | 'brand'
  | 'collection'
  | 'discount_bucket'
  | 'seller'
  | 'marketplace';

export interface SalesBreakdownRow {
  label: string;
  sales: number;
  /** `null` cuando el corte no trae conteo de órdenes (category/collection/discount_bucket/brand). */
  orders: number | null;
  /** Solo presente en los cortes que miden unidades en vez de órdenes. */
  units?: number;
}

export interface SalesBreakdownResult {
  storeId: string;
  startDay: string;
  endDay: string;
  breakdown: SalesBreakdownType;
  rows: SalesBreakdownRow[];
  totalSales: number;
  totalOrders: number | null;
  /** Avisos sobre limitaciones conocidas del corte pedido — ver comentarios de cada caso abajo. */
  warnings: string[];
}

const PILATOS_STORE_ID = 'pilatos';
const PILATOS_ONLY_BREAKDOWNS: SalesBreakdownType[] = ['seller', 'marketplace'];

/**
 * Herramienta `get_sales` del asistente — un solo método para los 9 cortes
 * de venta que YA existen en el dashboard (`sales_daily_by_*`), devueltos
 * siempre en la misma forma plana (`rows`/`totalSales`/`totalOrders`) para
 * que el modelo nunca tenga que sumar ni calcular nada él mismo. No
 * reimplementa los servicios de UI (`ProductAnalyticsService`,
 * `PilatosMixService`, etc. — esos arman series mensuales, highlights o
 * cruces con otra dimensión, un shape distinto); lee las MISMAS tablas con
 * `DashboardQueryRepository.queryGrouped`/`queryGroupedMulti`.
 */
@Injectable()
export class AssistantSalesService {
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();

  constructor(private readonly dashboardQueryRepository: DashboardQueryRepository) {}

  async getSalesBreakdown(
    storeId: string,
    startDay: string,
    endDay: string,
    breakdown: SalesBreakdownType,
  ): Promise<SalesBreakdownResult> {
    if (PILATOS_ONLY_BREAKDOWNS.includes(breakdown) && storeId !== PILATOS_STORE_ID) {
      throw new AssistantToolError(
        `El corte "${breakdown}" solo existe para Pilatos (es la única tienda con sellers/marketplaces registrados) — "${storeId}" no lo tiene.`,
      );
    }

    const { rows, warnings } = await this.loadRows(storeId, startDay, endDay, breakdown);
    const totalSales = rows.reduce((acc, r) => acc + r.sales, 0);
    const hasOrders = rows.some((r) => r.orders !== null);
    const totalOrders = hasOrders ? rows.reduce((acc, r) => acc + (r.orders ?? 0), 0) : null;

    return { storeId, startDay, endDay, breakdown, rows, totalSales, totalOrders, warnings };
  }

  private async loadRows(
    storeId: string,
    startDay: string,
    endDay: string,
    breakdown: SalesBreakdownType,
  ): Promise<{ rows: SalesBreakdownRow[]; warnings: string[] }> {
    switch (breakdown) {
      case 'status':
        return { rows: await this.loadStatus(storeId, startDay, endDay), warnings: [] };
      case 'payment':
        return { rows: await this.loadSimple(storeId, startDay, endDay, 'sales_daily_by_payment', 'payment_method'), warnings: [] };
      case 'city':
        return { rows: await this.loadSimple(storeId, startDay, endDay, 'sales_daily_by_city', 'city'), warnings: [] };
      case 'seller':
        return { rows: await this.loadSimple(storeId, startDay, endDay, 'sales_daily_by_seller', 'seller_name'), warnings: [] };
      case 'marketplace':
        return { rows: await this.loadSimple(storeId, startDay, endDay, 'sales_daily_by_marketplace', 'marketplace_name'), warnings: [] };
      case 'category':
        return { rows: await this.loadByUnits(storeId, startDay, endDay, 'sales_daily_by_category', 'category_name'), warnings: [] };
      case 'collection':
        return { rows: await this.loadByUnits(storeId, startDay, endDay, 'sales_daily_by_collection', 'collection_name'), warnings: [] };
      case 'discount_bucket':
        return {
          rows: await this.loadDiscountBucket(storeId, startDay, endDay),
          warnings: [],
        };
      case 'brand':
        return {
          rows: await this.loadBrand(storeId, startDay, endDay),
          warnings: [
            'Las ventas por marca NO están filtradas a estados contabilizados (pueden incluir órdenes canceladas) — esta tabla no guarda el estado por fila. Trátalo como una aproximación.',
          ],
        };
    }
  }

  /** `sales_daily_by_status` trae TODOS los estados — hay que filtrar en código a los que cuentan como venta. */
  private async loadStatus(storeId: string, startDay: string, endDay: string): Promise<SalesBreakdownRow[]> {
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'sales_daily_by_status',
      'status',
      ['orders', 'sales'],
      startDay,
      endDay,
      storeId,
    );
    const byLabel = new Map<string, { orders: number; sales: number }>();
    for (const row of rows) {
      const definition = matchRevenueStatusDefinition({ status: String(row.status) }, this.revenueStatusDefinitions);
      if (!definition) continue;
      const entry = byLabel.get(definition.label) ?? { orders: 0, sales: 0 };
      entry.orders += Number(row.orders);
      entry.sales += Number(row.sales);
      byLabel.set(definition.label, entry);
    }
    return Array.from(byLabel.entries()).map(([label, v]) => ({ label, orders: v.orders, sales: v.sales }));
  }

  /** Tablas que ya traen `revenue_orders`/`revenue_sales` pre-filtrados a contabilizadas — sin re-filtrar acá. */
  private async loadSimple(storeId: string, startDay: string, endDay: string, table: string, dimensionColumn: string): Promise<SalesBreakdownRow[]> {
    const rows = await this.dashboardQueryRepository.queryGrouped(
      table,
      dimensionColumn,
      ['revenue_orders', 'revenue_sales'],
      startDay,
      endDay,
      storeId,
    );
    return rows
      .map((row) => ({
        label: String(row[dimensionColumn]),
        orders: Number(row.revenue_orders),
        sales: Number(row.revenue_sales),
      }))
      .filter((r) => r.orders > 0 || r.sales > 0);
  }

  /** Category/colección: solo traen unidades+ventas contabilizadas (`revenue_units`/`revenue_sales`), sin conteo de órdenes. */
  private async loadByUnits(storeId: string, startDay: string, endDay: string, table: string, dimensionColumn: string): Promise<SalesBreakdownRow[]> {
    const rows = await this.dashboardQueryRepository.queryGrouped(
      table,
      dimensionColumn,
      ['revenue_units', 'revenue_sales'],
      startDay,
      endDay,
      storeId,
    );
    return rows
      .map((row) => ({
        label: String(row[dimensionColumn]),
        orders: null,
        units: Number(row.revenue_units),
        sales: Number(row.revenue_sales),
      }))
      .filter((r) => (r.units ?? 0) > 0 || r.sales > 0);
  }

  /** `units` acá SÍ incluye todas las órdenes (no filtrado) — solo `revenue_sales` está contabilizado. Mismo criterio que `ProductAnalyticsService`. */
  private async loadDiscountBucket(storeId: string, startDay: string, endDay: string): Promise<SalesBreakdownRow[]> {
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'sales_daily_by_discount_bucket',
      'discount_percentage',
      ['units', 'revenue_sales'],
      startDay,
      endDay,
      storeId,
    );
    return rows
      .map((row) => ({
        label: `${Number(row.discount_percentage)}%`,
        orders: null,
        units: Number(row.units),
        sales: Number(row.revenue_sales),
      }))
      .filter((r) => (r.units ?? 0) > 0 || r.sales > 0);
  }

  /**
   * No existe un corte plano "por marca" — se arma sumando
   * `sales_daily_by_category_brand` (cruce categoría×marca) agrupado solo
   * por `brand_name`, ignorando `category_name`. Esta tabla no distingue
   * por estado de la orden (ver `daily-aggregator.ts`), de ahí el warning
   * que agrega `loadRows`.
   */
  private async loadBrand(storeId: string, startDay: string, endDay: string): Promise<SalesBreakdownRow[]> {
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'sales_daily_by_category_brand',
      ['category_name', 'brand_name'],
      ['units', 'sales'],
      startDay,
      endDay,
      storeId,
    );
    const byBrand = new Map<string, { units: number; sales: number }>();
    for (const row of rows) {
      const brand = String(row.brand_name);
      const entry = byBrand.get(brand) ?? { units: 0, sales: 0 };
      entry.units += Number(row.units);
      entry.sales += Number(row.sales);
      byBrand.set(brand, entry);
    }
    return Array.from(byBrand.entries()).map(([label, v]) => ({ label, orders: null, units: v.units, sales: v.sales }));
  }
}
