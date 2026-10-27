import { Injectable } from '@nestjs/common';

import { percentChange } from '../../../common/utils/percent-change.util';
import { buildErpSyncNote, checkSyncFreshness } from '../../../common/utils/sync-freshness.util';
import { PosSalesRepository } from '../../database/repositories/pos-sales.repository';
import {
  SmartSaleCombinedCategoryBreakdown,
  SmartSaleCombinedPersonBreakdown,
  SmartSaleCombinedStoreSummary,
  SmartSaleCombinedSummaryResponse,
} from '../../orders/interfaces/smartsale-combined.interface';
import { SmartSaleCombinedService } from '../../orders/services/smartsale-combined.service';
import { AssistantSalesService } from './assistant-sales.service';

const POS_SOURCE_NAME = 'Ventas POS';

export interface SmartSalePeriodTotals {
  startDay: string;
  endDay: string;
  /** `vtexSales + posSales`. */
  totalSales: number;
  /** `vtexOrders + posOrders` — ojo: son conceptos de "orden" distintos entre los dos canales (una orden VTEX vs. un documento POS), se suman solo como referencia de volumen total. */
  totalOrders: number;
  vtexSales: number;
  vtexOrders: number;
  posSales: number;
  posOrders: number;
}

export interface AssistantSmartSaleResult {
  /** `null` = combinado de las 6 tiendas. */
  storeId: string | null;
  periodA: SmartSalePeriodTotals;
  /** Solo presente si se pidió comparar contra un segundo período. */
  periodB: SmartSalePeriodTotals | null;
  /** % de cambio de A respecto a B (B es la base) — `null` si no se pidió periodB, o si B fue 0. NUNCA los calcules tú mismo, ya vienen listos. */
  totalSalesChangePercent: number | null;
  vtexSalesChangePercent: number | null;
  posSalesChangePercent: number | null;
  /** Por vendedor, de periodA — combinando VTEX+POS. Si se dio `storeId`, es solo de esa tienda; si no, combina las 6. */
  bySeller: SmartSaleCombinedPersonBreakdown[];
  /**
   * Categorías más vendidas de periodA, VTEX+POS combinadas — SIEMPRE
   * combina las 6 tiendas (hoy no existe un corte de categoría por
   * tienda), incluso si se pidió `storeId`. Usa esto para "¿cuál ha sido
   * la categoría más vendida?" — el número es siempre el de Resumen
   * (VTEX+POS), nunca solo de un canal.
   */
  byCategory: SmartSaleCombinedCategoryBreakdown[];
  /** `null` si se filtró por `storeId` (no aplica desglose por tienda en ese caso) — de periodA. */
  byStore: SmartSaleCombinedStoreSummary[] | null;
  /**
   * SIEMPRE presente (nunca `null`) — nota discreta de cuándo se
   * sincronizó por última vez el ERP de ventas POS (manual, requiere VPN
   * — a diferencia de VTEX, que es automático). Menciónala igual que el
   * `syncNote` de `get_sales`, pero nunca la confundas con VTEX.
   */
  posSyncNote: string;
  /** Solo presente si se dio `storeId` (requiere una tienda puntual) — mismo criterio que el `syncNote` de `get_sales`. `null` cuando no se filtró por tienda: NO inventes un valor para esto. */
  vtexSyncNote: string | null;
}

function toPeriodTotals(startDay: string, endDay: string, vtexSales: number, vtexOrders: number, posSales: number, posOrders: number): SmartSalePeriodTotals {
  return {
    startDay,
    endDay,
    totalSales: vtexSales + posSales,
    totalOrders: vtexOrders + posOrders,
    vtexSales,
    vtexOrders,
    posSales,
    posOrders,
  };
}

/** Extrae los totales VTEX+POS de UNA tienda (o de las 6 combinadas si `storeId` es `null`) de una respuesta de `SmartSaleCombinedService.getCombinedSummary`. */
function extractTotals(summary: SmartSaleCombinedSummaryResponse, storeId: string | null): { vtexSales: number; vtexOrders: number; posSales: number; posOrders: number } {
  if (!storeId) {
    return { vtexSales: summary.totalVtexSales, vtexOrders: summary.totalVtexOrders, posSales: summary.totalPosSales, posOrders: summary.totalPosOrders };
  }
  const store = summary.byStore.find((s) => s.storeId === storeId);
  return { vtexSales: store?.vtexSales ?? 0, vtexOrders: store?.vtexOrders ?? 0, posSales: store?.posSales ?? 0, posOrders: store?.posOrders ?? 0 };
}

/**
 * Herramienta `get_smartsale_sales` — la fuente de verdad de Vico para
 * CUALQUIER pregunta de ventas de SmartSale es siempre "Resumen" (VTEX +
 * POS combinados, ver `SmartSaleCombinedService`), nunca un canal por
 * separado salvo que el usuario pida explícitamente solo VTEX o solo
 * POS (para eso están `vtexSales`/`posSales` ya desglosados en la misma
 * respuesta). `periodB` es opcional — si se da, se devuelve también el
 * total de ese período y el % de cambio YA CALCULADO (nunca lo calcules
 * tú mismo), mismo patrón que `compare_periods`/`get_diagnosis`.
 */
@Injectable()
export class AssistantSmartSaleService {
  constructor(
    private readonly combinedService: SmartSaleCombinedService,
    private readonly posSalesRepository: PosSalesRepository,
    private readonly assistantSalesService: AssistantSalesService,
  ) {}

  async getSmartSaleSales(
    periodA: { startDay: string; endDay: string },
    periodB?: { startDay: string; endDay: string },
    storeId?: string,
  ): Promise<AssistantSmartSaleResult> {
    const effectiveStoreId = storeId ?? null;
    const [summaryA, posLastSyncedAt, vtexSyncNote] = await Promise.all([
      this.combinedService.getCombinedSummary(periodA.startDay, periodA.endDay),
      this.posSalesRepository.getLastSyncedAt(),
      effectiveStoreId ? this.assistantSalesService.getSyncNote(effectiveStoreId) : Promise.resolve(null),
    ]);
    const totalsA = extractTotals(summaryA, effectiveStoreId);

    let totalsB: ReturnType<typeof extractTotals> | null = null;
    if (periodB) {
      const summaryB = await this.combinedService.getCombinedSummary(periodB.startDay, periodB.endDay);
      totalsB = extractTotals(summaryB, effectiveStoreId);
    }

    const periodATotals = toPeriodTotals(periodA.startDay, periodA.endDay, totalsA.vtexSales, totalsA.vtexOrders, totalsA.posSales, totalsA.posOrders);
    const periodBTotals = periodB && totalsB
      ? toPeriodTotals(periodB.startDay, periodB.endDay, totalsB.vtexSales, totalsB.vtexOrders, totalsB.posSales, totalsB.posOrders)
      : null;

    const byPerson = effectiveStoreId
      ? (summaryA.byStore.find((s) => s.storeId === effectiveStoreId)?.byPerson ?? [])
      : summaryA.bySeller;

    return {
      storeId: effectiveStoreId,
      periodA: periodATotals,
      periodB: periodBTotals,
      totalSalesChangePercent: periodBTotals ? percentChange(periodBTotals.totalSales, periodATotals.totalSales) : null,
      vtexSalesChangePercent: periodBTotals ? percentChange(periodBTotals.vtexSales, periodATotals.vtexSales) : null,
      posSalesChangePercent: periodBTotals ? percentChange(periodBTotals.posSales, periodATotals.posSales) : null,
      bySeller: byPerson,
      byCategory: summaryA.byCategory,
      byStore: effectiveStoreId ? null : summaryA.byStore,
      posSyncNote: buildErpSyncNote(POS_SOURCE_NAME, checkSyncFreshness(posLastSyncedAt)),
      vtexSyncNote,
    };
  }
}
