import { matchRevenueStatusDefinition } from '../utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../config/revenue-status.config';
import { getSmartSaleCampaignIds } from '../../config/smartsale.config';
import {
  DailyAggregationResult,
  EnrichedOrder,
  SalesDailyByBrandDiscountBucketRow,
  SalesDailyByBrandRow,
  SalesDailyByCampaignComboRow,
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
  SmartSaleByCategoryBrandRow,
  SmartSaleByCategoryRow,
  SmartSaleByCityRow,
  SmartSaleByDiscountBucketRow,
  SmartSaleByDiscountCampaignRow,
  SmartSaleByMarketplaceRow,
  SmartSaleByPersonRow,
  SmartSaleBySellerRow,
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
  const realOrdersByDay = countRealOrdersByDay(orders, revenueDefinitions);
  const smartSaleCampaignIds = new Set(getSmartSaleCampaignIds());

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
  const byCampaignCombo = new Map<string, SalesDailyByCampaignComboRow>();
  const byDiscountBucket = new Map<string, SalesDailyByDiscountBucketRow>();
  const byBrandDiscountBucket = new Map<string, SalesDailyByBrandDiscountBucketRow>();
  const bySeller = new Map<string, SalesDailyBySellerRow>();
  const byMarketplace = new Map<string, SalesDailyByMarketplaceRow>();

  // Canal SmartSale (ver `config/smartsale.config.ts`) — tablas paralelas,
  // solo se llenan para órdenes cuyo `utmiCampaign` es uno de los
  // vendedores configurados (ver `isSmartSale` dentro del loop).
  const smartSaleByPerson = new Map<string, SmartSaleByPersonRow>();
  const smartSaleByDiscountBucket = new Map<string, SmartSaleByDiscountBucketRow>();
  const smartSaleByDiscountCampaign = new Map<string, SmartSaleByDiscountCampaignRow>();
  const smartSaleByCategory = new Map<string, SmartSaleByCategoryRow>();
  const smartSaleByCategoryBrand = new Map<string, SmartSaleByCategoryBrandRow>();
  const smartSaleByCity = new Map<string, SmartSaleByCityRow>();
  const smartSaleBySeller = new Map<string, SmartSaleBySellerRow>();
  const smartSaleByMarketplace = new Map<string, SmartSaleByMarketplaceRow>();

  for (const order of orders) {
    const { date, storeId } = { date: order.dayBucket, storeId: order.storeId };
    const isRevenue = matchRevenueStatusDefinition(order, revenueDefinitions) !== undefined;
    const isSmartSale = order.utmiCampaign !== null && smartSaleCampaignIds.has(order.utmiCampaign);
    const units = order.items.reduce((acc, item) => acc + item.quantity, 0);

    // smartsale_daily_by_person (a nivel de ORDEN completa — un pedido
    // tiene UN solo utmiCampaign, a diferencia de las campañas de
    // descuento, así que no hay riesgo de doble conteo acá).
    if (isSmartSale) {
      const personKey = `${date}::${storeId}::${order.utmiCampaign}`;
      const personRow =
        smartSaleByPerson.get(personKey) ??
        { date, storeId, utmiCampaign: order.utmiCampaign as string, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
      personRow.orders += 1;
      personRow.sales += order.totalValue;
      if (isRevenue) {
        personRow.revenueOrders += 1;
        personRow.revenueSales += order.totalValue;
      }
      smartSaleByPerson.set(personKey, personRow);
    }
    const discounts = order.items.reduce(
      (acc, item) => acc + (item.listPrice - item.sellingPrice) * item.quantity,
      0,
    );

    // sales_daily (base, sin revenue_*)
    const dailyKey = `${date}::${storeId}`;
    const daily =
      salesDaily.get(dailyKey) ??
      { date, storeId, orders: 0, units: 0, sales: 0, discounts: 0, realOrders: 0, realRevenueOrders: 0 };
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

    if (isSmartSale) {
      const ssCityKey = `${date}::${storeId}::${order.city}`;
      const ssCityRow =
        smartSaleByCity.get(ssCityKey) ??
        { date, storeId, city: order.city, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
      ssCityRow.orders += 1;
      ssCityRow.sales += order.totalValue;
      if (isRevenue) {
        ssCityRow.revenueOrders += 1;
        ssCityRow.revenueSales += order.totalValue;
      }
      smartSaleByCity.set(ssCityKey, ssCityRow);
    }

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

    if (isSmartSale) {
      const ssCampaignNames = order.discountCampaignNames.length === 0 ? [NO_CAMPAIGN_LABEL] : order.discountCampaignNames;
      for (const campaignName of ssCampaignNames) {
        const key = `${date}::${storeId}::${campaignName}`;
        const row =
          smartSaleByDiscountCampaign.get(key) ??
          { date, storeId, campaignName, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
        row.orders += 1;
        row.sales += order.totalValue;
        if (isRevenue) {
          row.revenueOrders += 1;
          row.revenueSales += order.totalValue;
        }
        smartSaleByDiscountCampaign.set(key, row);
      }
    }

    // sales_daily_by_campaign_combo: a diferencia de arriba (una fila por
    // CADA campaña individual, con el traslape ya documentado), acá cada
    // orden aporta a UNA sola fila — la de su combinación EXACTA de
    // campañas (ordenadas para que el mismo conjunto siempre produzca la
    // misma clave, sin importar el orden en que VTEX las haya listado).
    // Esto permite calcular el total REAL de un conjunto de campañas
    // elegidas (`campaign_names && seleccionadas` en SQL) sin doble
    // conteo, algo que sumar `byDiscountCampaign` no puede garantizar.
    const comboNames = [...order.discountCampaignNames].sort((a, b) => a.localeCompare(b, 'es'));
    const comboKey = comboNames.length === 0 ? NO_CAMPAIGN_LABEL : comboNames.join('||');
    const comboMapKey = `${date}::${storeId}::${comboKey}`;
    const comboRow =
      byCampaignCombo.get(comboMapKey) ??
      { date, storeId, comboKey, campaignNames: comboNames, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
    comboRow.orders += 1;
    comboRow.sales += order.totalValue;
    if (isRevenue) {
      comboRow.revenueOrders += 1;
      comboRow.revenueSales += order.totalValue;
    }
    byCampaignCombo.set(comboMapKey, comboRow);

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

      if (isSmartSale) {
        const ssRow =
          smartSaleBySeller.get(key) ??
          { date, storeId, sellerName: order.sellerLabel, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
        ssRow.orders += 1;
        ssRow.sales += order.totalValue;
        if (isRevenue) {
          ssRow.revenueOrders += 1;
          ssRow.revenueSales += order.totalValue;
        }
        smartSaleBySeller.set(key, ssRow);
      }
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

      if (isSmartSale) {
        const ssRow =
          smartSaleByMarketplace.get(key) ??
          { date, storeId, marketplaceName: order.marketplaceLabel, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
        ssRow.orders += 1;
        ssRow.sales += order.totalValue;
        if (isRevenue) {
          ssRow.revenueOrders += 1;
          ssRow.revenueSales += order.totalValue;
        }
        smartSaleByMarketplace.set(key, ssRow);
      }
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

      if (isSmartSale) {
        const ssCategoryRow =
          smartSaleByCategory.get(categoryKey) ??
          { date, storeId, categoryName: item.category, units: 0, sales: 0, revenueUnits: 0, revenueSales: 0 };
        ssCategoryRow.units += item.quantity;
        ssCategoryRow.sales += itemValue;
        if (isRevenue) {
          ssCategoryRow.revenueUnits += item.quantity;
          ssCategoryRow.revenueSales += itemValue;
        }
        smartSaleByCategory.set(categoryKey, ssCategoryRow);
      }

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

        if (isSmartSale) {
          const ssCategoryBrandRow =
            smartSaleByCategoryBrand.get(categoryBrandKey) ??
            { date, storeId, categoryName: item.category, brandName: item.brand, units: 0, sales: 0 };
          ssCategoryBrandRow.units += item.quantity;
          ssCategoryBrandRow.sales += itemValue;
          smartSaleByCategoryBrand.set(categoryBrandKey, ssCategoryBrandRow);
        }

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

      if (isSmartSale) {
        const ssBucketRow =
          smartSaleByDiscountBucket.get(bucketKey) ??
          { date, storeId, discountPercentage: item.discountPercentage, units: 0, sales: 0 };
        ssBucketRow.units += item.quantity;
        ssBucketRow.sales += itemValue;
        smartSaleByDiscountBucket.set(bucketKey, ssBucketRow);
      }
    }
  }

  for (const daily of salesDaily.values()) {
    const counts = realOrdersByDay.get(`${daily.date}::${daily.storeId}`);
    daily.realOrders = counts?.orders ?? 0;
    daily.realRevenueOrders = counts?.revenueOrders ?? 0;
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
    byCampaignCombo: Array.from(byCampaignCombo.values()),
    byDiscountBucket: Array.from(byDiscountBucket.values()),
    byBrandDiscountBucket: Array.from(byBrandDiscountBucket.values()),
    bySeller: Array.from(bySeller.values()),
    byMarketplace: Array.from(byMarketplace.values()),
    smartSaleByPerson: Array.from(smartSaleByPerson.values()),
    smartSaleByDiscountBucket: Array.from(smartSaleByDiscountBucket.values()),
    smartSaleByDiscountCampaign: Array.from(smartSaleByDiscountCampaign.values()),
    smartSaleByCategory: Array.from(smartSaleByCategory.values()),
    smartSaleByCategoryBrand: Array.from(smartSaleByCategoryBrand.values()),
    smartSaleByCity: Array.from(smartSaleByCity.values()),
    smartSaleBySeller: Array.from(smartSaleBySeller.values()),
    smartSaleByMarketplace: Array.from(smartSaleByMarketplace.values()),
  };
}

/**
 * VTEX parte una misma compra en varias órdenes cuando sus productos se
 * despachan por separado (ej. bodegas o sellers distintos) — comparten el
 * mismo número base y solo difieren en el sufijo final (`-01`, `-02`...).
 * El pago se hace una sola vez por la compra COMPLETA al inicio; el
 * desglose en fragmentos ocurre después, por logística — así que si
 * CUALQUIER fragmento cae en un estado "contabilizado", la compra
 * completa se cuenta como una venta real. Quita solo el ÚLTIMO sufijo
 * numérico (con o sin guion de por medio en el resto del id, ej.
 * "DDD-1661985538153-01" → "DDD-1661985538153") — un id sin ese sufijo
 * queda como su propia clave (no se agrupa con nada).
 */
function extractOrderBaseId(orderId: string): string {
  const match = orderId.match(/^(.+)-\d+$/);
  return match ? match[1] : orderId;
}

/**
 * "Compras reales" — ver `extractOrderBaseId`. Agrupa las órdenes del
 * lote por (tienda, número base), asigna cada grupo al día CALENDARIO
 * MÁS TEMPRANO entre sus fragmentos (el momento en que se hizo la
 * compra), y cuenta cuántos grupos distintos hay por día — tanto en
 * total como los que calificaron como venta contabilizada (basta con que
 * UN fragmento del grupo haya contado). Deliberadamente NO reemplaza
 * `orders`/`revenueOrders` en ninguna otra tabla — es un número aparte,
 * solo para la card de cada tienda (ver `StoreDashboardData.realOrders`).
 */
function countRealOrdersByDay(
  orders: EnrichedOrder[],
  revenueDefinitions: ReturnType<typeof getRevenueStatusDefinitions>,
): Map<string, { orders: number; revenueOrders: number }> {
  interface PurchaseGroup {
    dayBucket: string;
    storeId: string;
    isRevenue: boolean;
  }
  const groups = new Map<string, PurchaseGroup>();

  for (const order of orders) {
    const baseId = extractOrderBaseId(order.orderId);
    const key = `${order.storeId}::${baseId}`;
    const isRevenue = matchRevenueStatusDefinition(order, revenueDefinitions) !== undefined;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { dayBucket: order.dayBucket, storeId: order.storeId, isRevenue });
    } else {
      if (order.dayBucket < existing.dayBucket) existing.dayBucket = order.dayBucket;
      if (isRevenue) existing.isRevenue = true;
    }
  }

  const byDay = new Map<string, { orders: number; revenueOrders: number }>();
  for (const group of groups.values()) {
    const dayKey = `${group.dayBucket}::${group.storeId}`;
    const acc = byDay.get(dayKey) ?? { orders: 0, revenueOrders: 0 };
    acc.orders += 1;
    if (group.isRevenue) acc.revenueOrders += 1;
    byDay.set(dayKey, acc);
  }
  return byDay;
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
