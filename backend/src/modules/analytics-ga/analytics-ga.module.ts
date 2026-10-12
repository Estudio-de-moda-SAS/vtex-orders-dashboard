import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { GaClientService } from './ga-client.service';
import { GaQueryController } from './ga-query.controller';
import { GaQueryService } from './ga-query.service';
import { GaSyncCronService } from './ga-sync-cron.service';
import { GaSyncService } from './ga-sync.service';
import { VtexCatalogLinkService } from './vtex-catalog-link.service';

/**
 * Módulo GA4 (fase 1) — sincronización de Google Analytics Data API a
 * Supabase + lectura SQL pura para el frontend. Se importa desde
 * `AppModule` Y desde `sync.module.ts` (`VtexSyncCronService` necesita
 * `GaSyncCronService` para disparar GA al final de su propio tick, ver
 * `ga-sync-cron.service.ts`) — desacoplado del dominio VTEX/`OrdersModule`
 * a propósito. `HttpModule` es solo para `VtexCatalogLinkService` (API
 * PÚBLICA de catálogo de VTEX, no la API de órdenes autenticada) — mismo
 * patrón que `VtexModule` con `VtexOrdersService`, sin acoplar este módulo
 * a `OrdersModule`/`VtexModule`.
 */
@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [GaQueryController],
  providers: [GaClientService, GaSyncService, GaSyncCronService, GaQueryService, VtexCatalogLinkService],
  exports: [GaClientService, GaSyncService, GaSyncCronService, VtexCatalogLinkService],
})
export class AnalyticsGaModule {}
