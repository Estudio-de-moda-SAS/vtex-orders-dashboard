import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia } from '../../../common/utils/date-range.util';
import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { getStoresConfig, StoreConfig } from '../../../config/stores.config';
import { DashboardQueryRepository } from '../../database/repositories/dashboard-query.repository';
import {
  CampaignBreakdown,
  CategoryBrandRankingResult,
  CategoryBrandTop,
  CategoryBreakdown,
  CategoryRankingResult,
  CollectionBreakdown,
  CollectionCategoryBreakdown,
  DiscountAnalyticsResponse,
  DiscountDistribution,
  StoreHighlight,
} from '../interfaces/product-analytics.interface';

/**
 * Calcula indicadores a nivel de PRODUCTO (descuento, categoría, marca) —
 * ya NO escanea `order_items` fila por fila: lee directamente los
 * agregados diarios ya calculados por el cron/importador
 * (`sales_daily_by_category`/`by_brand`/`by_discount_bucket`/
 * `by_brand_discount_bucket`) y solo hace `SUM`/`GROUP BY` sobre el rango
 * de fechas pedido. Mismos métodos públicos que antes de la migración —
 * el contrato con el frontend no cambia.
 *
 * Nota sobre `DiscountBucket.count`: antes contaba líneas de producto
 * (una por SKU distinto en una orden); como el agregado diario solo
 * guarda unidades totales por bucket (no líneas individuales), aquí
 * `count` representa UNIDADES vendidas con ese % de descuento — una
 * lectura al menos igual de útil para "cuál descuento se aplicó más", y
 * la única posible sin volver a guardar el detalle línea por línea.
 */

/** Mismo literal que `UNKNOWN_COLLECTION` en `vtex-sync-cron.service.ts`/`cli/excel-import/row-mapper.ts`. */
const UNKNOWN_COLLECTION = 'Sin colección';

@Injectable()
export class ProductAnalyticsService {
  private readonly storesById = new Map(getStoresConfig().map((store) => [store.id, store]));
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();

  constructor(private readonly dashboardQueryRepository: DashboardQueryRepository) {}

  /**
   * Para cada tienda: TODAS las campañas de descuento usadas en el rango
   * y TODAS las colecciones con ventas (incluyendo "Sin colección"),
   * cada una con su desglose de categorías — "Sin colección" siempre
   * queda al FINAL de su lista (las demás sí ordenadas de mayor a menor
   * por unidades), porque no es una colección real que tenga sentido
   * destacar primero.
   *
   * Todo (campañas, colecciones, `totals`) usa el mismo criterio de
   * "ventas" que el resto del dashboard: solo estados CONTABILIZADOS
   * (`revenue-status.config.ts`) — antes campañas/colecciones contaban
   * TODAS las órdenes (incluidas canceladas), mientras que las tarjetas
   * de tienda ya solo cuentan ventas contabilizadas, así que los totales
   * no cuadraban entre sí. `totals` se calcula exactamente igual que
   * `OrdersAnalyticsService.buildStoreData` (mismo filtro sobre
   * `sales_daily_by_status`), para que sea comparable 1:1 con lo que
   * muestra la tarjeta de cada tienda.
   */
  async getStoreHighlightsBulk(startDate: string, endDate: string): Promise<Record<string, StoreHighlight>> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);

    const [campaignRows, collectionRows, collectionCategoryRows, statusRows] = await Promise.all([
      this.dashboardQueryRepository.queryGrouped(
        'sales_daily_by_discount_campaign',
        'campaign_name',
        ['revenue_orders', 'revenue_sales'],
        startDay,
        endDay,
      ),
      this.dashboardQueryRepository.queryGrouped(
        'sales_daily_by_collection',
        'collection_name',
        ['revenue_units', 'revenue_sales'],
        startDay,
        endDay,
      ),
      this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_collection_category',
        ['collection_name', 'category_name'],
        ['units', 'sales'],
        startDay,
        endDay,
      ),
      this.dashboardQueryRepository.queryGrouped('sales_daily_by_status', 'status', ['orders', 'sales'], startDay, endDay),
    ]);

    const result: Record<string, StoreHighlight> = {};
    for (const store of this.storesById.values()) {
      const campaigns: CampaignBreakdown[] = campaignRows
        .filter((r) => r.store_id === store.id)
        .map((r) => ({
          campaignName: String(r.campaign_name),
          orders: Number(r.revenue_orders),
          sales: Number(r.revenue_sales),
        }))
        .filter((c) => c.orders > 0)
        .sort((a, b) => b.orders - a.orders);

      const collections: CollectionBreakdown[] = collectionRows
        .filter((r) => r.store_id === store.id)
        .map((r) => {
          const collectionName = String(r.collection_name);
          const categories: CollectionCategoryBreakdown[] = collectionCategoryRows
            .filter((cc) => cc.store_id === store.id && String(cc.collection_name) === collectionName)
            .map((cc) => ({ categoryName: String(cc.category_name), units: Number(cc.units), sales: Number(cc.sales) }))
            .sort((a, b) => b.units - a.units);

          return { collectionName, units: Number(r.revenue_units), sales: Number(r.revenue_sales), categories };
        })
        .sort((a, b) => {
          if (a.collectionName === UNKNOWN_COLLECTION) return 1;
          if (b.collectionName === UNKNOWN_COLLECTION) return -1;
          return b.units - a.units;
        });

      // Mismo cálculo que `OrdersAnalyticsService.computeRevenueTotals` —
      // "ventas" = solo estados contabilizados.
      let revenueOrders = 0;
      let revenueSales = 0;
      for (const row of statusRows) {
        if (row.store_id !== store.id) continue;
        if (!matchRevenueStatusDefinition({ status: String(row.status) }, this.revenueStatusDefinitions)) continue;
        revenueOrders += Number(row.orders);
        revenueSales += Number(row.sales);
      }
      const totalUnits = collections.reduce((acc, c) => acc + c.units, 0);

      result[store.id] = {
        campaigns,
        collections,
        totals: { orders: revenueOrders, units: totalUnits, sales: revenueSales },
      };
    }
    return result;
  }

  async getDiscountAnalyticsBulk(startDate: string, endDate: string): Promise<DiscountAnalyticsResponse> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);

    const bucketRows = await this.dashboardQueryRepository.queryGrouped(
      'sales_daily_by_discount_bucket',
      'discount_percentage',
      ['units'],
      startDay,
      endDay,
    );
    const global = this.buildDistribution(bucketRows);
    const byStore: Record<string, DiscountDistribution> = {};
    for (const store of this.storesById.values()) {
      byStore[store.id] = this.buildDistribution(bucketRows.filter((r) => r.store_id === store.id));
    }

    const multiBrandStores = Array.from(this.storesById.values()).filter((s) => s.isMultiBrand);
    const multiBrand = await this.buildMultiBrandDiscountBreakdown(multiBrandStores, startDay, endDay);

    return { global, byStore, multiBrand };
  }

  /**
   * "Ventas" = solo estados contabilizados (ver nota en
   * `orders-analytics.service.ts`) — usa `revenue_units`/`revenue_sales`,
   * no `units`/`sales` (que cuentan TODAS las órdenes sin importar estado).
   */
  async getTopCategoryBulk(startDate: string, endDate: string): Promise<Record<string, CategoryRankingResult>> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'sales_daily_by_category',
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

  async getCategoryRevenueBreakdownBulk(
    startDate: string,
    endDate: string,
  ): Promise<{ general: Record<string, CategoryBreakdown>; byStore: Record<string, Record<string, CategoryBreakdown>> }> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const rows = await this.dashboardQueryRepository.queryGrouped(
      'sales_daily_by_category',
      'category_name',
      ['revenue_units', 'revenue_sales'],
      startDay,
      endDay,
    );

    const byStore: Record<string, Record<string, CategoryBreakdown>> = {};
    for (const store of this.storesById.values()) {
      byStore[store.id] = this.buildCategoryBreakdown(rows.filter((r) => r.store_id === store.id));
    }
    const general = this.buildCategoryBreakdown(rows);
    return { general, byStore };
  }

  async getTopBrandByCategoryBulk(
    startDate: string,
    endDate: string,
  ): Promise<Record<string, CategoryBrandRankingResult>> {
    const { startDay, endDay } = this.toDayRange(startDate, endDate);
    const result: Record<string, CategoryBrandRankingResult> = {};

    for (const store of this.storesById.values()) {
      result[store.id] = await this.getTopBrandByCategory(store, startDay, endDay);
    }
    return result;
  }

  private async getTopBrandByCategory(
    store: StoreConfig,
    startDay: string,
    endDay: string,
  ): Promise<CategoryBrandRankingResult> {
    if (!store.isMultiBrand) {
      return {
        applicable: false,
        reason: `"${store.name}" es una tienda monomarca (vende únicamente su propia marca) — el análisis de marca top por categoría no aplica.`,
      };
    }

    // Cruce real categoría×marca (sales_daily_by_category_brand) — la
    // marca top DENTRO de cada categoría, no una aproximación global.
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'sales_daily_by_category_brand',
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

  private async buildMultiBrandDiscountBreakdown(
    multiBrandStores: StoreConfig[],
    startDay: string,
    endDay: string,
  ): Promise<{ storeNames: string[]; general: DiscountDistribution; byBrand: Record<string, DiscountDistribution> }> {
    if (multiBrandStores.length === 0) {
      return { storeNames: [], general: { buckets: [], topBucket: null, totalItems: 0 }, byBrand: {} };
    }

    const rows: Record<string, string | number>[] = [];
    for (const store of multiBrandStores) {
      const storeRows = await this.dashboardQueryRepository.queryGrouped(
        'sales_daily_by_brand_discount_bucket',
        'discount_percentage',
        ['units'],
        startDay,
        endDay,
        store.id,
      );
      rows.push(...storeRows);
    }

    const general = this.buildDistribution(rows);

    const byBrandRows: Record<string, Record<string, string | number>[]> = {};
    for (const store of multiBrandStores) {
      const storeBrandRows = await this.dashboardQueryRepository.queryGroupedMulti(
        'sales_daily_by_brand_discount_bucket',
        ['brand_name', 'discount_percentage'],
        ['units'],
        startDay,
        endDay,
        store.id,
      );
      for (const row of storeBrandRows) {
        const brand = String(row.brand_name);
        (byBrandRows[brand] ??= []).push(row);
      }
    }

    const byBrand: Record<string, DiscountDistribution> = {};
    for (const [brand, brandRows] of Object.entries(byBrandRows)) {
      byBrand[brand] = this.buildDistribution(brandRows);
    }

    return { storeNames: multiBrandStores.map((s) => s.name), general, byBrand };
  }

  /**
   * Re-agrupa por `discount_percentage` con un Map (no asume que las
   * filas de entrada ya vengan sin buckets repetidos) — importante porque
   * `buildMultiBrandDiscountBreakdown` concatena filas de VARIAS tiendas
   * multimarca antes de llamar esto, y dos tiendas pueden compartir el
   * mismo bucket.
   */
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
    for (const [category, totals_] of totals.entries()) {
      result[category] = {
        quantity: totals_.quantity,
        value: totals_.value,
        percentage: grandTotal > 0 ? Number(((totals_.value / grandTotal) * 100).toFixed(2)) : 0,
      };
    }
    return result;
  }

  private toDayRange(startDate: string, endDate: string): { startDay: string; endDay: string } {
    return {
      startDay: toDayBucketColombia(normalizeStartDate(startDate)),
      endDay: toDayBucketColombia(normalizeEndDate(endDate)),
    };
  }
}
