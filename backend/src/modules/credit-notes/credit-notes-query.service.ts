import { Injectable } from '@nestjs/common';

import { enumerateDayBuckets, normalizeEndDate, normalizeStartDate, toDayBucketColombia } from '../../common/utils/date-range.util';
import { matchRevenueStatusDefinition } from '../../common/utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../config/revenue-status.config';
import { DashboardQueryRepository } from '../database/repositories/dashboard-query.repository';
import { CreditNotesRepository } from '../database/repositories/credit-notes.repository';
import { CreditNotesSummaryResponse } from './credit-notes.interface';

/**
 * Lectura SQL pura sobre `credit_notes` — nunca llama a la API del ERP en
 * vivo (eso es exclusivo de `CreditNotesSyncService`). Mismo principio que
 * el resto del dashboard: la vista solo lee lo que ya se sincronizó.
 */
@Injectable()
export class CreditNotesQueryService {
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();

  constructor(
    private readonly repository: CreditNotesRepository,
    private readonly dashboardQueryRepository: DashboardQueryRepository,
  ) {}

  async getSummary(rawStartDate: string, rawEndDate: string, storeId?: string): Promise<CreditNotesSummaryResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(rawStartDate));
    const endDay = toDayBucketColombia(normalizeEndDate(rawEndDate));

    const [byDayRaw, byStore, totalSalesValue] = await Promise.all([
      this.repository.getByDay(startDay, endDay, storeId),
      this.repository.getByStore(startDay, endDay, storeId),
      this.getSalesTotal(startDay, endDay, storeId),
    ]);

    // Regla de ausencia consistente con el resto del dashboard: un día sin notas crédito
    // aparece en 0, nunca se omite — para que "sin fila" nunca se confunda con "sin sincronizar".
    const allDays = enumerateDayBuckets(`${startDay}T00:00:00-05:00`, `${endDay}T23:59:59-05:00`);
    const byDayMap = new Map(byDayRaw.map((d) => [d.date, d]));
    const byDay = allDays.map((date) => byDayMap.get(date) ?? { date, count: 0, totalValue: 0 });

    const totalCount = byDay.reduce((sum, d) => sum + d.count, 0);
    const totalValue = byDay.reduce((sum, d) => sum + d.totalValue, 0);

    return {
      filters: { startDate: rawStartDate, endDate: rawEndDate },
      totalCount,
      totalValue,
      totalSalesValue,
      byDay,
      byStore,
    };
  }

  /**
   * "Ventas contabilizadas" (mismo criterio que el resto del dashboard,
   * ver `revenue-status.config.ts`) para el mismo rango/tienda que las
   * notas crédito — denominador de "¿qué % de lo vendido se devolvió?".
   * Mismo patrón ya usado en `PilatosMixService`/`PaymentMethodsTrendService`.
   */
  private async getSalesTotal(startDay: string, endDay: string, storeId?: string): Promise<number> {
    const rows = await this.dashboardQueryRepository.queryGroupedMulti('sales_daily_by_status', ['status'], ['sales'], startDay, endDay, storeId);
    let total = 0;
    for (const row of rows) {
      if (!matchRevenueStatusDefinition({ status: String(row.status) }, this.revenueStatusDefinitions)) continue;
      total += Number(row.sales);
    }
    return total;
  }
}
