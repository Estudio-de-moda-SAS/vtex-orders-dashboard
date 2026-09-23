import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { CampaignComboQueryDto } from '../dto/campaign-combo-query.dto';
import { ProductAnalyticsQueryDto } from '../dto/product-analytics-query.dto';
import { ProductAnalyticsService } from '../services/product-analytics.service';

/**
 * Endpoints de analítica de producto (descuento, categoría, marca),
 * calculados a partir de `order_items` (ver `OrderCityEnrichmentService`
 * para cómo se puebla y `ProductAnalyticsService` para el cálculo). Los
 * cuatro reciben solo `startDate`/`endDate` — ninguno recibe `storeId`:
 * todos retornan el desglose de TODAS las tiendas de una sola vez
 * (global + por tienda), para que el frontend no tenga que hacer una
 * llamada HTTP por cada una de las 6 tiendas en cada carga de página.
 */
@Controller('api/analytics')
export class ProductAnalyticsController {
  constructor(private readonly productAnalyticsService: ProductAnalyticsService) {}

  /** GET /api/analytics/discounts?startDate=...&endDate=... */
  @Get('discounts')
  getDiscounts(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ProductAnalyticsQueryDto,
  ) {
    ProductAnalyticsQueryDto.assertRange(query.startDate, query.endDate);
    return this.productAnalyticsService.getDiscountAnalyticsBulk(query.startDate, query.endDate);
  }

  /**
   * GET /api/analytics/categories?startDate=...&endDate=...
   *
   * Ranking de categorías por tienda (todos los ítems, sin filtrar por
   * status) — usado por `StoreCard` para "Categoría top".
   */
  @Get('categories')
  getCategories(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ProductAnalyticsQueryDto,
  ) {
    ProductAnalyticsQueryDto.assertRange(query.startDate, query.endDate);
    return this.productAnalyticsService.getTopCategoryBulk(query.startDate, query.endDate);
  }

  /**
   * GET /api/analytics/category-contribution?startDate=...&endDate=...
   *
   * Aporte de cada categoría sobre el total de ventas CONTABILIZADAS
   * (distinto de `categories`: aquí solo cuentan las órdenes
   * contabilizadas, para que la suma coincida con "valor contabilizado")
   * — usado por el recuadro "Aporte general por categoría" y su filtro.
   */
  @Get('category-contribution')
  getCategoryContribution(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ProductAnalyticsQueryDto,
  ) {
    ProductAnalyticsQueryDto.assertRange(query.startDate, query.endDate);
    return this.productAnalyticsService.getCategoryRevenueBreakdownBulk(query.startDate, query.endDate);
  }

  /**
   * GET /api/analytics/category-brands?startDate=...&endDate=...
   *
   * Para cada tienda, si es multimarca: la marca top dentro de cada
   * categoría. Si no lo es: `{ applicable: false, reason }` explícito.
   */
  @Get('category-brands')
  getCategoryBrands(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ProductAnalyticsQueryDto,
  ) {
    ProductAnalyticsQueryDto.assertRange(query.startDate, query.endDate);
    return this.productAnalyticsService.getTopBrandByCategoryBulk(query.startDate, query.endDate);
  }

  /**
   * GET /api/analytics/store-highlights?startDate=...&endDate=...
   *
   * Para cada tienda: campaña de descuento más usada y estado de venta
   * contabilizado más común, en el rango pedido — recuadro aparte, no
   * dentro de las tarjetas de tienda.
   */
  @Get('store-highlights')
  getStoreHighlights(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ProductAnalyticsQueryDto,
  ) {
    ProductAnalyticsQueryDto.assertRange(query.startDate, query.endDate);
    return this.productAnalyticsService.getStoreHighlightsBulk(query.startDate, query.endDate);
  }

  /**
   * GET /api/analytics/campaign-combo-total?startDate=...&endDate=...&campaigns=["A","B"]
   *
   * Total REAL (órdenes/venta contabilizada) de las campañas pedidas, por
   * tienda — SIN doble conteo cuando una orden calificó para varias de
   * ellas a la vez. `campaigns` es un arreglo JSON codificado en un solo
   * parámetro (ver `CampaignComboQueryDto` para por qué no es una lista
   * separada por comas ni un parámetro repetido).
   */
  @Get('campaign-combo-total')
  getCampaignComboTotal(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: CampaignComboQueryDto,
  ) {
    CampaignComboQueryDto.assertRange(query.startDate, query.endDate);
    return this.productAnalyticsService.getCampaignComboTotal(query.startDate, query.endDate, query.parseCampaigns());
  }
}
