import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { OrdersQueryDto } from '../orders/dto/orders-query.dto';
import { PosSalesQueryDto } from './pos-sales-query.dto';
import { PosSalesQueryService } from './pos-sales-query.service';

/** Endpoint de lectura de ventas POS (pestaña "Ventas POS" de `/smartsale`) — lectura SQL pura, nunca llama a la API del ERP en vivo. */
@Controller('api/pos-sales')
export class PosSalesQueryController {
  constructor(private readonly posSalesQueryService: PosSalesQueryService) {}

  /** GET /api/pos-sales/summary?startDate&endDate&storeId */
  @Get('summary')
  getSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: PosSalesQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.posSalesQueryService.getSummary(query.startDate, query.endDate, query.storeId);
  }
}
