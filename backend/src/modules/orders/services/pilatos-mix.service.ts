import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, subtractCalendarYear, toDayBucketColombia } from '../../../common/utils/date-range.util';
import { buildParticipationSeries } from '../../../common/utils/participation-growth.util';
import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getParticipationGrowthThresholds } from '../../../config/growth-thresholds.config';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import { MonthlyMixPoint, PilatosMixResponse } from '../interfaces/pilatos-mix.interface';

const PILATOS_STORE_ID = 'pilatos';

/**
 * Mezcla de venta directa vs. sellers/marketplaces en el tiempo —
 * exclusivo Pilatos. Lee `sales_daily_by_seller`/`by_marketplace`
 * (`revenue_sales`, ya filtrado a solo ventas contabilizadas desde que
 * se calculan) + `sales_daily_by_status` (para el total contabilizado
 * del mes, del que se deriva "venta directa" = total - suma nombrada).
 */
@Injectable()
export class PilatosMixService {
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();
  private readonly participationThresholds = getParticipationGrowthThresholds();

  constructor(private readonly dashboardQueryRepository: DashboardQueryRepository) {}

  async getMix(rawStartDate: string, rawEndDate: string): Promise<PilatosMixResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(rawStartDate));
    const endDay = toDayBucketColombia(normalizeEndDate(rawEndDate));
    // Se trae también el año anterior completo (mismo día en adelante) en UNA sola consulta — es la
    // referencia para "vs. año pasado" (ver `buildParticipationSeries`). Esos meses NUNCA aparecen
    // como columna propia en `bySeller`/`byMarketplace`, solo se usan para comparar.
    const queryStartDay = subtractCalendarYear(startDay);
    const startYearMonth = startDay.slice(0, 7);
    const endYearMonth = endDay.slice(0, 7);

    const [statusRows, sellerRows, marketplaceRows] = await Promise.all([
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_status',
        ['year', 'month', 'status'],
        ['sales'],
        queryStartDay,
        endDay,
        PILATOS_STORE_ID,
      ),
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_seller',
        ['year', 'month', 'seller_name'],
        ['revenue_sales'],
        queryStartDay,
        endDay,
        PILATOS_STORE_ID,
      ),
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_marketplace',
        ['year', 'month', 'marketplace_name'],
        ['revenue_sales'],
        queryStartDay,
        endDay,
        PILATOS_STORE_ID,
      ),
    ]);

    const totalByMonth = new Map<string, number>();
    for (const row of statusRows) {
      if (!matchRevenueStatusDefinition({ status: String(row.status) }, this.revenueStatusDefinitions)) continue;
      const month = monthKey(row.year, row.month);
      totalByMonth.set(month, (totalByMonth.get(month) ?? 0) + Number(row.sales));
    }

    const bySeller = this.buildMix(sellerRows, 'seller_name', 'revenue_sales', totalByMonth, startYearMonth, endYearMonth);
    const byMarketplace = this.buildMix(marketplaceRows, 'marketplace_name', 'revenue_sales', totalByMonth, startYearMonth, endYearMonth);

    return {
      bySeller: bySeller.points,
      byMarketplace: byMarketplace.points,
      sellerNames: bySeller.names,
      marketplaceNames: byMarketplace.names,
      sellerParticipation: buildParticipationSeries(bySeller.names, bySeller.points, totalByMonth, bySeller.byMonth, this.participationThresholds),
      marketplaceParticipation: buildParticipationSeries(
        byMarketplace.names,
        byMarketplace.points,
        totalByMonth,
        byMarketplace.byMonth,
        this.participationThresholds,
      ),
    };
  }

  /**
   * Arma los puntos mensuales de un desglose (seller o marketplace):
   * cada mes con datos en `totalByMonth` aparece, incluso si ese mes no
   * tuvo ninguna orden de sellers/marketplaces (breakdown vacío, `direct`
   * = 100% del total). `rows` ya cubre año actual + año anterior, pero
   * `names` (las series a mostrar) solo considera los nombres que
   * aparecieron DENTRO del rango a mostrar (`startYearMonth`..`endYearMonth`)
   * — un seller que solo existió el año pasado no aparece como fila nueva
   * de la nada. `byMonth` sí se devuelve completo (ambos años), para que
   * `buildParticipationSeries` pueda leer el año anterior como referencia.
   */
  private buildMix(
    rows: Record<string, string | number>[],
    nameColumn: string,
    valueColumn: string,
    totalByMonth: Map<string, number>,
    startYearMonth: string,
    endYearMonth: string,
  ): { points: MonthlyMixPoint[]; names: string[]; byMonth: Map<string, Record<string, number>> } {
    const namesDisplay = new Set<string>();
    const byMonth = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const month = monthKey(row.year, row.month);
      const name = String(row[nameColumn]);
      if (month >= startYearMonth && month <= endYearMonth) namesDisplay.add(name);
      const bucket = byMonth.get(month) ?? {};
      bucket[name] = (bucket[name] ?? 0) + Number(row[valueColumn]);
      byMonth.set(month, bucket);
    }

    const displayMonths = Array.from(totalByMonth.keys())
      .filter((m) => m >= startYearMonth && m <= endYearMonth)
      .sort();
    const points: MonthlyMixPoint[] = displayMonths.map((month) => {
      const breakdown = byMonth.get(month) ?? {};
      const total = totalByMonth.get(month) ?? 0;
      const namedSum = Object.values(breakdown).reduce((acc, v) => acc + v, 0);
      return { month, total, direct: Math.max(0, total - namedSum), breakdown };
    });

    return { points, names: Array.from(namesDisplay).sort((a, b) => a.localeCompare(b, 'es')), byMonth };
  }
}

function monthKey(year: string | number, month: string | number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
