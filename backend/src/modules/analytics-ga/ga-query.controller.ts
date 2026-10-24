import { Controller, Get, Post, Query, ValidationPipe } from '@nestjs/common';

import { SyncLogsRepository } from '../database/repositories/sync-logs.repository';
import { OrdersQueryDto } from '../orders/dto/orders-query.dto';
import { ResyncQueryDto } from '../orders/dto/resync-query.dto';
import { GaQueryDto } from './ga-query.dto';
import { GaQueryService } from './ga-query.service';
import { GaSyncService } from './ga-sync.service';

/**
 * Endpoints de lectura del módulo GA4 — prefijo propio `api/analytics/ga`
 * (no `api/analytics` a secas, ya muy ocupado por descuentos/tendencias/
 * SmartSale) para que quede claro a simple vista qué pertenece a este
 * módulo, tanto en logs como en Network tab.
 */
@Controller('api/analytics/ga')
export class GaQueryController {
  constructor(
    private readonly gaQueryService: GaQueryService,
    private readonly gaSyncService: GaSyncService,
    private readonly syncLogsRepository: SyncLogsRepository,
  ) {}

  /**
   * GET /api/analytics/ga/sync-status
   *
   * Última corrida de GA4 por tienda (`sync_logs`, fuente `'ga4_api'`) —
   * el cron normal depende de `GaSyncCronService.maybeSync()` (cada
   * `GA_SYNC_CRON_HOURS`, encadenado al final de cada tick de VTEX). Este
   * endpoint deja ver esa frescura desde el frontend, igual que
   * `GET /api/sync/status` para VTEX.
   */
  @Get('sync-status')
  getSyncStatus() {
    return this.syncLogsRepository.getLatestStatusByStore('ga4_api');
  }

  /**
   * POST /api/analytics/ga/resync?startDate=2026-10-14&endDate=2026-10-23
   *
   * Dispara EN VIVO (sin esperar el cooldown de `GaSyncCronService`) una
   * sincronización de GA4 para el rango dado, las 6 tiendas — vía de
   * escape manual para cuando el cron no corrió a tiempo o una corrida
   * anterior falló (ver `GaSyncService.syncAllStores`, que ya atrapa sus
   * propios errores por tienda y los deja en `sync_logs`, nunca relanza).
   * Síncrono a propósito, mismo criterio que `POST /api/sync/resync` de
   * VTEX: quien lo dispara quiere saber si terminó. GA4 no tiene
   * enriquecimiento por orden (solo reportes agregados de la API), así
   * que no hace falta trocear en bloques ni exponer progreso — tarda
   * segundos, no minutos.
   */
  @Post('resync')
  async resync(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ResyncQueryDto,
  ): Promise<{ ok: true }> {
    ResyncQueryDto.assertRange(query.startDate, query.endDate);
    await this.gaSyncService.syncAllStores(query.startDate, query.endDate);
    return { ok: true };
  }

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

  /** GET /api/analytics/ga/campaigns?startDate&endDate&storeId */
  @Get('campaigns')
  getCampaigns(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: GaQueryDto) {
    OrdersQueryDto.assertRange(query.startDate, query.endDate);
    return this.gaQueryService.getCampaigns(query.startDate, query.endDate, query.storeId);
  }
}
