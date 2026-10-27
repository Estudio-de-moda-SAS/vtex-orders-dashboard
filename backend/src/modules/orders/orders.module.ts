import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PosSalesModule } from '../pos-sales/pos-sales.module';
import { SyncModule } from '../sync/sync.module';
import { OrdersController } from './controllers/orders.controller';
import { PaymentMethodsTrendController } from './controllers/payment-methods-trend.controller';
import { PilatosMixController } from './controllers/pilatos-mix.controller';
import { ProductAnalyticsController } from './controllers/product-analytics.controller';
import { SmartSaleController } from './controllers/smartsale.controller';
import { SyncStatusController } from './controllers/sync-status.controller';
import { TrendsController } from './controllers/trends.controller';
import { OrdersAnalyticsService } from './services/orders-analytics.service';
import { OrdersService } from './services/orders.service';
import { PaymentMethodsTrendService } from './services/payment-methods-trend.service';
import { PilatosMixService } from './services/pilatos-mix.service';
import { ProductAnalyticsService } from './services/product-analytics.service';
import { SmartSaleCombinedService } from './services/smartsale-combined.service';
import { SmartSaleService } from './services/smartsale.service';
import { TrendsService } from './services/trends.service';

/**
 * Importa `SyncModule` para que `OrdersService` pueda usar
 * `VtexSyncCronService.fetchOnDemand` cuando el dashboard pide un rango
 * con días que todavía no existen en Supabase (ver comentario de clase en
 * `OrdersService`) — sigue siendo la ÚNICA vía por la que el dashboard
 * toca VTEX, y solo para esos días puntuales faltantes.
 */
@Module({
  imports: [DatabaseModule, SyncModule, PosSalesModule],
  controllers: [
    OrdersController,
    SyncStatusController,
    ProductAnalyticsController,
    TrendsController,
    PilatosMixController,
    SmartSaleController,
    PaymentMethodsTrendController,
  ],
  providers: [
    OrdersService,
    OrdersAnalyticsService,
    ProductAnalyticsService,
    TrendsService,
    PilatosMixService,
    SmartSaleService,
    SmartSaleCombinedService,
    PaymentMethodsTrendService,
  ],
  /**
   * `SmartSaleService`/`SmartSaleCombinedService`: los reutiliza
   * `AssistantModule` para `get_smartsale_sales` (VTEX+POS combinado, ver
   * `AssistantSmartSaleService`). `ProductAnalyticsService`: lo reutiliza
   * para `search_campaign` (`getCampaignComboTotal`).
   */
  exports: [SmartSaleService, SmartSaleCombinedService, ProductAnalyticsService],
})
export class OrdersModule {}
