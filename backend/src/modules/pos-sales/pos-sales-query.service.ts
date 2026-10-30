import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia, todayColombia } from '../../common/utils/date-range.util';
import { friendlyPosSellerName } from '../../common/utils/pos-sales.util';
import { PosSalesRepository, PosSalesStoreSellerRow } from '../database/repositories/pos-sales.repository';
import { PosSalesSellerSummary, PosSalesSummaryResponse } from './pos-sales.interface';

/** Única tienda multimarca — ver comentario de `getByMarca` en el repositorio. */
const PILATOS_STORE_ID = 'pilatos';

function averageTicket(sales: number, orders: number): number {
  return orders > 0 ? sales / orders : 0;
}

function toSellerSummary(row: { nitVendedor: string; nombreVendedor: string; orders: number; sales: number; units: number }): PosSalesSellerSummary {
  return {
    nitVendedor: row.nitVendedor,
    name: friendlyPosSellerName(row.nombreVendedor),
    orders: row.orders,
    sales: row.sales,
    units: row.units,
  };
}

/**
 * Lectura SQL pura sobre `pos_sales` — nunca llama a la API del ERP en
 * vivo (eso es exclusivo de `PosSalesSyncService`). El nombre amigable de
 * cada vendedor (`friendlyPosSellerName`) se aplica ACÁ, no al guardar, para
 * que actualizar el mapeo (ver `pos-sales.util.ts`) se refleje de inmediato
 * en todo el histórico ya sincronizado.
 */
@Injectable()
export class PosSalesQueryService {
  constructor(private readonly repository: PosSalesRepository) {}

  async getSummary(rawStartDate: string, rawEndDate: string, storeId?: string): Promise<PosSalesSummaryResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(rawStartDate));
    const endDay = toDayBucketColombia(normalizeEndDate(rawEndDate));

    const [totals, bySellerRaw, byStoreRaw, bySellerByStoreRaw, pilatosByBrandRaw, byCategoryRaw] = await Promise.all([
      this.repository.getTotals(startDay, endDay, storeId),
      this.repository.getBySeller(startDay, endDay, storeId),
      this.repository.getByStore(startDay, endDay),
      this.repository.getBySellerByStore(startDay, endDay),
      this.repository.getByMarca(startDay, endDay, PILATOS_STORE_ID),
      this.repository.getByCategory(startDay, endDay),
    ]);

    const sellersByStoreId = new Map<string, PosSalesStoreSellerRow[]>();
    for (const row of bySellerByStoreRaw) {
      const list = sellersByStoreId.get(row.storeId) ?? [];
      list.push(row);
      sellersByStoreId.set(row.storeId, list);
    }

    return {
      filters: { startDate: rawStartDate, endDate: rawEndDate },
      totalSales: totals.totalSales,
      totalFreight: totals.totalFreight,
      totalCreditNotes: totals.totalCreditNotes,
      totalOrders: totals.totalOrders,
      totalUnits: totals.totalUnits,
      averageTicket: averageTicket(totals.totalSales, totals.totalOrders),
      bySeller: bySellerRaw.map(toSellerSummary),
      byStore: byStoreRaw.map((store) => ({
        storeId: store.storeId,
        orders: store.orders,
        sales: store.sales,
        units: store.units,
        bySeller: (sellersByStoreId.get(store.storeId) ?? []).map(toSellerSummary),
      })),
      pilatosByBrand: pilatosByBrandRaw,
      byCategory: byCategoryRaw,
    };
  }

  /**
   * Venta mensual del canal POS, combinando las 6 tiendas — mismo rango
   * (año en curso completo) que `SmartSaleService.getMonthlyTrend`, para
   * que `SmartSaleCombinedService` las sume mes a mes sin desalinear fechas.
   */
  async getMonthlyTrend(): Promise<{ month: string; orders: number; sales: number }[]> {
    const endDay = todayColombia();
    const startDay = `${endDay.slice(0, 4)}-01-01`;
    return this.repository.getMonthlyTotals(startDay, endDay);
  }
}
