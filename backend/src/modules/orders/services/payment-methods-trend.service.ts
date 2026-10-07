import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia } from '../../../common/utils/date-range.util';
import { classifyParticipationGrowth } from '../../../common/utils/participation-growth.util';
import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getParticipationGrowthThresholds } from '../../../config/growth-thresholds.config';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import {
  PaymentMethodMonthlyPoint,
  PaymentMethodsTrendResponse,
  SeriesParticipation,
} from '../interfaces/payment-methods-trend.interface';

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

    const [statusRows, paymentRows] = await Promise.all([
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_status',
        ['year', 'month', 'status'],
        ['sales'],
        startDay,
        endDay,
        storeId,
      ),
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_payment',
        ['year', 'month', 'payment_method'],
        ['revenue_sales'],
        startDay,
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

    const { points, names } = this.buildPoints(paymentRows, totalByMonth);

    return {
      points,
      methodNames: names,
      participation: this.buildParticipation(names, points),
    };
  }

  /** Igual criterio que `PilatosMixService.buildParticipation` — ver esa clase para el detalle de casos borde. */
  private buildParticipation(names: string[], points: PaymentMethodMonthlyPoint[]): SeriesParticipation[] {
    return names.map((name) => {
      let priorParticipation: number | null = null;
      let everHadParticipation = false;
      const seriesPoints = points.map((point, index) => {
        const value = point.breakdown[name] ?? 0;
        const participationPercent = point.total > 0 ? (value / point.total) * 100 : 0;
        const { growthPercent, status } = classifyParticipationGrowth(
          participationPercent,
          index === 0 ? null : priorParticipation,
          everHadParticipation,
          this.participationThresholds,
        );
        priorParticipation = participationPercent;
        if (participationPercent > 0) everHadParticipation = true;
        return { month: point.month, participationPercent, salesValue: value, total: point.total, growthPercent, status };
      });
      return { name, points: seriesPoints };
    });
  }

  /**
   * Arma los puntos mensuales: cada mes con datos en `totalByMonth`
   * aparece, incluso si algún método no tuvo venta ese mes. Solo los
   * `TOP_METHODS_LIMIT` métodos con mayor venta en TODO el rango quedan
   * como serie propia — el resto se consolida en `OTHER_METHODS_LABEL`
   * (ver nota en la constante), nunca se descarta.
   */
  private buildPoints(
    rows: Record<string, string | number>[],
    totalByMonth: Map<string, number>,
  ): { points: PaymentMethodMonthlyPoint[]; names: string[] } {
    const totalByName = new Map<string, number>();
    const byMonthRaw = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const month = monthKey(row.year, row.month);
      const name = String(row.payment_method);
      const value = Number(row.revenue_sales);
      totalByName.set(name, (totalByName.get(name) ?? 0) + value);
      const bucket = byMonthRaw.get(month) ?? {};
      bucket[name] = (bucket[name] ?? 0) + value;
      byMonthRaw.set(month, bucket);
    }

    const topNames = Array.from(totalByName.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_METHODS_LIMIT)
      .map(([name]) => name);
    const topNamesSet = new Set(topNames);
    const hasOthers = totalByName.size > topNames.length;

    const byMonth = new Map<string, Record<string, number>>();
    for (const [month, bucket] of byMonthRaw.entries()) {
      const consolidated: Record<string, number> = {};
      for (const [name, value] of Object.entries(bucket)) {
        const key = topNamesSet.has(name) ? name : OTHER_METHODS_LABEL;
        consolidated[key] = (consolidated[key] ?? 0) + value;
      }
      byMonth.set(month, consolidated);
    }

    const months = Array.from(totalByMonth.keys()).sort();
    const points: PaymentMethodMonthlyPoint[] = months.map((month) => ({
      month,
      total: totalByMonth.get(month) ?? 0,
      breakdown: byMonth.get(month) ?? {},
    }));

    const names = hasOthers ? [...topNames, OTHER_METHODS_LABEL] : topNames;
    return { points, names };
  }
}

function monthKey(year: string | number, month: string | number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
