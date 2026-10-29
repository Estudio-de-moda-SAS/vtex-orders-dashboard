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
/**
 * Sin tope por cantidad — se muestran TODOS los métodos de pago con venta
 * real tal cual los reporta VTEX (decisión explícita del usuario: prefiere
 * ver cada uno, aunque el gráfico quede recargado con ~20-30 series).
 * Antes había un tope (`TOP_METHODS_LIMIT = 9`) por ranking; se quitó a
 * propósito. Lo único que SÍ se agrupa en "Otros métodos" es un método en
 * un MES PUNTUAL con $0 ese mes (ej. un método que solo se usó en algunos
 * meses del año) — ese mes concreto se consolida en "Otros métodos" en vez
 * de mostrar "$0"/un "-100%" confuso bajo el nombre del propio método; en
 * los meses donde SÍ tuvo venta real sigue como serie propia (decisión
 * explícita del usuario: la consolidación es mes a mes, no por el total
 * del rango completo — "Otros métodos" siempre da $0 en cualquier mes,
 * porque solo recibe contribuciones que ya eran $0, ver `buildBreakdown`).
 */
const OTHER_METHODS_LABEL = 'Otros métodos';

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
   * filtrar por rango — eso lo hace `getTrend` al armar `points`. La
   * consolidación en `OTHER_METHODS_LABEL` es MES A MES: una fila con
   * `revenue_sales <= 0` se agrupa ahí para ESE mes puntual,
   * independientemente de si ese mismo método tuvo venta real en otros
   * meses (ver comentario de la constante). `names` sale ordenado por
   * venta DENTRO DEL RANGO A MOSTRAR (`startYearMonth`..`endYearMonth`,
   * nunca contando el año anterior) — solo entran ahí los métodos con
   * AL MENOS un mes con venta real en ese rango.
   */
  private buildBreakdown(
    rows: Record<string, string | number>[],
    startYearMonth: string,
    endYearMonth: string,
  ): { byMonth: Map<string, Record<string, number>>; names: string[] } {
    const totalByNameDisplay = new Map<string, number>();
    const byMonth = new Map<string, Record<string, number>>();
    let hasOthersInDisplayRange = false;

    for (const row of rows) {
      const month = monthKey(row.year, row.month);
      const name = String(row.payment_method);
      const value = Number(row.revenue_sales);
      const inDisplayRange = month >= startYearMonth && month <= endYearMonth;

      if (value > 0) {
        if (inDisplayRange) totalByNameDisplay.set(name, (totalByNameDisplay.get(name) ?? 0) + value);
      } else if (inDisplayRange) {
        hasOthersInDisplayRange = true;
      }

      const key = value > 0 ? name : OTHER_METHODS_LABEL;
      const bucket = byMonth.get(month) ?? {};
      bucket[key] = (bucket[key] ?? 0) + value;
      byMonth.set(month, bucket);
    }

    const names = Array.from(totalByNameDisplay.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    if (hasOthersInDisplayRange) names.push(OTHER_METHODS_LABEL);
    return { byMonth, names };
  }
}

function monthKey(year: string | number, month: string | number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
