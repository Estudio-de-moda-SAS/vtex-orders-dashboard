import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { CampaignComboQueryDto } from '../dto/campaign-combo-query.dto';
import { SmartSaleQueryDto } from '../dto/smartsale-query.dto';
import { SmartSaleService } from '../services/smartsale.service';

/**
 * Endpoints del canal SmartSale (módulo `/smartsale`) — todos reciben
 * solo `startDate`/`endDate`, igual que `ProductAnalyticsController`.
 * Ver `SmartSaleService` para el detalle de cada cálculo y
 * `config/smartsale.config.ts` para los vendedores configurados.
 */
@Controller('api/analytics/smartsale')
export class SmartSaleController {
  constructor(private readonly smartSaleService: SmartSaleService) {}

  /** GET /api/analytics/smartsale/summary — card de tienda + total del canal + desglose por persona. */
  @Get('summary')
  getSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: SmartSaleQueryDto) {
    SmartSaleQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getSummary(query.startDate, query.endDate);
  }

  /** GET /api/analytics/smartsale/monthly-trend — tendencia de ventas del canal SmartSale (general, todas las tiendas), mes a mes. No recibe fechas: siempre es el año en curso completo. */
  @Get('monthly-trend')
  getMonthlyTrend() {
    return this.smartSaleService.getMonthlyTrend();
  }

  @Get('discounts')
  getDiscounts(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: SmartSaleQueryDto) {
    SmartSaleQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getDiscounts(query.startDate, query.endDate);
  }

  @Get('campaigns')
  getCampaigns(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: SmartSaleQueryDto) {
    SmartSaleQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getCampaigns(query.startDate, query.endDate);
  }

  /**
   * GET /api/analytics/smartsale/campaign-combo-total?startDate=...&endDate=...&campaigns=["A","B"]
   * Total real (sin doble conteo) de las campañas de SmartSale pedidas, por tienda — ver `CampaignComboQueryDto`.
   */
  @Get('campaign-combo-total')
  getCampaignComboTotal(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: CampaignComboQueryDto) {
    CampaignComboQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getCampaignComboTotal(query.startDate, query.endDate, query.parseCampaigns());
  }

  @Get('categories')
  getCategories(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: SmartSaleQueryDto) {
    SmartSaleQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getTopCategoryBulk(query.startDate, query.endDate);
  }

  @Get('category-contribution')
  getCategoryContribution(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: SmartSaleQueryDto) {
    SmartSaleQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getCategoryContribution(query.startDate, query.endDate);
  }

  @Get('category-brands')
  getCategoryBrands(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: SmartSaleQueryDto) {
    SmartSaleQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getTopBrandByCategoryBulk(query.startDate, query.endDate);
  }

  @Get('cities')
  getCities(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: SmartSaleQueryDto) {
    SmartSaleQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getCities(query.startDate, query.endDate);
  }

  @Get('segments')
  getSegments(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: SmartSaleQueryDto) {
    SmartSaleQueryDto.assertRange(query.startDate, query.endDate);
    return this.smartSaleService.getSegments(query.startDate, query.endDate);
  }
}
