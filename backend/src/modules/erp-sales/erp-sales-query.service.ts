import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia, todayColombia } from '../../common/utils/date-range.util';
import { erpSmartSaleSellerName, mergeSalesWithCreditNotes } from '../../common/utils/erp-sales.util';
import { getStoresConfig } from '../../config/stores.config';
import { ErpCreditNotesRow, ErpSalesBreakdownRow, ErpSalesGroupedRow, ErpSalesRepository } from '../database/repositories/erp-sales.repository';
import {
  ErpCreditNotesSummary,
  ErpSalesBreakdown,
  ErpSalesSummaryResponse,
  ErpSmartSaleSellerSummary,
  ErpSmartSaleSummaryResponse,
} from './erp-sales.interface';

/** Única tienda multimarca — mismo criterio que `pilatosByBrand` de ventas POS. */
const PILATOS_STORE_ID = 'pilatos';

function emptyBreakdown(): ErpSalesBreakdown {
  return { total: 0, freight: 0, packaging: 0, product: 0, invoices: 0, units: 0 };
}

function pickBreakdown(row: ErpSalesBreakdownRow): ErpSalesBreakdown {
  return { total: row.total, freight: row.freight, packaging: row.packaging, product: row.product, invoices: row.invoices, units: row.units };
}

function toCreditNotes(row: ErpCreditNotesRow | null | undefined): ErpCreditNotesSummary {
  return row ? { count: row.count, value: row.value, units: row.units } : { count: 0, value: 0, units: 0 };
}

/** Vendedores con venta Y/O notas crédito (un vendedor con solo devoluciones en el rango igual aparece, con venta 0). */
function toSellers(sales: ErpSalesGroupedRow[], creditNotes: ErpCreditNotesRow[]): ErpSmartSaleSellerSummary[] {
  return mergeSalesWithCreditNotes(
    sales,
    creditNotes,
    (r) => r.keys.codigo_vendedor ?? '',
    (r) => r.keys.codigo_vendedor ?? '',
  ).map(({ key, sale, creditNote }) => ({
    code: key,
    name: erpSmartSaleSellerName(key) ?? key,
    ...(sale ? pickBreakdown(sale) : emptyBreakdown()),
    creditNotes: toCreditNotes(creditNote),
  }));
}

function dayRange(rawStartDate: string, rawEndDate: string): { startDay: string; endDay: string } {
  return {
    startDay: toDayBucketColombia(normalizeStartDate(rawStartDate)),
    endDay: toDayBucketColombia(normalizeEndDate(rawEndDate)),
  };
}

/** Lectura SQL pura sobre `erp_sales` — nunca llama a la API del ERP en vivo (eso es solo del sync por VPN). */
@Injectable()
export class ErpSalesQueryService {
  constructor(private readonly repository: ErpSalesRepository) {}

  /** Canal e-commerce (tiendas virtuales) — pestaña "Presupuesto y ventas ERP" de `/presupuesto`. */
  async getSummary(rawStartDate: string, rawEndDate: string): Promise<ErpSalesSummaryResponse> {
    const { startDay, endDay } = dayRange(rawStartDate, rawEndDate);
    const [rows, syncInfo] = await Promise.all([
      this.repository.getTotalsByStore(startDay, endDay, 'ecommerce'),
      this.repository.getSyncInfo(),
    ]);

    const byStore = getStoresConfig().map((store) => {
      const row = rows.find((r) => r.storeId === store.id);
      return { storeId: store.id, ...(row ? pickBreakdown(row) : emptyBreakdown()) };
    });

    const channel = byStore.reduce<ErpSalesBreakdown>((acc, s) => {
      acc.total += s.total;
      acc.freight += s.freight;
      acc.packaging += s.packaging;
      acc.product += s.product;
      acc.invoices += s.invoices;
      acc.units += s.units;
      return acc;
    }, emptyBreakdown());

    return { filters: { startDate: startDay, endDate: endDay }, channel, byStore, ...syncInfo };
  }

  /** Año en curso completo, canal SmartSale, por mes — más el primer mes con ERP sincronizado (antes no hay datos ERP). */
  async getSmartSaleMonthlyTrend(): Promise<{ months: { month: string; orders: number; sales: number }[]; coverageStartMonth: string | null }> {
    const endDay = todayColombia();
    const startDay = `${endDay.slice(0, 4)}-01-01`;
    const [months, coverageStartDay] = await Promise.all([
      this.repository.getMonthlyTotals(startDay, endDay, 'smartsale'),
      this.repository.getCoverageStartDay(),
    ]);
    return { months, coverageStartMonth: coverageStartDay?.slice(0, 7) ?? null };
  }

  /** Primer día con facturas ERP sincronizadas — antes no hay ERP (el histórico llegará por Excel). */
  async getCoverageStartDay(): Promise<string | null> {
    return this.repository.getCoverageStartDay();
  }

  /** Última sincronización de facturas ERP (para la nota de Vico). */
  async getLastSyncedAt(): Promise<string | null> {
    return (await this.repository.getSyncInfo()).lastSyncedAt;
  }

  /** Canal SmartSale (vendedores 082P/168A) — pestaña "Ventas ERP" de `/smartsale`. */
  async getSmartSaleSummary(rawStartDate: string, rawEndDate: string): Promise<ErpSmartSaleSummaryResponse> {
    const { startDay, endDay } = dayRange(rawStartDate, rawEndDate);
    const [totalRows, sellerRows, storeRows, storeSellerRows, storeMarcaRows, categoryRows, syncInfo] = await Promise.all([
      this.repository.getBreakdown(startDay, endDay, 'smartsale', 'none'),
      this.repository.getBreakdown(startDay, endDay, 'smartsale', 'seller'),
      this.repository.getBreakdown(startDay, endDay, 'smartsale', 'store'),
      this.repository.getBreakdown(startDay, endDay, 'smartsale', 'storeSeller'),
      this.repository.getBreakdown(startDay, endDay, 'smartsale', 'storeMarca'),
      this.repository.getBreakdown(startDay, endDay, 'smartsale', 'categoria'),
      this.repository.getSyncInfo(),
    ]);
    // Notas crédito: se muestran aparte, NUNCA se restan de la venta de arriba.
    const [ncTotal, ncBySeller, ncByStore, ncByStoreSeller] = await Promise.all([
      this.repository.getCreditNotes(startDay, endDay, 'smartsale', 'none'),
      this.repository.getCreditNotes(startDay, endDay, 'smartsale', 'seller'),
      this.repository.getCreditNotes(startDay, endDay, 'smartsale', 'store'),
      this.repository.getCreditNotes(startDay, endDay, 'smartsale', 'storeSeller'),
    ]);

    const byStore = getStoresConfig().map((store) => {
      const row = storeRows.find((r) => r.keys.store_id === store.id);
      return {
        storeId: store.id,
        ...(row ? pickBreakdown(row) : emptyBreakdown()),
        creditNotes: toCreditNotes(ncByStore.find((r) => r.keys.store_id === store.id)),
        bySeller: toSellers(
          storeSellerRows.filter((r) => r.keys.store_id === store.id),
          ncByStoreSeller.filter((r) => r.keys.store_id === store.id),
        ),
      };
    });

    return {
      filters: { startDate: startDay, endDate: endDay },
      channel: totalRows[0] ? pickBreakdown(totalRows[0]) : emptyBreakdown(),
      creditNotes: toCreditNotes(ncTotal[0]),
      bySeller: toSellers(sellerRows, ncBySeller),
      byStore,
      pilatosByBrand: storeMarcaRows
        .filter((r) => r.keys.store_id === PILATOS_STORE_ID)
        .map((r) => ({ marca: r.keys.marca ?? 'SIN MARCA', ...pickBreakdown(r) })),
      byCategory: categoryRows.map((r) => ({ categoria: r.keys.categoria ?? 'SIN CATEGORÍA', ...pickBreakdown(r) })),
      ...syncInfo,
    };
  }
}
