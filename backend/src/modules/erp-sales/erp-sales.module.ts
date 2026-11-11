import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ErpSalesClientService } from './erp-sales-client.service';
import { ErpSalesQueryController } from './erp-sales-query.controller';
import { ErpSalesQueryService } from './erp-sales-query.service';
import { ErpSalesSyncService } from './erp-sales-sync.service';

/**
 * Ventas ERP (facturas e-commerce, API "Conní") — mismo criterio que
 * `PosSalesModule`/`CreditNotesModule`: el sync solo corre desde
 * `cli/erp-sales-sync.ts` o `cli/daily-sync.ts` en una máquina con VPN,
 * nunca desde el backend desplegado.
 */
@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [ErpSalesQueryController],
  providers: [ErpSalesClientService, ErpSalesSyncService, ErpSalesQueryService],
  exports: [ErpSalesClientService, ErpSalesSyncService, ErpSalesQueryService],
})
export class ErpSalesModule {}
