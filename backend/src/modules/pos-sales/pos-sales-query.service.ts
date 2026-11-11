import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia, todayColombia } from '../../common/utils/date-range.util';
import { friendlyPosSellerName } from '../../common/utils/pos-sales.util';
import { getStoresConfig } from '../../config/stores.config';
import { PosSalesRepository, PosSalesStoreSellerRow, PosSalesTipoRow } from '../database/repositories/pos-sales.repository';
import { PosSalesSellerSummary, PosSalesSummaryResponse, PosSalesTipoSummary } from './pos-sales.interface';

/** Única tienda multimarca — ver comentario de `getByMarca` en el repositorio. */
const PILATOS_STORE_ID = 'pilatos';

/** Suma los tipos por tienda en el total combinado y agrupa por tienda — ambos ordenados por venta. */
export function groupPosTipos(rows: PosSalesTipoRow[], storeIds: string[]): Pick<PosSalesSummaryResponse, 'byTipo' | 'byStoreTipo'> {
  const totals = new Map<string, PosSalesTipoSummary>();
  for (const r of rows) {
    const t = totals.get(r.tipo) ?? { tipo: r.tipo, units: 0, sales: 0 };
    t.units += r.units;
    t.sales += r.sales;
    totals.set(r.tipo, t);
  }
  const bySales = (a: PosSalesTipoSummary, b: PosSalesTipoSummary) => b.sales - a.sales;
  return {
    byTipo: Array.from(totals.values()).sort(bySales),
    byStoreTipo: storeIds.map((storeId) => ({
      storeId,
      byTipo: rows.filter((r) => r.storeId === storeId).map(({ tipo, units, sales }) => ({ tipo, units, sales })).sort(bySales),
    })),
  };
}

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

    const [totals, bySellerRaw, byStoreRaw, bySellerByStoreRaw, pilatosByBrandRaw, byCategoryRaw, storeTipoRaw] = await Promise.all([
      this.repository.getTotals(startDay, endDay, storeId),
      this.repository.getBySeller(startDay, endDay, storeId),
      this.repository.getByStore(startDay, endDay),
      this.repository.getBySellerByStore(startDay, endDay),
      this.repository.getByMarca(startDay, endDay, PILATOS_STORE_ID),
      this.repository.getByCategory(startDay, endDay),
      this.repository.getByStoreTipo(startDay, endDay),
    ]);
    const { byTipo, byStoreTipo } = groupPosTipos(storeTipoRaw, getStoresConfig().map((s) => s.id));

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
      byTipo,
      byStoreTipo,
    };
  }

  /** Notas crédito POS por tienda en el rango (cuadro "Notas crédito" del Resumen de SmartSale). */
  async getCreditNotesByStore(rawStartDate: string, rawEndDate: string): Promise<{ storeId: string; count: number; value: number }[]> {
    const startDay = toDayBucketColombia(normalizeStartDate(rawStartDate));
    const endDay = toDayBucketColombia(normalizeEndDate(rawEndDate));
    return this.repository.getCreditNotesByStore(startDay, endDay);
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
