import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PosSalesClientService } from './pos-sales-client.service';
import { PosSalesQueryController } from './pos-sales-query.controller';
import { PosSalesQueryService } from './pos-sales-query.service';
import { PosSalesSyncService } from './pos-sales-sync.service';

/**
 * Ventas POS del canal SmartSale (API "Conní" del ERP) — desacoplado de
 * `OrdersModule`/VTEX a propósito, mismo criterio que `CreditNotesModule`.
 * `PosSalesSyncService` se exporta para que `cli/pos-sales-sync.ts` lo use
 * directo — nunca se dispara desde un cron del backend desplegado (no
 * tiene cómo alcanzar la VPN de la compañía, ver `PosSalesClientService`).
 */
@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [PosSalesQueryController],
  providers: [PosSalesClientService, PosSalesSyncService, PosSalesQueryService],
  exports: [PosSalesClientService, PosSalesSyncService, PosSalesQueryService],
})
export class PosSalesModule {}
