import { Injectable } from '@nestjs/common';

import { percentChange } from '../../../common/utils/percent-change.util';
import { AssistantSalesService, SalesBreakdownType } from './assistant-sales.service';

export interface ComparePeriodsResult {
  storeId: string;
  breakdown: SalesBreakdownType | null;
  periodA: { startDay: string; endDay: string; sales: number; orders: number | null };
  periodB: { startDay: string; endDay: string; sales: number; orders: number | null };
  /** % de cambio de A respecto a B (B es la base) — `null` si B tuvo 0 ventas. */
  salesChangePercent: number | null;
  ordersChangePercent: number | null;
  /** SIEMPRE presente (nunca vacío) — nota discreta de cuándo sincronizó VTEX por última vez, ver `sync-freshness.util.ts`. */
  syncNote: string;
}

/**
 * Herramienta `compare_periods` — cuantifica el cambio entre dos rangos
 * para la MISMA tienda (y, opcionalmente, el mismo corte), calculando el
 * % de cambio server-side con `percentChange` para que el modelo nunca
 * reste ni divida. Reusa `AssistantSalesService.getSalesBreakdown` sin
 * desglose (lee el total) cuando no se pide `breakdown`.
 */
@Injectable()
export class AssistantCompareService {
  constructor(private readonly salesService: AssistantSalesService) {}

  async comparePeriods(
    storeId: string,
    periodA: { startDay: string; endDay: string },
    periodB: { startDay: string; endDay: string },
    breakdown?: SalesBreakdownType,
  ): Promise<ComparePeriodsResult> {
    // Sin `breakdown`, se usa "status" como corte base: es el único que
    // siempre existe para cualquier tienda y ya representa el total de
    // ventas contabilizadas (mismo criterio que el resto del dashboard).
    const effectiveBreakdown = breakdown ?? 'status';

    const [resultA, resultB] = await Promise.all([
      this.salesService.getSalesBreakdown(storeId, periodA.startDay, periodA.endDay, effectiveBreakdown),
      this.salesService.getSalesBreakdown(storeId, periodB.startDay, periodB.endDay, effectiveBreakdown),
    ]);

    return {
      storeId,
      breakdown: breakdown ?? null,
      periodA: { ...periodA, sales: resultA.totalSales, orders: resultA.totalOrders },
      periodB: { ...periodB, sales: resultB.totalSales, orders: resultB.totalOrders },
      salesChangePercent: percentChange(resultB.totalSales, resultA.totalSales),
      ordersChangePercent:
        resultA.totalOrders !== null && resultB.totalOrders !== null ? percentChange(resultB.totalOrders, resultA.totalOrders) : null,
      // La nota de sincronización es por TIENDA, no por período — alcanza con la de A
      // (ya la calculó `getSalesBreakdown`, no hace falta repetir la consulta).
      syncNote: resultA.syncNote,
    };
  }
}
