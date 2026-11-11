import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia, todayColombia } from '../../common/utils/date-range.util';
import { buildMarginSummary, MarginSummary } from '../../common/utils/erp-margin.util';
import { buildMarketplaceSummary, MarketplaceSummary } from '../../common/utils/erp-marketplace.util';
import { buildResumenFilterOptions, ErpResumenFilters, vtexSalesForErpMarcas } from '../../common/utils/erp-resumen-filter.util';
import { erpSmartSaleSellerName, mergeSalesWithCreditNotes } from '../../common/utils/erp-sales.util';
import { getStoresConfig } from '../../config/stores.config';
import { ErpCreditNotesRow, ErpSalesBreakdownRow, ErpSalesGroupedRow, ErpSalesRepository } from '../database/repositories/erp-sales.repository';
import {
  ErpCreditNotesSummary,
  ErpEcommerceBreakdownResponse,
  ErpResumenFilteredResponse,
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

  /**
   * Resumen de `/presupuesto` con filtros (tienda, marca de Pilatos, tipo —
   * ver `ErpResumenFilteredResponse` y `getFilteredLines`). Margen y
   * marketplaces con las mismas fórmulas de siempre, sobre las líneas
   * filtradas. Con filtro de marca o tipo, la venta VTEX por marketplace
   * no es comparable → se deja en 0 y el frontend la muestra como "N/A".
   */
  async getFilteredResumen(rawStartDate: string, rawEndDate: string, filters: ErpResumenFilters): Promise<ErpResumenFilteredResponse> {
    const { startDay, endDay } = dayRange(rawStartDate, rawEndDate);
    const allStoreIds = getStoresConfig().map((s) => s.id);
    const selectedStoreIds = filters.storeIds.length > 0 ? allStoreIds.filter((id) => filters.storeIds.includes(id)) : allStoreIds;
    const brandOrTipo = filters.marcas.length > 0 || filters.tipos.length > 0;
    const wantsPilatosBrands = filters.marcas.length > 0 && selectedStoreIds.includes(PILATOS_STORE_ID);

    const [lines, combos, vtexByMarketplace, vtexPilatosBrands] = await Promise.all([
      this.repository.getFilteredLines(startDay, endDay, 'ecommerce', filters),
      this.repository.getFilterCombos(startDay, endDay, 'ecommerce'),
      brandOrTipo ? Promise.resolve({} as Record<string, number>) : this.repository.getVtexSalesByMarketplace(startDay, endDay),
      wantsPilatosBrands ? this.repository.getVtexSalesByBrand(startDay, endDay, PILATOS_STORE_ID) : Promise.resolve(null),
    ]);
    // Siempre se muestran todas las tiendas elegidas (o las 6); las que no venden la combinación salen en 0 (decisión del
    // usuario: ocultarlas confundía). El promedio simple igual solo cuenta las que tuvieron venta.
    const storeIds = selectedStoreIds;

    const margin = buildMarginSummary(lines, storeIds);
    const erpSalesByStore = new Map<string, number>();
    for (const l of lines) erpSalesByStore.set(l.storeId, (erpSalesByStore.get(l.storeId) ?? 0) + l.total);

    const prefixRows = new Map<string | null, { prefix: string | null; total: number; subtotal: number; invoices: number }>();
    for (const l of lines) {
      const r = prefixRows.get(l.prefix) ?? { prefix: l.prefix, total: 0, subtotal: 0, invoices: 0 };
      r.total += l.total;
      r.subtotal += l.subtotal;
      r.invoices += l.invoices;
      prefixRows.set(l.prefix, r);
    }

    return {
      filters: { startDate: startDay, endDate: endDay, storeIds: filters.storeIds, marcas: filters.marcas, tipos: filters.tipos },
      byStore: margin.byStore.map((s) => ({ ...s, erpSales: erpSalesByStore.get(s.storeId) ?? 0 })),
      channel: {
        ...margin.channel,
        erpSales: storeIds.reduce((a, id) => a + (erpSalesByStore.get(id) ?? 0), 0),
      },
      freight: margin.freight,
      packaging: margin.packaging,
      marketplaces: buildMarketplaceSummary(Array.from(prefixRows.values()), vtexByMarketplace),
      vtex: {
        tipoFilterActive: filters.tipos.length > 0,
        pilatosBrands: vtexPilatosBrands && storeIds.includes(PILATOS_STORE_ID) ? vtexSalesForErpMarcas(filters.marcas, vtexPilatosBrands) : null,
      },
      options: buildResumenFilterOptions(combos, filters),
    };
  }

  /**
   * Marcas dentro de Pilatos y ventas por tipo de producto (general y por
   * marca) del canal e-commerce — solo producto, listas completas
   * ordenadas por venta (ver `ErpEcommerceBreakdownResponse`).
   */
  async getEcommerceBreakdown(rawStartDate: string, rawEndDate: string): Promise<ErpEcommerceBreakdownResponse> {
    const { startDay, endDay } = dayRange(rawStartDate, rawEndDate);
    const [storeMarcaRows, tipoRows, storeTipoRows] = await Promise.all([
      this.repository.getBreakdown(startDay, endDay, 'ecommerce', 'storeMarca'),
      this.repository.getBreakdown(startDay, endDay, 'ecommerce', 'tipo'),
      this.repository.getBreakdown(startDay, endDay, 'ecommerce', 'storeTipo'),
    ]);
    const toTipo = (r: ErpSalesGroupedRow) => ({ tipo: r.keys.tipo ?? 'SIN TIPO', ...pickBreakdown(r) });
    return {
      filters: { startDate: startDay, endDate: endDay },
      pilatosByBrand: storeMarcaRows
        .filter((r) => r.keys.store_id === PILATOS_STORE_ID)
        .map((r) => ({ marca: r.keys.marca ?? 'SIN MARCA', ...pickBreakdown(r) })),
      byTipo: tipoRows.map(toTipo),
      byStore: getStoresConfig().map((store) => ({
        storeId: store.id,
        byTipo: storeTipoRows.filter((r) => r.keys.store_id === store.id).map(toTipo),
      })),
    };
  }

  /**
   * Margen y utilidad del canal e-commerce por marca — pestaña "Resumen"
   * de `/presupuesto`. Sobre el subtotal SIN IVA, sin notas crédito; ver
   * `buildMarginSummary` (ponderado + promedio simple, fletes y empaque).
   */
  async getMarginSummary(rawStartDate: string, rawEndDate: string): Promise<MarginSummary & { filters: { startDate: string; endDate: string } }> {
    const { startDay, endDay } = dayRange(rawStartDate, rawEndDate);
    const rows = await this.repository.getMarginRows(startDay, endDay, 'ecommerce');
    const summary = buildMarginSummary(rows, getStoresConfig().map((s) => s.id));
    return { filters: { startDate: startDay, endDate: endDay }, ...summary };
  }

  /**
   * Cuadro de marketplaces del "Resumen" de `/presupuesto` (e-commerce):
   * venta VTEX vs. ERP por marketplace, comisión y utilidad — ver
   * `buildMarketplaceSummary` (utilidad = subtotal − comisión, sin costo).
   */
  async getMarketplaceSummary(rawStartDate: string, rawEndDate: string): Promise<MarketplaceSummary & { filters: { startDate: string; endDate: string } }> {
    const { startDay, endDay } = dayRange(rawStartDate, rawEndDate);
    const [prefixRows, vtexByLabel] = await Promise.all([
      this.repository.getSalesByDoctoPrefix(startDay, endDay, 'ecommerce'),
      this.repository.getVtexSalesByMarketplace(startDay, endDay),
    ]);
    return { filters: { startDate: startDay, endDate: endDay }, ...buildMarketplaceSummary(prefixRows, vtexByLabel) };
  }

  /**
   * Insumo del margen del Resumen de SmartSale: subtotal sin IVA y costo
   * de las facturas ERP de SmartSale + de los documentos POS (CO 810, canal
   * 'pos' — la consulta de ventas POS no trae subtotal ni costo). Sin notas
   * crédito. `posDocumentsWithMargin` = documentos POS de venta (CO 810,
   * sin NPE) que YA están en la consulta de facturas — se compara contra
   * los documentos de "Ventas POS" para avisar cuántos faltan.
   */
  async getSmartSaleMarginInput(rawStartDate: string, rawEndDate: string) {
    const { startDay, endDay } = dayRange(rawStartDate, rawEndDate);
    const [erpRows, posRows, posTotals] = await Promise.all([
      this.repository.getMarginRows(startDay, endDay, 'smartsale'),
      this.repository.getMarginRows(startDay, endDay, 'pos'),
      this.repository.getBreakdown(startDay, endDay, 'pos', 'none'),
    ]);
    return { rows: [...erpRows, ...posRows], posDocumentsWithMargin: posTotals[0]?.invoices ?? 0 };
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
    const [ssTipoRows, ssStoreTipoRows] = await Promise.all([
      this.repository.getBreakdown(startDay, endDay, 'smartsale', 'tipo'),
      this.repository.getBreakdown(startDay, endDay, 'smartsale', 'storeTipo'),
    ]);
    const toSsTipo = (r: ErpSalesGroupedRow) => ({ tipo: r.keys.tipo ?? 'SIN TIPO', ...pickBreakdown(r) });
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
      byTipo: ssTipoRows.map(toSsTipo),
      byStoreTipo: getStoresConfig().map((store) => ({
        storeId: store.id,
        byTipo: ssStoreTipoRows.filter((r) => r.keys.store_id === store.id).map(toSsTipo),
      })),
      ...syncInfo,
    };
  }
}
