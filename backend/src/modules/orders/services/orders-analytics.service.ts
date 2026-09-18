import { Injectable, Logger } from '@nestjs/common';

import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import {
  CityBreakdown,
  GlobalSummary,
  PaymentMethodBreakdown,
  RevenueStatusBreakdown,
  StoreDashboardData,
  StoreDashboardResult,
} from '../interfaces/dashboard.interface';

const DEFAULT_CURRENCY_CODE = 'COP';

export interface StoreTotalsRow {
  orders: number;
  units: number;
  sales: number;
  discounts: number;
}
export interface ByStatusRow {
  status: string;
  orders: number;
  sales: number;
}
export interface ByPaymentRow {
  paymentMethod: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}
export interface ByCityRow {
  city: string;
  orders: number;
  sales: number;
  revenueOrders: number;
  revenueSales: number;
}

export interface StoreDataMeta {
  responseTimeMs: number;
  lastSyncedAt: string | null;
  lastSyncStatus: 'success' | 'error' | 'partial' | null;
}

/**
 * Convierte filas SQL ya agregadas (`SUM`/`GROUP BY` de
 * `DashboardQueryRepository`) en la forma `StoreDashboardData` que
 * consume el frontend. No conoce Postgres ni HTTP: solo recibe filas y
 * las resume — mismo rol que tenía antes de la migración, ahora
 * alimentado por SQL en vez de `VtexOrder[]`.
 *
 * "Ventas" = SOLO los estados que definen `revenue-status.config.ts`
 * (invoiced/payment-approved/handling(+ready-for-handling)/checking-invoice)
 * — a pedido explícito del usuario, órdenes en cualquier otro estado
 * (canceladas, etc.) NO cuentan como venta en NINGÚN widget: `totalOrders`
 * es literalmente `revenueOrders`, `statusCounts` (widget "Estados") solo
 * lista estos estados, `cityBreakdown`/`paymentMethods` usan los conteos
 * `revenue_*` en vez de los conteos totales. Esto aplica retroactivamente
 * sin reprocesar nada: `sales_daily_by_status`/`by_payment`/`by_city` ya
 * traían este desglose por estado desde el inicio de la migración.
 *
 * Nota sobre `revenueOrders`/`revenueTotalValue`/`revenueBreakdown`: se
 * derivan de `byStatus` comparando SOLO `status` (código) contra
 * `statusMatchers` — a diferencia del modelo anterior, aquí no se cuenta
 * con `statusDescription` por fila (no se persiste a ese nivel de
 * detalle), así que el fallback por `descriptionMatchers` no aplica en
 * esta capa. En la práctica esto no cambia el resultado mientras el
 * código de status de cada cuenta VTEX sea el esperado (que es el caso
 * normal); solo importaría si alguna cuenta reportara un código
 * distinto al documentado en `revenue-status.config.ts`.
 */
@Injectable()
export class OrdersAnalyticsService {
  private readonly logger = new Logger(OrdersAnalyticsService.name);
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();

  buildStoreData(
    contextId: string,
    totals: StoreTotalsRow,
    byStatus: ByStatusRow[],
    byPayment: ByPaymentRow[],
    byCity: ByCityRow[],
    meta: StoreDataMeta,
  ): StoreDashboardData {
    const { revenueOrders, revenueTotalValue, revenueBreakdown } = this.computeRevenueTotals(byStatus);

    // "Estados" (statusCounts) solo lista los estados que SÍ cuentan como
    // venta — mismo filtro que revenueOrders/revenueBreakdown, no un
    // desglose aparte de "todos los estados".
    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) {
      if (matchRevenueStatusDefinition({ status: row.status }, this.revenueStatusDefinitions)) {
        statusCounts[row.status] = row.orders;
      }
    }

    const paymentMethods = this.buildPaymentMethods(byPayment);
    const cityBreakdown = this.buildCityBreakdown(byCity, (row) => ({
      count: row.revenueOrders,
      totalValue: row.revenueSales,
    }));
    const cityRevenueBreakdown = cityBreakdown;

    // Chequeo de cordura: el subtotal filtrado nunca debería superar el
    // total sin filtrar (`sales_daily`, todas las órdenes) — si esto
    // falla hay un bug real en la clasificación de estados.
    const isConsistent = revenueOrders <= totals.orders;
    if (!isConsistent) {
      this.logger.warn(
        `[${contextId}] Inconsistencia de datos: revenueOrders (${revenueOrders}) > totalOrders sin filtrar (${totals.orders})`,
      );
    }

    return {
      totalOrders: revenueOrders,
      revenueOrders,
      revenueTotalValue,
      revenueBreakdown,
      currencyCode: DEFAULT_CURRENCY_CODE,
      statusCounts,
      paymentMethods,
      cityBreakdown,
      cityRevenueBreakdown,
      responseTimeMs: meta.responseTimeMs,
      isConsistent,
      isComplete: meta.lastSyncStatus === 'success',
      lastSyncedAt: meta.lastSyncedAt,
      lastSyncStatus: meta.lastSyncStatus,
    };
  }

  private computeRevenueTotals(byStatus: ByStatusRow[]): {
    revenueOrders: number;
    revenueTotalValue: number;
    revenueBreakdown: Record<string, RevenueStatusBreakdown>;
  } {
    const revenueBreakdown: Record<string, RevenueStatusBreakdown> = {};
    for (const definition of this.revenueStatusDefinitions) {
      revenueBreakdown[definition.key] = { orders: 0, value: 0 };
    }

    let revenueOrders = 0;
    let revenueTotalValue = 0;

    for (const row of byStatus) {
      const definition = matchRevenueStatusDefinition({ status: row.status }, this.revenueStatusDefinitions);
      if (!definition) continue;
      revenueOrders += row.orders;
      revenueTotalValue += row.sales;
      revenueBreakdown[definition.key].orders += row.orders;
      revenueBreakdown[definition.key].value += row.sales;
    }

    return { revenueOrders, revenueTotalValue, revenueBreakdown };
  }

  private buildPaymentMethods(byPayment: ByPaymentRow[]): Record<string, PaymentMethodBreakdown> {
    const totalMentions = byPayment.reduce((acc, row) => acc + row.revenueOrders, 0);
    const result: Record<string, PaymentMethodBreakdown> = {};
    for (const row of byPayment) {
      if (row.revenueOrders === 0) continue;
      result[row.paymentMethod] = {
        count: row.revenueOrders,
        percentage: totalMentions > 0 ? Number(((row.revenueOrders / totalMentions) * 100).toFixed(2)) : 0,
      };
    }
    return result;
  }

  private buildCityBreakdown(
    byCity: ByCityRow[],
    pick: (row: ByCityRow) => { count: number; totalValue: number },
  ): Record<string, CityBreakdown> {
    const picked = byCity.map((row) => ({ city: row.city, ...pick(row) }));
    const totalValue = picked.reduce((acc, row) => acc + row.totalValue, 0);

    const result: Record<string, CityBreakdown> = {};
    for (const row of picked) {
      if (row.count === 0 && row.totalValue === 0) continue;
      result[row.city] = {
        count: row.count,
        totalValue: row.totalValue,
        percentage: totalValue > 0 ? Number(((row.totalValue / totalValue) * 100).toFixed(2)) : 0,
      };
    }
    return result;
  }

  buildGlobalSummary(storeResults: StoreDashboardResult[]): GlobalSummary {
    let totalOrders = 0;
    let totalRevenueOrders = 0;
    let totalRevenueValue = 0;
    let storesWithErrors = 0;
    let storesWithIncompleteData = 0;

    const totalRevenueBreakdown: Record<string, RevenueStatusBreakdown> = {};
    for (const definition of this.revenueStatusDefinitions) {
      totalRevenueBreakdown[definition.key] = { orders: 0, value: 0 };
    }

    for (const result of storeResults) {
      if (result.success && result.data) {
        totalOrders += result.data.totalOrders;
        totalRevenueOrders += result.data.revenueOrders;
        totalRevenueValue += result.data.revenueTotalValue;
        for (const [key, breakdown] of Object.entries(result.data.revenueBreakdown)) {
          const target = totalRevenueBreakdown[key] ?? { orders: 0, value: 0 };
          target.orders += breakdown.orders;
          target.value += breakdown.value;
          totalRevenueBreakdown[key] = target;
        }
        if (!result.data.isComplete) storesWithIncompleteData += 1;
      } else {
        storesWithErrors += 1;
      }
    }

    return {
      totalOrders,
      totalRevenueOrders,
      totalRevenueValue,
      totalRevenueBreakdown,
      storesQueried: storeResults.length,
      storesWithErrors,
      storesWithIncompleteData,
    };
  }
}
