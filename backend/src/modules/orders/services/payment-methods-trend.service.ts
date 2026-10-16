import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, subtractCalendarYear, toDayBucketColombia } from '../../../common/utils/date-range.util';
import { buildParticipationSeries } from '../../../common/utils/participation-growth.util';
import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getParticipationGrowthThresholds } from '../../../config/growth-thresholds.config';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import { PaymentMethodMonthlyPoint, PaymentMethodsTrendResponse } from '../interfaces/payment-methods-trend.interface';

/**
 * Participación de cada método de pago mes a mes — TODAS las tiendas
 * combinadas (a diferencia de `/pilatos`, que es exclusivo de una
 * tienda). Mismo patrón que `PilatosMixService`: lee `sales_daily_by_payment`
 * (`revenue_sales`, ya filtrado a solo ventas contabilizadas desde que se
 * calcula) para el desglose por método, y `sales_daily_by_status` para el
 * total contabilizado de cada mes (denominador del % de participación).
 */
const OTHER_METHODS_LABEL = 'Otros métodos';
/**
 * Cuántos métodos de pago se muestran como serie propia (el resto se
 * agrupa en "Otros métodos") — hay ~30 valores distintos de
 * `payment_method` en producción, la mayoría placeholders de marketplace
 * ("Assumed value by affiliate X") con <1% de participación cada uno; sin
 * este tope el gráfico de líneas queda ilegible. Confirmado con datos
 * reales: los 9 principales ya cubren >96% de la venta del año.
 */
const TOP_METHODS_LIMIT = 9;

@Injectable()
export class PaymentMethodsTrendService {
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();
  private readonly participationThresholds = getParticipationGrowthThresholds();

  constructor(private readonly dashboardQueryRepository: DashboardQueryRepository) {}

  /** `storeId` opcional: sin él, todas las tiendas combinadas (ver `PaymentMethodsTrendQueryDto`). */
  async getTrend(rawStartDate: string, rawEndDate: string, storeId?: string): Promise<PaymentMethodsTrendResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(rawStartDate));
    const endDay = toDayBucketColombia(normalizeEndDate(rawEndDate));
    // Se trae también el año anterior completo (mismo día en adelante) en UNA sola consulta — es la
    // referencia para "vs. año pasado" (ver `buildParticipationSeries`). Esos meses NUNCA aparecen
    // como columna propia en `points`, solo se usan para comparar.
    const queryStartDay = subtractCalendarYear(startDay);
    const startYearMonth = startDay.slice(0, 7);
    const endYearMonth = endDay.slice(0, 7);

    const [statusRows, paymentRows] = await Promise.all([
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_status',
        ['year', 'month', 'status'],
        ['sales'],
        queryStartDay,
        endDay,
        storeId,
      ),
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_payment',
        ['year', 'month', 'payment_method'],
        ['revenue_sales'],
        queryStartDay,
        endDay,
        storeId,
      ),
    ]);

    const totalByMonth = new Map<string, number>();
    for (const row of statusRows) {
      if (!matchRevenueStatusDefinition({ status: String(row.status) }, this.revenueStatusDefinitions)) continue;
      const month = monthKey(row.year, row.month);
      totalByMonth.set(month, (totalByMonth.get(month) ?? 0) + Number(row.sales));
    }

    const { byMonth, names } = this.buildBreakdown(paymentRows, startYearMonth, endYearMonth);

    const displayMonths = Array.from(totalByMonth.keys())
      .filter((m) => m >= startYearMonth && m <= endYearMonth)
      .sort();
    const points: PaymentMethodMonthlyPoint[] = displayMonths.map((month) => ({
      month,
      total: totalByMonth.get(month) ?? 0,
      breakdown: byMonth.get(month) ?? {},
    }));

    return {
      points,
      methodNames: names,
      participation: buildParticipationSeries(names, points, totalByMonth, byMonth, this.participationThresholds),
    };
  }

  /**
   * Agrupa `rows` (ya cubriendo año actual + año anterior) por mes, SIN
   * filtrar por rango — eso lo hace `getTrend` al armar `points`. Solo los
   * `TOP_METHODS_LIMIT` métodos con mayor venta DENTRO DEL RANGO A MOSTRAR
   * (`startYearMonth`..`endYearMonth`, nunca contando el año anterior)
   * quedan como serie propia — el resto se consolida en
   * `OTHER_METHODS_LABEL` (ver nota en la constante) en TODOS los meses,
   * incluyendo los del año anterior usados solo como referencia.
   */
  private buildBreakdown(
    rows: Record<string, string | number>[],
    startYearMonth: string,
    endYearMonth: string,
  ): { byMonth: Map<string, Record<string, number>>; names: string[] } {
    const totalByNameDisplay = new Map<string, number>();
    const byMonthRaw = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const month = monthKey(row.year, row.month);
      const name = String(row.payment_method);
      const value = Number(row.revenue_sales);
      if (month >= startYearMonth && month <= endYearMonth) {
        totalByNameDisplay.set(name, (totalByNameDisplay.get(name) ?? 0) + value);
      }
      const bucket = byMonthRaw.get(month) ?? {};
      bucket[name] = (bucket[name] ?? 0) + value;
      byMonthRaw.set(month, bucket);
    }

    const topNames = Array.from(totalByNameDisplay.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_METHODS_LIMIT)
      .map(([name]) => name);
    const topNamesSet = new Set(topNames);
    const hasOthers = totalByNameDisplay.size > topNames.length;

    const byMonth = new Map<string, Record<string, number>>();
    for (const [month, bucket] of byMonthRaw.entries()) {
      const consolidated: Record<string, number> = {};
      for (const [name, value] of Object.entries(bucket)) {
        const key = topNamesSet.has(name) ? name : OTHER_METHODS_LABEL;
        consolidated[key] = (consolidated[key] ?? 0) + value;
      }
      byMonth.set(month, consolidated);
    }

    const names = hasOthers ? [...topNames, OTHER_METHODS_LABEL] : topNames;
    return { byMonth, names };
  }
}

function monthKey(year: string | number, month: string | number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
