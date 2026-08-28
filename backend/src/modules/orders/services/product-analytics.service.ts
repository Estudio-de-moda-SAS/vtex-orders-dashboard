import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia } from '../../../common/utils/date-range.util';
import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { getStoresConfig, StoreConfig } from '../../../config/stores.config';
import { OrderItemsRepository, OrderItemWithStatus } from '../../storage/repositories/order-items.repository';
import {
  CategoryBrandRankingResult,
  CategoryBrandTop,
  CategoryBreakdown,
  CategoryRankingResult,
  DiscountAnalyticsResponse,
  DiscountDistribution,
} from '../interfaces/product-analytics.interface';

/**
 * Calcula indicadores a nivel de PRODUCTO (descuento, categoría, marca) a
 * partir de `order_items` — separado de `OrdersAnalyticsService`, que
 * trabaja a nivel de orden completa. No conoce nada de HTTP ni de VTEX,
 * solo lee lo que `OrderCityEnrichmentService` ya dejó guardado.
 */
@Injectable()
export class ProductAnalyticsService {
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();
  private readonly storesById = new Map(getStoresConfig().map((store) => [store.id, store]));

  constructor(private readonly orderItemsRepository: OrderItemsRepository) {}

  /**
   * Distribución de descuentos (agrupada por bucket de 5 puntos) a nivel
   * de ÍTEM, no de orden — sobre TODOS los ítems del rango (sin filtrar
   * por status), igual criterio que `getTopCategory`. `storeId` omitido
   * = global, todas las tiendas combinadas.
   */
  getMostAppliedDiscount(startDate: string, endDate: string, storeId?: string): DiscountDistribution {
    return this.computeDiscountDistribution(this.getItems(startDate, endDate, storeId));
  }

  /**
   * Igual que `getMostAppliedDiscount`, pero agrupado por MARCA — y
   * ÚNICAMENTE sobre tiendas multimarca (`isMultiBrand`, hoy solo
   * Pilatos). A propósito NO incluye tiendas monomarca: su "marca" es
   * literalmente la propia tienda (ej. la marca de todo lo que vende
   * Girbaud es "Girbaud"), así que ya está cubierta por
   * `getMostAppliedDiscount`/`byStore` — mezclarla aquí no compara nada
   * nuevo, solo duplica esa misma cifra bajo otro nombre y diluye la
   * comparación real: cuál marca tiene mejor/peor descuento DENTRO del
   * catálogo multimarca de Pilatos.
   *
   * `general` es el mismo criterio pero sin desglosar por marca — el
   * descuento más aplicado combinando TODAS las marcas de las tiendas
   * multimarca. Es un número DISTINTO de `getMostAppliedDiscount()` sin
   * `storeId` (ese es el global de TODA la compañía) — no deben
   * confundirse ni mostrarse como si fueran el mismo dato.
   */
  getMultiBrandDiscountBreakdown(
    startDate: string,
    endDate: string,
  ): { storeNames: string[]; general: DiscountDistribution; byBrand: Record<string, DiscountDistribution> } {
    const multiBrandStores = Array.from(this.storesById.values()).filter((store) => store.isMultiBrand);
    const items = multiBrandStores.flatMap((store) => this.getItems(startDate, endDate, store.id));

    const itemsByBrand = new Map<string, OrderItemWithStatus[]>();
    for (const item of items) {
      const list = itemsByBrand.get(item.brand);
      if (list) {
        list.push(item);
      } else {
        itemsByBrand.set(item.brand, [item]);
      }
    }

    const byBrand: Record<string, DiscountDistribution> = {};
    for (const [brand, brandItems] of itemsByBrand.entries()) {
      byBrand[brand] = this.computeDiscountDistribution(brandItems);
    }

    return {
      storeNames: multiBrandStores.map((store) => store.name),
      general: this.computeDiscountDistribution(items),
      byBrand,
    };
  }

  /** Agrupa ítems por `discount_percentage` (ya redondeado al múltiplo de 5) y determina el bucket con más ocurrencias. */
  private computeDiscountDistribution(items: OrderItemWithStatus[]): DiscountDistribution {
    const counts = new Map<number, number>();
    for (const item of items) {
      counts.set(item.discountPercentage, (counts.get(item.discountPercentage) ?? 0) + 1);
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

    return { buckets, topBucket, totalItems: items.length };
  }

  /**
   * Ranking de categorías de UNA tienda por cantidad y valor vendido —
   * sobre TODOS los ítems del rango (sin filtrar por status). Usado por
   * `StoreCard` para "Categoría top" (el primer elemento del ranking).
   */
  getTopCategory(startDate: string, endDate: string, storeId: string): CategoryRankingResult {
    const items = this.getItems(startDate, endDate, storeId);

    const totals = new Map<string, { quantity: number; value: number }>();
    let storeTotal = 0;
    for (const item of items) {
      const value = item.sellingPrice * item.quantity;
      const current = totals.get(item.category) ?? { quantity: 0, value: 0 };
      current.quantity += item.quantity;
      current.value += value;
      totals.set(item.category, current);
      storeTotal += value;
    }

    const categories = Array.from(totals.entries())
      .map(([category, totalsForCategory]) => ({
        category,
        ...totalsForCategory,
        percentage: storeTotal > 0 ? Number(((totalsForCategory.value / storeTotal) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return { categories };
  }

  /**
   * Aporte de cada categoría sobre el total de ventas CONTABILIZADAS
   * (mismo criterio y misma razón que `cityRevenueBreakdown` en
   * `OrdersAnalyticsService`: para que la suma coincida con "valor
   * contabilizado" y sea comparable). `storeId` omitido = aporte general,
   * todas las tiendas combinadas — usado por el recuadro "Aporte general
   * por categoría" y su filtro en el frontend.
   */
  getCategoryRevenueBreakdown(
    startDate: string,
    endDate: string,
    storeId?: string,
  ): Record<string, CategoryBreakdown> {
    const items = this.getItems(startDate, endDate, storeId).filter((item) => this.isRevenueCounted(item));

    const totals = new Map<string, { quantity: number; value: number }>();
    let grandTotal = 0;

    for (const item of items) {
      const value = item.sellingPrice * item.quantity;
      const current = totals.get(item.category) ?? { quantity: 0, value: 0 };
      current.quantity += item.quantity;
      current.value += value;
      totals.set(item.category, current);
      grandTotal += value;
    }

    const result: Record<string, CategoryBreakdown> = {};
    for (const [category, totalsForCategory] of totals.entries()) {
      result[category] = {
        quantity: totalsForCategory.quantity,
        value: totalsForCategory.value,
        percentage: grandTotal > 0 ? Number(((totalsForCategory.value / grandTotal) * 100).toFixed(2)) : 0,
      };
    }
    return result;
  }

  /**
   * Para cada categoría, la marca que más vendió DENTRO de ella (no un
   * ranking de marcas suelto) — sobre TODOS los ítems del rango (sin
   * filtrar por status), ordenado de la categoría con más ventas totales
   * hacia la de menos. SOLO aplica a tiendas multimarca (`isMultiBrand`);
   * para cualquier otra retorna `{ applicable: false, reason }` explícito,
   * nunca una lista vacía sin explicación.
   */
  getTopBrandByCategory(startDate: string, endDate: string, storeId: string): CategoryBrandRankingResult {
    const store = this.storesById.get(storeId);
    if (!store) {
      return { applicable: false, reason: `La tienda "${storeId}" no existe.` };
    }
    if (!store.isMultiBrand) {
      return {
        applicable: false,
        reason: `"${store.name}" es una tienda monomarca (vende únicamente su propia marca) — el análisis de marca top por categoría no aplica.`,
      };
    }

    const items = this.getItems(startDate, endDate, storeId);

    // category -> brand -> {quantity, value}, más el valor total por
    // categoría (usado solo para el orden final del resultado).
    const byCategory = new Map<string, Map<string, { quantity: number; value: number }>>();
    const categoryTotalValue = new Map<string, number>();

    for (const item of items) {
      const value = item.sellingPrice * item.quantity;

      let brandTotals = byCategory.get(item.category);
      if (!brandTotals) {
        brandTotals = new Map();
        byCategory.set(item.category, brandTotals);
      }
      const current = brandTotals.get(item.brand) ?? { quantity: 0, value: 0 };
      current.quantity += item.quantity;
      current.value += value;
      brandTotals.set(item.brand, current);

      categoryTotalValue.set(item.category, (categoryTotalValue.get(item.category) ?? 0) + value);
    }

    const categories: CategoryBrandTop[] = [];
    for (const [category, brandTotals] of byCategory.entries()) {
      let topBrand = '';
      let topBrandValue = -1;
      let topBrandQuantity = 0;
      for (const [brand, totals] of brandTotals.entries()) {
        if (totals.value > topBrandValue) {
          topBrand = brand;
          topBrandValue = totals.value;
          topBrandQuantity = totals.quantity;
        }
      }
      categories.push({ category, topBrand, quantity: topBrandQuantity, value: topBrandValue });
    }

    categories.sort((a, b) => (categoryTotalValue.get(b.category) ?? 0) - (categoryTotalValue.get(a.category) ?? 0));

    return { applicable: true, categories };
  }

  /**
   * Igual que `getMostAppliedDiscount`, pero retorna el global (todas las
   * tiendas), el desglose por tienda Y el desglose por marca en una sola
   * llamada — usado por `GET /api/analytics/discounts`, para que el
   * frontend no tenga que hacer una petición separada por cada tienda ni
   * por cada marca en cada carga de página.
   */
  getDiscountAnalyticsBulk(startDate: string, endDate: string): DiscountAnalyticsResponse {
    const byStore: Record<string, DiscountDistribution> = {};
    for (const store of this.storesById.values()) {
      byStore[store.id] = this.getMostAppliedDiscount(startDate, endDate, store.id);
    }
    return {
      global: this.getMostAppliedDiscount(startDate, endDate),
      byStore,
      multiBrand: this.getMultiBrandDiscountBreakdown(startDate, endDate),
    };
  }

  /** Igual que `getTopCategory`, pero para las 6 tiendas de una sola vez — usado por `GET /api/analytics/categories`. */
  getTopCategoryBulk(startDate: string, endDate: string): Record<string, CategoryRankingResult> {
    const result: Record<string, CategoryRankingResult> = {};
    for (const store of this.storesById.values()) {
      result[store.id] = this.getTopCategory(startDate, endDate, store.id);
    }
    return result;
  }

  /**
   * Igual que `getCategoryRevenueBreakdown`, pero retorna el aporte
   * general (todas las tiendas) JUNTO con el desglose de cada tienda
   * individual en una sola llamada — usado por
   * `GET /api/analytics/category-contribution`.
   */
  getCategoryRevenueBreakdownBulk(
    startDate: string,
    endDate: string,
  ): { general: Record<string, CategoryBreakdown>; byStore: Record<string, Record<string, CategoryBreakdown>> } {
    const byStore: Record<string, Record<string, CategoryBreakdown>> = {};
    for (const store of this.storesById.values()) {
      byStore[store.id] = this.getCategoryRevenueBreakdown(startDate, endDate, store.id);
    }
    return { general: this.getCategoryRevenueBreakdown(startDate, endDate), byStore };
  }

  /** Igual que `getTopBrandByCategory`, pero para las 6 tiendas de una sola vez — usado por `GET /api/analytics/category-brands`. */
  getTopBrandByCategoryBulk(startDate: string, endDate: string): Record<string, CategoryBrandRankingResult> {
    const result: Record<string, CategoryBrandRankingResult> = {};
    for (const store of this.storesById.values()) {
      result[store.id] = this.getTopBrandByCategory(startDate, endDate, store.id);
    }
    return result;
  }

  private getItems(startDate: string, endDate: string, storeId?: string): OrderItemWithStatus[] {
    const startIso = normalizeStartDate(startDate);
    const endIso = normalizeEndDate(endDate);
    const startDay = toDayBucketColombia(startIso);
    const endDay = toDayBucketColombia(endIso);
    return this.orderItemsRepository.getItemsWithOrderStatus(startDay, endDay, storeId);
  }

  private isRevenueCounted(item: OrderItemWithStatus): boolean {
    return (
      matchRevenueStatusDefinition(
        { status: item.orderStatus, statusDescription: item.orderStatusDescription },
        this.revenueStatusDefinitions,
      ) !== undefined
    );
  }
}
