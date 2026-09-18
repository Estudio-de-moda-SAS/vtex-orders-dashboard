import { matchRevenueStatusDefinition } from '../utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../config/revenue-status.config';
import {
  DailyAggregationResult,
  EnrichedOrder,
  SalesDailyByBrandDiscountBucketRow,
  SalesDailyByBrandRow,
  SalesDailyByCategoryBrandRow,
  SalesDailyByCategoryRow,
  SalesDailyByCityRow,
  SalesDailyByCollectionCategoryRow,
  SalesDailyByCollectionRow,
  SalesDailyByDiscountBucketRow,
  SalesDailyByDiscountCampaignRow,
  SalesDailyByMarketplaceRow,
  SalesDailyByPaymentRow,
  SalesDailyBySellerRow,
  SalesDailyByStatusRow,
  SalesDailyRow,
} from './types';

const UNKNOWN_PAYMENT_LABEL = 'Otro';
const NO_CAMPAIGN_LABEL = 'Sin campaña';

/**
 * Función pura: dado un lote de órdenes ya enriquecidas (ciudad,
 * categoría, marca, colección y descuento ya resueltos — ver
 * `EnrichedOrder`) de UNA tienda, produce las filas agregadas de las 11
 * tablas de `sales_daily*`, agrupadas por día calendario de Colombia
 * (`order.dayBucket`). No conoce nada de VTEX, Excel ni Postgres — la usan
 * tanto el cron (`vtex-sync-cron.service.ts`) como el importador de Excel
 * (`cli/import-historical-orders.ts`), para que ambas fuentes apliquen
 * EXACTAMENTE las mismas reglas de negocio.
 *
 * Clasificación de revenue ("contabilizado"): reutiliza
 * `revenue-status.util.ts`/`revenue-status.config.ts`, igual que el
 * dashboard anterior. Se aplica en `sales_daily_by_status` (que ya tiene
 * la granularidad de status necesaria) y en las tablas de desglose que sí
 * llevan columnas `revenue_*` (payment/city/category/brand/collection/
 * seller/marketplace) — la tabla base `sales_daily` NO lleva estas
 * columnas, ver nota en la migración.
 */
export function aggregateDailyRows(orders: EnrichedOrder[], isMultiBrand: boolean): DailyAggregationResult {
  const revenueDefinitions = getRevenueStatusDefinitions();

  const salesDaily = new Map<string, SalesDailyRow>();
  const byStatus = new Map<string, SalesDailyByStatusRow>();
  const byPayment = new Map<string, SalesDailyByPaymentRow>();
  const byCity = new Map<string, SalesDailyByCityRow>();
  const byCategory = new Map<string, SalesDailyByCategoryRow>();
  const byBrand = new Map<string, SalesDailyByBrandRow>();
  const byCategoryBrand = new Map<string, SalesDailyByCategoryBrandRow>();
  const byCollectionCategory = new Map<string, SalesDailyByCollectionCategoryRow>();
  const byCollection = new Map<string, SalesDailyByCollectionRow>();
  const byDiscountCampaign = new Map<string, SalesDailyByDiscountCampaignRow>();
  const byDiscountBucket = new Map<string, SalesDailyByDiscountBucketRow>();
  const byBrandDiscountBucket = new Map<string, SalesDailyByBrandDiscountBucketRow>();
  const bySeller = new Map<string, SalesDailyBySellerRow>();
  const byMarketplace = new Map<string, SalesDailyByMarketplaceRow>();

  for (const order of orders) {
    const { date, storeId } = { date: order.dayBucket, storeId: order.storeId };
    const isRevenue = matchRevenueStatusDefinition(order, revenueDefinitions) !== undefined;
    const units = order.items.reduce((acc, item) => acc + item.quantity, 0);
    const discounts = order.items.reduce(
      (acc, item) => acc + (item.listPrice - item.sellingPrice) * item.quantity,
      0,
    );

    // sales_daily (base, sin revenue_*)
    const dailyKey = `${date}::${storeId}`;
    const daily = salesDaily.get(dailyKey) ?? { date, storeId, orders: 0, units: 0, sales: 0, discounts: 0 };
    daily.orders += 1;
    daily.units += units;
    daily.sales += order.totalValue;
    daily.discounts += Math.max(0, discounts);
    salesDaily.set(dailyKey, daily);

    // sales_daily_by_status
    const status = order.status || 'unknown';
    const statusKey = `${date}::${storeId}::${status}`;
    const statusRow = byStatus.get(statusKey) ?? { date, storeId, status, orders: 0, sales: 0 };
    statusRow.orders += 1;
    statusRow.sales += order.totalValue;
    byStatus.set(statusKey, statusRow);

    // sales_daily_by_payment (una orden puede mencionar varios métodos separados por coma)
    const paymentMethods = splitPaymentMethods(order.paymentNames);
    for (const method of paymentMethods) {
      const key = `${date}::${storeId}::${method}`;
      const row =
        byPayment.get(key) ?? { date, storeId, paymentMethod: method, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
      row.orders += 1;
      row.sales += order.totalValue;
      if (isRevenue) {
        row.revenueOrders += 1;
        row.revenueSales += order.totalValue;
      }
      byPayment.set(key, row);
    }

    // sales_daily_by_city
    const cityKey = `${date}::${storeId}::${order.city}`;
    const cityRow =
      byCity.get(cityKey) ?? { date, storeId, city: order.city, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
    cityRow.orders += 1;
    cityRow.sales += order.totalValue;
    if (isRevenue) {
      cityRow.revenueOrders += 1;
      cityRow.revenueSales += order.totalValue;
    }
    byCity.set(cityKey, cityRow);

    // sales_daily_by_discount_campaign (a nivel de ORDEN completa, no de
    // producto). Una orden puede calificar para VARIOS beneficios a la
    // vez (ej. un % de descuento + una regla de envío gratis + un tope
    // de flete, los tres simultáneos) — cada uno se cuenta por separado
    // a propósito, así que sumar TODAS las campañas de una tienda puede
    // superar su total de órdenes: no es un error, es que una misma
    // orden aporta a más de una fila. "Sin campaña" (órdenes que no
    // calificaron para ningún beneficio) se agrega para que se pueda ver
    // ese universo también, aunque tampoco hace que la suma total cierre
    // exacto contra el total de la tienda, por la razón anterior.
    if (order.discountCampaignNames.length === 0) {
      const key = `${date}::${storeId}::${NO_CAMPAIGN_LABEL}`;
      const row =
        byDiscountCampaign.get(key) ??
        { date, storeId, campaignName: NO_CAMPAIGN_LABEL, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
      row.orders += 1;
      row.sales += order.totalValue;
      if (isRevenue) {
        row.revenueOrders += 1;
        row.revenueSales += order.totalValue;
      }
      byDiscountCampaign.set(key, row);
    }
    for (const campaignName of order.discountCampaignNames) {
      const key = `${date}::${storeId}::${campaignName}`;
      const row =
        byDiscountCampaign.get(key) ??
        { date, storeId, campaignName, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
      row.orders += 1;
      row.sales += order.totalValue;
      if (isRevenue) {
        row.revenueOrders += 1;
        row.revenueSales += order.totalValue;
      }
      byDiscountCampaign.set(key, row);
    }

    // sales_daily_by_seller / sales_daily_by_marketplace (a nivel de ORDEN completa)
    if (order.sellerLabel) {
      const key = `${date}::${storeId}::${order.sellerLabel}`;
      const row =
        bySeller.get(key) ?? { date, storeId, sellerName: order.sellerLabel, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
      row.orders += 1;
      row.sales += order.totalValue;
      if (isRevenue) {
        row.revenueOrders += 1;
        row.revenueSales += order.totalValue;
      }
      bySeller.set(key, row);
    }
    if (order.marketplaceLabel) {
      const key = `${date}::${storeId}::${order.marketplaceLabel}`;
      const row =
        byMarketplace.get(key) ??
        { date, storeId, marketplaceName: order.marketplaceLabel, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
      row.orders += 1;
      row.sales += order.totalValue;
      if (isRevenue) {
        row.revenueOrders += 1;
        row.revenueSales += order.totalValue;
      }
      byMarketplace.set(key, row);
    }

    // Desgloses a nivel de PRODUCTO (categoría/marca/colección/descuento):
    // cada ítem aporta a su propia categoría/colección, nunca toda la
    // orden a una sola — ver Parte 7 de la migración.
    for (const item of order.items) {
      const itemValue = item.sellingPrice * item.quantity;

      const categoryKey = `${date}::${storeId}::${item.category}`;
      const categoryRow =
        byCategory.get(categoryKey) ??
        { date, storeId, categoryName: item.category, units: 0, sales: 0, revenueUnits: 0, revenueSales: 0 };
      categoryRow.units += item.quantity;
      categoryRow.sales += itemValue;
      if (isRevenue) {
        categoryRow.revenueUnits += item.quantity;
        categoryRow.revenueSales += itemValue;
      }
      byCategory.set(categoryKey, categoryRow);

      if (isMultiBrand) {
        const brandKey = `${date}::${storeId}::${item.brand}`;
        const brandRow =
          byBrand.get(brandKey) ??
          { date, storeId, brandName: item.brand, units: 0, sales: 0, revenueUnits: 0, revenueSales: 0 };
        brandRow.units += item.quantity;
        brandRow.sales += itemValue;
        if (isRevenue) {
          brandRow.revenueUnits += item.quantity;
          brandRow.revenueSales += itemValue;
        }
        byBrand.set(brandKey, brandRow);

        const categoryBrandKey = `${date}::${storeId}::${item.category}::${item.brand}`;
        const categoryBrandRow =
          byCategoryBrand.get(categoryBrandKey) ??
          { date, storeId, categoryName: item.category, brandName: item.brand, units: 0, sales: 0 };
        categoryBrandRow.units += item.quantity;
        categoryBrandRow.sales += itemValue;
        byCategoryBrand.set(categoryBrandKey, categoryBrandRow);

        const brandBucketKey = `${date}::${storeId}::${item.brand}::${item.discountPercentage}`;
        const brandBucketRow =
          byBrandDiscountBucket.get(brandBucketKey) ??
          { date, storeId, brandName: item.brand, discountPercentage: item.discountPercentage, units: 0, sales: 0 };
        brandBucketRow.units += item.quantity;
        brandBucketRow.sales += itemValue;
        byBrandDiscountBucket.set(brandBucketKey, brandBucketRow);
      }

      const collectionKey = `${date}::${storeId}::${item.collectionName}`;
      const collectionRow =
        byCollection.get(collectionKey) ??
        { date, storeId, collectionName: item.collectionName, units: 0, sales: 0, revenueUnits: 0, revenueSales: 0 };
      collectionRow.units += item.quantity;
      collectionRow.sales += itemValue;
      if (isRevenue) {
        collectionRow.revenueUnits += item.quantity;
        collectionRow.revenueSales += itemValue;
      }
      byCollection.set(collectionKey, collectionRow);

      // sales_daily_by_collection_category (ej. "Rack" x "Camisetas") —
      // aplica a TODAS las tiendas (no solo multimarca, a diferencia del
      // cruce categoría×marca): toda tienda tiene colecciones (Línea/
      // Rack/Outlet/Saldos) y categorías de producto.
      const collectionCategoryKey = `${date}::${storeId}::${item.collectionName}::${item.category}`;
      const collectionCategoryRow =
        byCollectionCategory.get(collectionCategoryKey) ??
        { date, storeId, collectionName: item.collectionName, categoryName: item.category, units: 0, sales: 0 };
      collectionCategoryRow.units += item.quantity;
      collectionCategoryRow.sales += itemValue;
      byCollectionCategory.set(collectionCategoryKey, collectionCategoryRow);

      const bucketKey = `${date}::${storeId}::${item.discountPercentage}`;
      const bucketRow =
        byDiscountBucket.get(bucketKey) ??
        { date, storeId, discountPercentage: item.discountPercentage, units: 0, sales: 0 };
      bucketRow.units += item.quantity;
      bucketRow.sales += itemValue;
      byDiscountBucket.set(bucketKey, bucketRow);
    }
  }

  return {
    salesDaily: Array.from(salesDaily.values()),
    byStatus: Array.from(byStatus.values()),
    byPayment: Array.from(byPayment.values()),
    byCity: Array.from(byCity.values()),
    byCategory: Array.from(byCategory.values()),
    byBrand: Array.from(byBrand.values()),
    byCategoryBrand: Array.from(byCategoryBrand.values()),
    byCollectionCategory: Array.from(byCollectionCategory.values()),
    byCollection: Array.from(byCollection.values()),
    byDiscountCampaign: Array.from(byDiscountCampaign.values()),
    byDiscountBucket: Array.from(byDiscountBucket.values()),
    byBrandDiscountBucket: Array.from(byBrandDiscountBucket.values()),
    bySeller: Array.from(bySeller.values()),
    byMarketplace: Array.from(byMarketplace.values()),
  };
}

/**
 * Igual regla que el dashboard anterior
 * (`OrdersAnalyticsService.groupByPaymentMethod`): VTEX puede reportar
 * varios medios de pago separados por coma (ej. "Visa, Voucher") — la
 * orden se cuenta en cada uno, sin inflar el conteo de órdenes en otras
 * tablas. Sin ningún medio reportado, cae en "Otro".
 */
function splitPaymentMethods(paymentNames: string | null | undefined): string[] {
  const trimmed = (paymentNames ?? '').trim();
  if (!trimmed) return [UNKNOWN_PAYMENT_LABEL];
  const methods = trimmed
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return methods.length > 0 ? methods : [UNKNOWN_PAYMENT_LABEL];
}
