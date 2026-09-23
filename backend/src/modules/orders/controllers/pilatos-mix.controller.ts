import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { ProductAnalyticsQueryDto } from '../dto/product-analytics-query.dto';
import { PilatosMixService } from '../services/pilatos-mix.service';

/**
 * Endpoint del módulo `/pilatos` (mezcla de venta directa vs.
 * sellers/marketplaces en el tiempo) — exclusivo Pilatos, no recibe
 * `storeId` (a diferencia de los demás endpoints de analítica, este
 * SIEMPRE es sobre Pilatos, la única tienda con sellers/marketplaces
 * configurados).
 */
@Controller('api/analytics')
export class PilatosMixController {
  constructor(private readonly pilatosMixService: PilatosMixService) {}

  /** GET /api/analytics/pilatos-mix?startDate=...&endDate=... */
  @Get('pilatos-mix')
  getMix(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ProductAnalyticsQueryDto,
  ) {
    ProductAnalyticsQueryDto.assertRange(query.startDate, query.endDate);
    return this.pilatosMixService.getMix(query.startDate, query.endDate);
  }
}
