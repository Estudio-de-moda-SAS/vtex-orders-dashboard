import { Injectable } from '@nestjs/common';

import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getGrowthThresholds } from '../../../config/growth-thresholds.config';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { getStoresConfig } from '../../../config/stores.config';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import { GrowthStatus, StoreGrowth, TrendMonthPoint, TrendsResponse } from '../interfaces/trends.interface';

/**
 * Antes de esta fecha no existe NINGÚN historial en ninguna tienda (el
 * import de Excel nunca cubrió enero-junio 2025 — confirmado
 * directamente contra Supabase). Cualquier mes de comparación anterior a
 * esto se marca `comparisonAvailable: false` en vez de comparar contra
 * un cero falso.
 */
const EARLIEST_SUPPORTED_DATE = '2025-07-01';

@Injectable()
export class TrendsService {
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();
  private readonly growthThresholds = getGrowthThresholds();
  private readonly stores = getStoresConfig();

  constructor(private readonly dashboardQueryRepository: DashboardQueryRepository) {}

  /**
   * `year`/`startMonth`/`endMonth` definen el rango ACTUAL (`startMonth`
   * a `endMonth` de `year` — por defecto todo el año corrido, pero
   * `startMonth === endMonth` aísla un solo mes puntual); el rango de
   * COMPARACIÓN es automáticamente el mismo tramo del año anterior.
   * "Ventas" = solo estados contabilizados (mismo criterio que el resto
   * del dashboard).
   */
  async getTrends(year: number, startMonth: number, endMonth: number, storeId?: string): Promise<TrendsResponse> {
    const priorYear = year - 1;
    const currentStart = firstDayOfMonth(year, startMonth);
    const currentEnd = lastDayOfMonth(year, endMonth);
    const comparisonStart = firstDayOfMonth(priorYear, startMonth);
    const comparisonEnd = lastDayOfMonth(priorYear, endMonth);

    // Una sola consulta cubre AMBOS años — cada fila se clasifica por su
    // propio year/month al procesarla, sin necesidad de una segunda ida
    // a la base de datos.
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'sales_daily_by_status',
      ['year', 'month', 'status'],
      ['orders', 'sales'],
      comparisonStart,
      currentEnd,
      storeId,
    );

    const byStoreYearMonth = new Map<string, { orders: number; sales: number }>();
    for (const row of rows) {
      if (!matchRevenueStatusDefinition({ status: String(row.status) }, this.revenueStatusDefinitions)) continue;
      const key = `${row.store_id}::${row.year}::${row.month}`;
      const acc = byStoreYearMonth.get(key) ?? { orders: 0, sales: 0 };
      acc.orders += Number(row.orders);
      acc.sales += Number(row.sales);
      byStoreYearMonth.set(key, acc);
    }

    const monthlyStoreIds = storeId ? [storeId] : this.stores.map((s) => s.id);
    const monthly = this.buildMonthly(byStoreYearMonth, monthlyStoreIds, year, priorYear, startMonth, endMonth);
    const storeGrowth = this.stores.map((store) =>
      this.computeGrowth(byStoreYearMonth, [store.id], store.id, store.name, year, priorYear, startMonth, endMonth),
    );
    // Mismo cálculo que cada fila de `storeGrowth`, pero sumando las 6
    // tiendas juntas — el crecimiento real del negocio completo, no solo
    // por tienda. `overallGrowth.storeId` es un sentinel ('all'), nunca
    // el id de una tienda real.
    const overallGrowth = this.computeGrowth(
      byStoreYearMonth,
      this.stores.map((s) => s.id),
      'all',
      'Todas las tiendas',
      year,
      priorYear,
      startMonth,
      endMonth,
    );

    return {
      currentRange: { startDate: currentStart, endDate: currentEnd },
      comparisonRange: { startDate: comparisonStart, endDate: comparisonEnd },
      monthly,
      storeGrowth,
      overallGrowth,
    };
  }

  /** Línea de tendencia mensual — suma entre las tiendas pedidas (una sola si `storeId`, las 6 si no). */
  private buildMonthly(
    byStoreYearMonth: Map<string, { orders: number; sales: number }>,
    storeIds: string[],
    year: number,
    priorYear: number,
    startMonth: number,
    endMonth: number,
  ): TrendMonthPoint[] {
    const monthly: TrendMonthPoint[] = [];
    for (let month = startMonth; month <= endMonth; month += 1) {
      const current = this.sumMonths(byStoreYearMonth, storeIds, year, month, month);
      const comparisonAvailable = isMonthAvailable(priorYear, month);
      const prior = comparisonAvailable ? this.sumMonths(byStoreYearMonth, storeIds, priorYear, month, month) : null;

      monthly.push({
        month: `${year}-${String(month).padStart(2, '0')}`,
        currentSales: current.sales,
        currentOrders: current.orders,
        priorSales: prior?.sales ?? null,
        priorOrders: prior?.orders ?? null,
        comparisonAvailable,
      });
    }
    return monthly;
  }

  /**
   * Crecimiento año contra año para un conjunto de tiendas (una sola
   * para el ranking por tienda, o las 6 juntas para `overallGrowth`) —
   * agregando todo el rango (`startMonth`-`endMonth`). Compartido entre
   * `storeGrowth` y `overallGrowth` para no duplicar la regla de negocio
   * en dos lugares.
   */
  private computeGrowth(
    byStoreYearMonth: Map<string, { orders: number; sales: number }>,
    storeIds: string[],
    id: string,
    name: string,
    year: number,
    priorYear: number,
    startMonth: number,
    endMonth: number,
  ): StoreGrowth {
    const totalMonthsRequested = endMonth - startMonth + 1;

    // Total real del rango pedido completo — SIEMPRE se muestra, sin
    // importar si hay comparación disponible o no (es informativo por sí
    // solo, igual que en el resto del dashboard).
    const fullCurrent = this.sumMonths(byStoreYearMonth, storeIds, year, startMonth, endMonth);

    // Para el % de crecimiento, current/prior deben sumar EXACTAMENTE
    // los mismos meses en ambos lados — si se comparara el rango
    // completo del año actual contra solo los meses disponibles del año
    // anterior (cuando la cobertura es "partial"), el % saldría
    // absurdamente inflado. `comparableMonths` cuenta cuántos meses
    // entraron acá.
    let comparableCurrentSales = 0;
    let comparablePriorSales = 0;
    let comparableCurrentOrders = 0;
    let comparablePriorOrders = 0;
    let comparableMonths = 0;

    for (let month = startMonth; month <= endMonth; month += 1) {
      if (isMonthAvailable(priorYear, month)) {
        comparableMonths += 1;
        const cur = this.sumMonths(byStoreYearMonth, storeIds, year, month, month);
        const prior = this.sumMonths(byStoreYearMonth, storeIds, priorYear, month, month);
        comparableCurrentSales += cur.sales;
        comparableCurrentOrders += cur.orders;
        comparablePriorSales += prior.sales;
        comparablePriorOrders += prior.orders;
      }
    }

    const comparisonCoverage: StoreGrowth['comparisonCoverage'] =
      comparableMonths === 0 ? 'none' : comparableMonths === totalMonthsRequested ? 'full' : 'partial';

    let growthPercent: number | null = null;
    let status: GrowthStatus = 'no-data';

    if (comparisonCoverage !== 'none') {
      if (comparablePriorSales === 0) {
        status = comparableCurrentSales > 0 ? 'new' : 'no-data';
      } else {
        growthPercent = ((comparableCurrentSales - comparablePriorSales) / comparablePriorSales) * 100;
        if (growthPercent >= this.growthThresholds.greenMinPercent) status = 'green';
        else if (growthPercent <= this.growthThresholds.redMaxPercent) status = 'red';
        else status = 'yellow';
      }
    }

    return {
      storeId: id,
      storeName: name,
      fullRangeCurrentSales: fullCurrent.sales,
      fullRangeCurrentOrders: fullCurrent.orders,
      currentSales: comparableCurrentSales,
      currentOrders: comparableCurrentOrders,
      priorSales: comparisonCoverage !== 'none' ? comparablePriorSales : null,
      priorOrders: comparisonCoverage !== 'none' ? comparablePriorOrders : null,
      comparableMonths,
      growthPercent,
      status,
      comparisonCoverage,
    };
  }

  /** Suma `orders`/`sales` para una lista de tiendas, entre `fromMonth` y `toMonth` (inclusive) de `year`. */
  private sumMonths(
    byStoreYearMonth: Map<string, { orders: number; sales: number }>,
    storeIds: string[],
    year: number,
    fromMonth: number,
    toMonth: number,
  ): { orders: number; sales: number } {
    let orders = 0;
    let sales = 0;
    for (const sid of storeIds) {
      for (let m = fromMonth; m <= toMonth; m += 1) {
        const acc = byStoreYearMonth.get(`${sid}::${year}::${m}`);
        if (acc) {
          orders += acc.orders;
          sales += acc.sales;
        }
      }
    }
    return { orders, sales };
  }
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function lastDayOfMonth(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function isMonthAvailable(year: number, month: number): boolean {
  return firstDayOfMonth(year, month) >= EARLIEST_SUPPORTED_DATE;
}
