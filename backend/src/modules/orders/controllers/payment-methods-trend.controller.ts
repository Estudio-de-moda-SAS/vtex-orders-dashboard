import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { ProductAnalyticsQueryDto } from '../dto/product-analytics-query.dto';
import { PaymentMethodsTrendQueryDto } from '../dto/payment-methods-trend-query.dto';
import { PaymentMethodsTrendService } from '../services/payment-methods-trend.service';

/**
 * Endpoint del módulo `/metodos-pago` — participación de cada método de
 * pago mes a mes. `storeId` opcional (ver `PaymentMethodsTrendQueryDto`):
 * sin él, todas las tiendas combinadas.
 */
@Controller('api/analytics')
export class PaymentMethodsTrendController {
  constructor(private readonly paymentMethodsTrendService: PaymentMethodsTrendService) {}

  /** GET /api/analytics/payment-methods-trend?startDate=...&endDate=...&storeId=pilatos */
  @Get('payment-methods-trend')
  getTrend(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: PaymentMethodsTrendQueryDto,
  ) {
    ProductAnalyticsQueryDto.assertRange(query.startDate, query.endDate);
    return this.paymentMethodsTrendService.getTrend(query.startDate, query.endDate, query.storeId);
  }
}
