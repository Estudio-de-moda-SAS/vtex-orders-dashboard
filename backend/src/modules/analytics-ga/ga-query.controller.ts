import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';

import { OrdersQueryDto } from '../orders/dto/orders-query.dto';
import { GaQueryDto } from './ga-query.dto';
import { GaQueryService } from './ga-query.service';

/**
 * Endpoints de lectura del módulo GA4 — prefijo propio `api/analytics/ga`
 * (no `api/analytics` a secas, ya muy ocupado por descuentos/tendencias/
 * SmartSale) para que quede claro a simple vista qué pertenece a este
 * módulo, tanto en logs como en Network tab.
 */
@Controller('api/analytics/ga')
export class GaQueryController {
  constructor(private readonly gaQueryService: GaQueryService) {}

  /** GET /api/analytics/ga/overview?startDate&endDate&storeId */
  @Get('overview')
  getOverview(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: GaQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.gaQueryService.getOverview(query.startDate, query.endDate, query.storeId);
  }

  /** GET /api/analytics/ga/channels?startDate&endDate&storeId */
  @Get('channels')
  getChannels(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: GaQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.gaQueryService.getChannels(query.startDate, query.endDate, query.storeId);
  }

  /** GET /api/analytics/ga/devices?startDate&endDate&storeId */
  @Get('devices')
  getDevices(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: GaQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.gaQueryService.getDevices(query.startDate, query.endDate, query.storeId);
  }

  /** GET /api/analytics/ga/landing-pages?startDate&endDate&storeId */
  @Get('landing-pages')
  getLandingPages(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: GaQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.gaQueryService.getLandingPages(query.startDate, query.endDate, query.storeId);
  }

  /** GET /api/analytics/ga/user-types?startDate&endDate&storeId */
  @Get('user-types')
  getUserTypes(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: GaQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.gaQueryService.getUserTypes(query.startDate, query.endDate, query.storeId);
  }

  /** GET /api/analytics/ga/cities?startDate&endDate&storeId */
  @Get('cities')
  getCities(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: GaQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.gaQueryService.getCities(query.startDate, query.endDate, query.storeId);
  }

  /** GET /api/analytics/ga/products?startDate&endDate&storeId */
  @Get('products')
  getProducts(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: GaQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.gaQueryService.getProducts(query.startDate, query.endDate, query.storeId);
  }
}
