import { Injectable } from '@nestjs/common';

import { percentChange } from '../../../common/utils/percent-change.util';
import { buildErpCoverageNote } from '../../../common/utils/smartsale-combined.util';
import { buildErpSyncNote, checkSyncFreshness } from '../../../common/utils/sync-freshness.util';
import { PosSalesRepository } from '../../database/repositories/pos-sales.repository';
import { ErpSalesQueryService } from '../../erp-sales/erp-sales-query.service';
import {
  SmartSaleCombinedCategoryBreakdown,
  SmartSaleCombinedPersonBreakdown,
  SmartSaleCombinedStoreSummary,
  SmartSaleCombinedSummaryResponse,
} from '../../orders/interfaces/smartsale-combined.interface';
import { SmartSaleCombinedService } from '../../orders/services/smartsale-combined.service';

const POS_SOURCE_NAME = 'Ventas POS';
const ERP_SOURCE_NAME = 'Ventas ERP';

export interface SmartSalePeriodTotals {
  startDay: string;
  endDay: string;
  /** `erpSales + posSales`. */
  totalSales: number;
  /** `erpOrders + posOrders` — facturas ERP + documentos POS, se suman solo como referencia de volumen total. */
  totalOrders: number;
  erpSales: number;
  erpOrders: number;
  posSales: number;
  posOrders: number;
  /** `erpUnits + posUnits`. */
  totalUnits: number;
  erpUnits: number;
  posUnits: number;
  /** `totalUnits ÷ totalOrders`, YA CALCULADO — nunca lo calcules tú mismo. `null` si `totalOrders` es 0. Unidades promedio por factura/documento del canal SmartSale. */
  upt: number | null;
}

export interface AssistantSmartSaleResult {
  /** `null` = combinado de las 6 tiendas. */
  storeId: string | null;
  periodA: SmartSalePeriodTotals;
  /** Solo presente si se pidió comparar contra un segundo período. */
  periodB: SmartSalePeriodTotals | null;
  /** % de cambio de A respecto a B (B es la base) — `null` si no se pidió periodB, o si B fue 0. NUNCA los calcules tú mismo, ya vienen listos. */
  totalSalesChangePercent: number | null;
  erpSalesChangePercent: number | null;
  posSalesChangePercent: number | null;
  /** Por vendedor, de periodA — combinando POS+ERP. Si se dio `storeId`, es solo de esa tienda; si no, combina las 6. */
  bySeller: SmartSaleCombinedPersonBreakdown[];
  /**
   * Categorías más vendidas de periodA, POS+ERP combinadas — SIEMPRE
   * combina las 6 tiendas (hoy no existe un corte de categoría por
   * tienda), incluso si se pidió `storeId`.
   */
  byCategory: SmartSaleCombinedCategoryBreakdown[];
  /** `null` si se filtró por `storeId` (no aplica desglose por tienda en ese caso) — de periodA. */
  byStore: SmartSaleCombinedStoreSummary[] | null;
  /** SIEMPRE presente — última sincronización de ventas POS (ERP "Conní", manual por VPN). */
  posSyncNote: string;
  /** SIEMPRE presente — última sincronización de facturas ERP (manual por VPN). */
  erpSyncNote: string;
  /**
   * Aviso YA REDACTADO si alguno de los períodos empieza antes del primer
   * día con facturas ERP sincronizadas (esos días solo traen POS; el
   * histórico ERP llegará por Excel) — `null` si ambos están cubiertos.
   * Menciónalo tal cual cuando no sea `null`.
   */
  erpCoverageNote: string | null;
}

type ChannelTotals = { erpSales: number; erpOrders: number; posSales: number; posOrders: number; erpUnits: number; posUnits: number };

function toPeriodTotals(startDay: string, endDay: string, t: ChannelTotals): SmartSalePeriodTotals {
  const totalOrders = t.erpOrders + t.posOrders;
  const totalUnits = t.erpUnits + t.posUnits;
  return {
    startDay,
    endDay,
    totalSales: t.erpSales + t.posSales,
    totalOrders,
    erpSales: t.erpSales,
    erpOrders: t.erpOrders,
    posSales: t.posSales,
    posOrders: t.posOrders,
    totalUnits,
    erpUnits: t.erpUnits,
    posUnits: t.posUnits,
    upt: totalOrders > 0 ? Number((totalUnits / totalOrders).toFixed(2)) : null,
  };
}

/** Extrae los totales POS+ERP de UNA tienda (o de las 6 combinadas si `storeId` es `null`). */
function extractTotals(summary: SmartSaleCombinedSummaryResponse, storeId: string | null): ChannelTotals {
  if (!storeId) {
    return {
      erpSales: summary.totalErpSales,
      erpOrders: summary.totalErpOrders,
      posSales: summary.totalPosSales,
      posOrders: summary.totalPosOrders,
      erpUnits: summary.totalErpUnits,
      posUnits: summary.totalPosUnits,
    };
  }
  const store = summary.byStore.find((s) => s.storeId === storeId);
  return {
    erpSales: store?.erpSales ?? 0,
    erpOrders: store?.erpOrders ?? 0,
    posSales: store?.posSales ?? 0,
    posOrders: store?.posOrders ?? 0,
    erpUnits: store?.erpUnits ?? 0,
    posUnits: store?.posUnits ?? 0,
  };
}

/**
 * Herramienta `get_smartsale_sales` — la fuente de verdad de Vico para
 * CUALQUIER pregunta de ventas de SmartSale es siempre "Resumen" (POS +
 * ERP combinados, ver `SmartSaleCombinedService`), nunca un canal por
 * separado salvo que el usuario pida explícitamente solo POS o solo ERP
 * (para eso están `posSales`/`erpSales` ya desglosados). `periodB` es
 * opcional — si se da, se devuelve también el total de ese período y el %
 * de cambio YA CALCULADO (nunca lo calcules tú mismo).
 */
@Injectable()
export class AssistantSmartSaleService {
  constructor(
    private readonly combinedService: SmartSaleCombinedService,
    private readonly posSalesRepository: PosSalesRepository,
    private readonly erpSalesQueryService: ErpSalesQueryService,
  ) {}

  async getSmartSaleSales(
    periodA: { startDay: string; endDay: string },
    periodB?: { startDay: string; endDay: string },
    storeId?: string,
  ): Promise<AssistantSmartSaleResult> {
    const effectiveStoreId = storeId ?? null;
    const [summaryA, posLastSyncedAt, erpLastSyncedAt] = await Promise.all([
      this.combinedService.getCombinedSummary(periodA.startDay, periodA.endDay),
      this.posSalesRepository.getLastSyncedAt(),
      this.erpSalesQueryService.getLastSyncedAt(),
    ]);
    const summaryB = periodB ? await this.combinedService.getCombinedSummary(periodB.startDay, periodB.endDay) : null;

    const periodATotals = toPeriodTotals(periodA.startDay, periodA.endDay, extractTotals(summaryA, effectiveStoreId));
    const periodBTotals = periodB && summaryB ? toPeriodTotals(periodB.startDay, periodB.endDay, extractTotals(summaryB, effectiveStoreId)) : null;

    const byPerson = effectiveStoreId
      ? (summaryA.byStore.find((s) => s.storeId === effectiveStoreId)?.byPerson ?? [])
      : summaryA.bySeller;

    return {
      storeId: effectiveStoreId,
      periodA: periodATotals,
      periodB: periodBTotals,
      totalSalesChangePercent: periodBTotals ? percentChange(periodBTotals.totalSales, periodATotals.totalSales) : null,
      erpSalesChangePercent: periodBTotals ? percentChange(periodBTotals.erpSales, periodATotals.erpSales) : null,
      posSalesChangePercent: periodBTotals ? percentChange(periodBTotals.posSales, periodATotals.posSales) : null,
      bySeller: byPerson,
      byCategory: summaryA.byCategory,
      byStore: effectiveStoreId ? null : summaryA.byStore,
      posSyncNote: buildErpSyncNote(POS_SOURCE_NAME, checkSyncFreshness(posLastSyncedAt)),
      erpSyncNote: buildErpSyncNote(ERP_SOURCE_NAME, checkSyncFreshness(erpLastSyncedAt)),
      erpCoverageNote: buildErpCoverageNote(summaryA.erpCoverageStartDay, periodB ? [periodA.startDay, periodB.startDay] : [periodA.startDay]),
    };
  }
}
