import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { OrdersQueryDto } from '../orders/dto/orders-query.dto';
import { ErpSalesQueryService } from './erp-sales-query.service';

/** Lectura de ventas ERP (pestaña "Presupuesto y ventas ERP" de `/presupuesto`) — SQL puro, nunca llama al ERP en vivo. */
@Controller('api/erp-sales')
export class ErpSalesQueryController {
  constructor(private readonly erpSalesQueryService: ErpSalesQueryService) {}

  /** GET /api/erp-sales/summary?startDate&endDate */
  @Get('summary')
  getSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: OrdersQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.erpSalesQueryService.getSummary(query.startDate, query.endDate);
  }

  /** GET /api/erp-sales/margin-summary?startDate&endDate — margen y utilidad e-commerce por marca ("Resumen" de `/presupuesto`). */
  @Get('margin-summary')
  getMarginSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: OrdersQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.erpSalesQueryService.getMarginSummary(query.startDate, query.endDate);
  }

  /** GET /api/erp-sales/marketplace-summary?startDate&endDate — margen por marketplace ("Resumen" de `/presupuesto`). */
  @Get('marketplace-summary')
  getMarketplaceSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: OrdersQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.erpSalesQueryService.getMarketplaceSummary(query.startDate, query.endDate);
  }

  /** GET /api/erp-sales/smartsale-summary?startDate&endDate — pestaña "Ventas ERP" de `/smartsale` (vendedores 082P/168A). */
  @Get('smartsale-summary')
  getSmartSaleSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: OrdersQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.erpSalesQueryService.getSmartSaleSummary(query.startDate, query.endDate);
  }
}
