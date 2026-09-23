import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia } from '../../../common/utils/date-range.util';
import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getParticipationGrowthThresholds, GrowthThresholds } from '../../../config/growth-thresholds.config';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import { GrowthStatus } from '../interfaces/trends.interface';
import { MonthlyMixPoint, PilatosMixResponse, SeriesParticipation } from '../interfaces/pilatos-mix.interface';

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

    const [statusRows, sellerRows, marketplaceRows] = await Promise.all([
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_status',
        ['year', 'month', 'status'],
        ['sales'],
        startDay,
        endDay,
        PILATOS_STORE_ID,
      ),
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_seller',
        ['year', 'month', 'seller_name'],
        ['revenue_sales'],
        startDay,
        endDay,
        PILATOS_STORE_ID,
      ),
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_marketplace',
        ['year', 'month', 'marketplace_name'],
        ['revenue_sales'],
        startDay,
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

    const bySeller = this.buildMix(sellerRows, 'seller_name', 'revenue_sales', totalByMonth);
    const byMarketplace = this.buildMix(marketplaceRows, 'marketplace_name', 'revenue_sales', totalByMonth);

    return {
      bySeller: bySeller.points,
      byMarketplace: byMarketplace.points,
      sellerNames: bySeller.names,
      marketplaceNames: byMarketplace.names,
      sellerParticipation: this.buildParticipation(bySeller.names, bySeller.points),
      marketplaceParticipation: this.buildParticipation(byMarketplace.names, byMarketplace.points),
    };
  }

  /**
   * Tabla-semáforo: para cada nombre, qué % del total contabilizado
   * representó cada mes y cómo cambió esa participación respecto al mes
   * ANTERIOR DEL RANGO (el punto previo en `points`, no necesariamente el
   * mes calendario -1 si el rango tuviera huecos). A propósito NO es el
   * crecimiento de la venta en pesos — mide si ese seller/marketplace
   * está ganando o perdiendo peso relativo dentro de Pilatos.
   */
  private buildParticipation(names: string[], points: MonthlyMixPoint[]): SeriesParticipation[] {
    return names.map((name) => {
      let priorParticipation: number | null = null;
      // 'new' debe reservarse para el PRIMER mes con participación real de
      // toda la serie — si el nombre ya tuvo participación antes y cayó a
      // 0 un mes (ej. sin órdenes ese mes puntual), volver a tener
      // participación después es una reactivación, no un debut, aunque la
      // clasificación matemática (prior === 0) sea la misma en ambos casos.
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
        return { month: point.month, participationPercent, salesValue: value, growthPercent, status };
      });
      return { name, points: seriesPoints };
    });
  }

  /**
   * Arma los puntos mensuales de un desglose (seller o marketplace):
   * cada mes con datos en `totalByMonth` aparece, incluso si ese mes no
   * tuvo ninguna orden de sellers/marketplaces (breakdown vacío,
   * `direct` = 100% del total).
   */
  private buildMix(
    rows: Record<string, string | number>[],
    nameColumn: string,
    valueColumn: string,
    totalByMonth: Map<string, number>,
  ): { points: MonthlyMixPoint[]; names: string[] } {
    const names = new Set<string>();
    const byMonth = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const month = monthKey(row.year, row.month);
      const name = String(row[nameColumn]);
      names.add(name);
      const bucket = byMonth.get(month) ?? {};
      bucket[name] = (bucket[name] ?? 0) + Number(row[valueColumn]);
      byMonth.set(month, bucket);
    }

    const months = Array.from(totalByMonth.keys()).sort();
    const points: MonthlyMixPoint[] = months.map((month) => {
      const breakdown = byMonth.get(month) ?? {};
      const total = totalByMonth.get(month) ?? 0;
      const namedSum = Object.values(breakdown).reduce((acc, v) => acc + v, 0);
      return { month, total, direct: Math.max(0, total - namedSum), breakdown };
    });

    return { points, names: Array.from(names).sort((a, b) => a.localeCompare(b, 'es')) };
  }
}

function monthKey(year: string | number, month: string | number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * `prior === null` cuando no hay mes anterior en el rango pedido (primer
 * punto). `everHadParticipation` = si el nombre ya tuvo participación > 0
 * en ALGÚN mes anterior de la serie (no solo el inmediatamente anterior)
 * — distingue un debut real ('new') de una reactivación tras un mes en 0
 * ('green': es una mejora clara, aunque no haya un % de referencia
 * significativo para calcular contra cero).
 */
function classifyParticipationGrowth(
  current: number,
  prior: number | null,
  everHadParticipation: boolean,
  thresholds: GrowthThresholds,
): { growthPercent: number | null; status: GrowthStatus } {
  if (prior === null) return { growthPercent: null, status: 'no-data' };
  if (prior === 0) {
    if (current === 0) return { growthPercent: null, status: 'no-data' };
    return { growthPercent: null, status: everHadParticipation ? 'green' : 'new' };
  }
  const growthPercent = ((current - prior) / prior) * 100;
  const status: GrowthStatus =
    growthPercent >= thresholds.greenMinPercent ? 'green' : growthPercent <= thresholds.redMaxPercent ? 'red' : 'yellow';
  return { growthPercent, status };
}
