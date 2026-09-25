import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia, todayColombia } from '../../../common/utils/date-range.util';
import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getGrowthThresholds, GrowthThresholds } from '../../../config/growth-thresholds.config';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { getSmartSalePeople } from '../../../config/smartsale.config';
import { getStoresConfig, StoreConfig } from '../../../config/stores.config';
import { CityBreakdown } from '../../../modules/orders/interfaces/dashboard.interface';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import {
  CampaignComboTotalsByStore,
  CategoryBrandRankingResult,
  CategoryBrandTop,
  CategoryBreakdown,
  CategoryRankingResult,
  DiscountAnalyticsResponse,
  DiscountDistribution,
} from '../interfaces/product-analytics.interface';
import { GrowthStatus } from '../interfaces/trends.interface';
import { SmartSaleCampaignsByStore, SmartSaleMonthlyTrendPoint, SmartSaleSummaryByStore } from '../interfaces/smartsale.interface';

/**
 * Lecturas del canal SmartSale — mismo patrón que `ProductAnalyticsService`
 * (SQL puro con `SUM`/`GROUP BY` sobre agregados pre-calculados), pero
 * sobre las tablas `smartsale_daily_by_*` (ver migración 0007), que solo
 * tienen filas para órdenes con `utmiCampaign` de un vendedor configurado.
 */
@Injectable()
export class SmartSaleService {
  private readonly storesById = new Map(getStoresConfig().map((store) => [store.id, store]));
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();
  private readonly people = getSmartSalePeople();

  constructor(private readonly dashboardQueryRepository: DashboardQueryRepository) {}

  private personName(utmiCampaign: string): string {
    return this.people.find((p) => p.utmiCampaign === utmiCampaign)?.name ?? utmiCampaign;
  }

  /**
   * Card de cada tienda: venta total SIN filtrar (referencia) + total del
   * canal SmartSale + desglose por persona con su % sobre ese total.
   */
  async getSummary(startDate: string, endDate: string): Promise<SmartSaleSummaryByStore> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);

    const [statusRows, personRows] = await Promise.all([
      this.dashboardQueryRepository.queryGrouped('sales_daily_by_status', 'status', ['sales'], startDay, endDay),
      this.dashboardQueryRepository.queryGrouped(
        'smartsale_daily_by_person',
        'utmi_campaign',
        ['revenue_orders', 'revenue_sales'],
        startDay,
        endDay,
      ),
    ]);

    const result: SmartSaleSummaryByStore = {};
    for (const store of this.storesById.values()) {
      const storeTotalSales = statusRows
        .filter((r) => r.store_id === store.id)
        .filter((r) => matchRevenueStatusDefinition({ status: String(r.status) }, this.revenueStatusDefinitions))
        .reduce((acc, r) => acc + Number(r.sales), 0);

      const storePersonRows = personRows.filter((r) => r.store_id === store.id);
      const smartSaleOrders = storePersonRows.reduce((acc, r) => acc + Number(r.revenue_orders), 0);
      const smartSaleSales = storePersonRows.reduce((acc, r) => acc + Number(r.revenue_sales), 0);

      const byPerson = storePersonRows
        .map((r) => {
          const utmiCampaign = String(r.utmi_campaign);
          const sales = Number(r.revenue_sales);
          return {
            utmiCampaign,
            name: this.personName(utmiCampaign),
            orders: Number(r.revenue_orders),
            sales,
            percentage: smartSaleSales > 0 ? Number(((sales / smartSaleSales) * 100).toFixed(2)) : 0,
          };
        })
        .sort((a, b) => b.sales - a.sales);

      result[store.id] = { storeTotalSales, smartSaleOrders, smartSaleSales, byPerson };
    }
    return result;
  }

  /**
   * Tendencia de ventas del canal SmartSale COMBINANDO las 6 tiendas
   * ("general canal", no por tienda ni por persona) — un punto por mes,
   * desde el primer mes con datos reales (sin histórico a propósito,
   * nunca hay meses "vacíos" antes de eso). El % de crecimiento es contra
   * el mes anterior de la MISMA serie, igual criterio que `/tendencias`.
   */
  async getMonthlyTrend(): Promise<SmartSaleMonthlyTrendPoint[]> {
    const endDay = todayColombia();
    const startDay = `${endDay.slice(0, 4)}-01-01`;

    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'smartsale_daily_by_person',
      ['year', 'month'],
      ['revenue_orders', 'revenue_sales'],
      startDay,
      endDay,
    );

    const byMonth = new Map<string, { orders: number; sales: number }>();
    for (const row of rows) {
      const month = `${row.year}-${String(row.month).padStart(2, '0')}`;
      const acc = byMonth.get(month) ?? { orders: 0, sales: 0 };
      acc.orders += Number(row.revenue_orders);
      acc.sales += Number(row.revenue_sales);
      byMonth.set(month, acc);
    }

    const months = Array.from(byMonth.keys()).sort();
    const thresholds = getGrowthThresholds();
    let priorSales: number | null = null;

    return months.map((month, index) => {
      const { orders, sales } = byMonth.get(month)!;
      const { growthPercent, status } = classifyMonthlyGrowth(sales, index === 0 ? null : priorSales, thresholds);
      priorSales = sales;
      return { month, orders, sales, growthPercent, status };
    });
  }

  async getDiscounts(startDate: string, endDate: string): Promise<DiscountAnalyticsResponse> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'smartsale_daily_by_discount_bucket',
      'discount_percentage',
      ['units'],
      startDay,
      endDay,
    );
    const global = this.buildDistribution(rows);
    const byStore: Record<string, DiscountDistribution> = {};
    for (const store of this.storesById.values()) {
      byStore[store.id] = this.buildDistribution(rows.filter((r) => r.store_id === store.id));
    }
    return { global, byStore, multiBrand: { storeNames: [], general: { buckets: [], topBucket: null, totalItems: 0 }, byBrand: {} } };
  }

  async getCampaigns(startDate: string, endDate: string): Promise<SmartSaleCampaignsByStore> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'smartsale_daily_by_discount_campaign',
      'campaign_name',
      ['revenue_orders', 'revenue_sales'],
      startDay,
      endDay,
    );
    const result: SmartSaleCampaignsByStore = {};
    for (const store of this.storesById.values()) {
      result[store.id] = rows
        .filter((r) => r.store_id === store.id)
        .map((r) => ({ campaignName: String(r.campaign_name), orders: Number(r.revenue_orders), sales: Number(r.revenue_sales) }))
        .filter((c) => c.orders > 0)
        .sort((a, b) => b.orders - a.orders);
    }
    return result;
  }

  /**
   * Total REAL (sin doble conteo) de las campañas de descuento de
   * SmartSale seleccionadas, por tienda — igual que
   * `ProductAnalyticsService.getCampaignComboTotal` del dashboard
   * general, pero sobre `smartsale_daily_by_campaign_combo` (migración
   * 0008). Necesario porque sumar filas de `getCampaigns` sobrecuenta
   * cuando una orden calificó para varias campañas seleccionadas a la vez.
   */
  async getCampaignComboTotal(startDate: string, endDate: string, campaignNames: string[]): Promise<CampaignComboTotalsByStore> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const rows = await this.dashboardQueryRepository.getCampaignComboTotals(
      startDay,
      endDay,
      campaignNames,
      'smartsale_daily_by_campaign_combo',
    );
    const byStore: CampaignComboTotalsByStore = {};
    for (const row of rows) {
      byStore[row.storeId] = {
        orders: row.orders,
        sales: row.sales,
        revenueOrders: row.revenueOrders,
        revenueSales: row.revenueSales,
      };
    }
    return byStore;
  }

  async getTopCategoryBulk(startDate: string, endDate: string): Promise<Record<string, CategoryRankingResult>> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'smartsale_daily_by_category',
      'category_name',
      ['revenue_units', 'revenue_sales'],
      startDay,
      endDay,
    );
    const result: Record<string, CategoryRankingResult> = {};
    for (const store of this.storesById.values()) {
      const storeRows = rows.filter((r) => r.store_id === store.id);
      const storeTotal = storeRows.reduce((acc, r) => acc + Number(r.revenue_sales), 0);
      const categories = storeRows
        .map((r) => ({
          category: String(r.category_name),
          quantity: Number(r.revenue_units),
          value: Number(r.revenue_sales),
          percentage: storeTotal > 0 ? Number(((Number(r.revenue_sales) / storeTotal) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.value - a.value);
      result[store.id] = { categories };
    }
    return result;
  }

  async getCategoryContribution(
    startDate: string,
    endDate: string,
  ): Promise<{ general: Record<string, CategoryBreakdown>; byStore: Record<string, Record<string, CategoryBreakdown>> }> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'smartsale_daily_by_category',
      'category_name',
      ['revenue_units', 'revenue_sales'],
      startDay,
      endDay,
    );
    const byStore: Record<string, Record<string, CategoryBreakdown>> = {};
    for (const store of this.storesById.values()) {
      byStore[store.id] = this.buildCategoryBreakdown(rows.filter((r) => r.store_id === store.id));
    }
    return { general: this.buildCategoryBreakdown(rows), byStore };
  }

  async getTopBrandByCategoryBulk(startDate: string, endDate: string): Promise<Record<string, CategoryBrandRankingResult>> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const result: Record<string, CategoryBrandRankingResult> = {};
    for (const store of this.storesById.values()) {
      result[store.id] = await this.getTopBrandByCategory(store, startDay, endDay);
    }
    return result;
  }

  private async getTopBrandByCategory(store: StoreConfig, startDay: string, endDay: string): Promise<CategoryBrandRankingResult> {
    if (!store.isMultiBrand) {
      return {
        applicable: false,
        reason: `"${store.name}" es una tienda monomarca — el análisis de marca top por categoría no aplica.`,
      };
    }
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'smartsale_daily_by_category_brand',
      ['category_name', 'brand_name'],
      ['units', 'sales'],
      startDay,
      endDay,
      store.id,
    );
    if (rows.length === 0) return { applicable: true, categories: [] };

    const byCategory = new Map<string, { brand: string; quantity: number; value: number }[]>();
    const categoryTotalValue = new Map<string, number>();
    for (const row of rows) {
      const category = String(row.category_name);
      const list = byCategory.get(category) ?? [];
      list.push({ brand: String(row.brand_name), quantity: Number(row.units), value: Number(row.sales) });
      byCategory.set(category, list);
      categoryTotalValue.set(category, (categoryTotalValue.get(category) ?? 0) + Number(row.sales));
    }

    const categories: CategoryBrandTop[] = [];
    for (const [category, brandTotals] of byCategory.entries()) {
      let topBrand = '';
      let topBrandValue = -1;
      let topBrandQuantity = 0;
      for (const entry of brandTotals) {
        if (entry.value > topBrandValue) {
          topBrand = entry.brand;
          topBrandValue = entry.value;
          topBrandQuantity = entry.quantity;
        }
      }
      categories.push({ category, topBrand, quantity: topBrandQuantity, value: topBrandValue });
    }
    categories.sort((a, b) => (categoryTotalValue.get(b.category) ?? 0) - (categoryTotalValue.get(a.category) ?? 0));
    return { applicable: true, categories };
  }

  async getCities(startDate: string, endDate: string): Promise<Record<string, Record<string, CityBreakdown>>> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'smartsale_daily_by_city',
      'city',
      ['revenue_orders', 'revenue_sales'],
      startDay,
      endDay,
    );
    const result: Record<string, Record<string, CityBreakdown>> = {};
    for (const store of this.storesById.values()) {
      const storeRows = rows.filter((r) => r.store_id === store.id);
      const total = storeRows.reduce((acc, r) => acc + Number(r.revenue_sales), 0);
      const byCity: Record<string, CityBreakdown> = {};
      for (const row of storeRows) {
        const count = Number(row.revenue_orders);
        const totalValue = Number(row.revenue_sales);
        if (count === 0 && totalValue === 0) continue;
        byCity[String(row.city)] = { count, totalValue, percentage: total > 0 ? Number(((totalValue / total) * 100).toFixed(2)) : 0 };
      }
      result[store.id] = byCity;
    }
    return result;
  }

  async getSegments(
    startDate: string,
    endDate: string,
  ): Promise<{ sellers: { storeId: string; label: string; orders: number; sales: number }[]; marketplaces: { storeId: string; label: string; orders: number; sales: number }[] }> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const [sellerRows, marketplaceRows] = await Promise.all([
      this.dashboardQueryRepository.queryGrouped(
        'smartsale_daily_by_seller',
        'seller_name',
        ['revenue_orders', 'revenue_sales'],
        startDay,
        endDay,
      ),
      this.dashboardQueryRepository.queryGrouped(
        'smartsale_daily_by_marketplace',
        'marketplace_name',
        ['revenue_orders', 'revenue_sales'],
        startDay,
        endDay,
      ),
    ]);
    return {
      sellers: sellerRows.map((r) => ({
        storeId: String(r.store_id),
        label: String(r.seller_name),
        orders: Number(r.revenue_orders),
        sales: Number(r.revenue_sales),
      })),
      marketplaces: marketplaceRows.map((r) => ({
        storeId: String(r.store_id),
        label: String(r.marketplace_name),
        orders: Number(r.revenue_orders),
        sales: Number(r.revenue_sales),
      })),
    };
  }

  /** Igual regla que `ProductAnalyticsService.buildDistribution` — buckets ya vienen sparse (solo los que se aplicaron). */
  private buildDistribution(rows: Record<string, string | number>[]): DiscountDistribution {
    const counts = new Map<number, number>();
    for (const row of rows) {
      const bucket = Number(row.discount_percentage ?? 0);
      counts.set(bucket, (counts.get(bucket) ?? 0) + Number(row.units));
    }
    const buckets = Array.from(counts.entries())
      .map(([bucket, count]) => ({ bucket, count }))
      .sort((a, b) => a.bucket - b.bucket);

    let topBucket: number | null = null;
    let topCount = -1;
    for (const entry of buckets) {
      if (entry.count > topCount) {
        topCount = entry.count;
        topBucket = entry.bucket;
      }
    }
    const totalItems = buckets.reduce((acc, b) => acc + b.count, 0);
    return { buckets, topBucket, totalItems };
  }

  private buildCategoryBreakdown(rows: Record<string, string | number>[]): Record<string, CategoryBreakdown> {
    const totals = new Map<string, { quantity: number; value: number }>();
    let grandTotal = 0;
    for (const row of rows) {
      const category = String(row.category_name);
      const quantity = Number(row.revenue_units);
      const value = Number(row.revenue_sales);
      const current = totals.get(category) ?? { quantity: 0, value: 0 };
      current.quantity += quantity;
      current.value += value;
      totals.set(category, current);
      grandTotal += value;
    }
    const result: Record<string, CategoryBreakdown> = {};
    for (const [category, t] of totals.entries()) {
      result[category] = { quantity: t.quantity, value: t.value, percentage: grandTotal > 0 ? Number(((t.value / grandTotal) * 100).toFixed(2)) : 0 };
    }
    return result;
  }

  private toDayRange(startDate: string, endDate: string): { startDay: string; endDay: string } {
    return { startDay: toDayBucketColombia(normalizeStartDate(startDate)), endDay: toDayBucketColombia(normalizeEndDate(endDate)) };
  }
}

/** `prior === null` cuando no hay mes anterior en la serie (primer punto — sin histórico, siempre el primer mes real). */
function classifyMonthlyGrowth(
  current: number,
  prior: number | null,
  thresholds: GrowthThresholds,
): { growthPercent: number | null; status: GrowthStatus } {
  if (prior === null) return { growthPercent: null, status: 'no-data' };
  if (prior === 0) return { growthPercent: null, status: current > 0 ? 'new' : 'no-data' };
  const growthPercent = ((current - prior) / prior) * 100;
  const status: GrowthStatus =
    growthPercent >= thresholds.greenMinPercent ? 'green' : growthPercent <= thresholds.redMaxPercent ? 'red' : 'yellow';
  return { growthPercent, status };
}
