import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { SyncModule } from '../sync/sync.module';
import { OrdersController } from './controllers/orders.controller';
import { ProductAnalyticsController } from './controllers/product-analytics.controller';
import { SyncStatusController } from './controllers/sync-status.controller';
import { OrdersAnalyticsService } from './services/orders-analytics.service';
import { OrdersService } from './services/orders.service';
import { ProductAnalyticsService } from './services/product-analytics.service';

/**
 * Importa `SyncModule` para que `OrdersService` pueda usar
 * `VtexSyncCronService.fetchOnDemand` cuando el dashboard pide un rango
 * con días que todavía no existen en Supabase (ver comentario de clase en
 * `OrdersService`) — sigue siendo la ÚNICA vía por la que el dashboard
 * toca VTEX, y solo para esos días puntuales faltantes.
 */
@Module({
  imports: [DatabaseModule, SyncModule],
  controllers: [OrdersController, SyncStatusController, ProductAnalyticsController],
  providers: [OrdersService, OrdersAnalyticsService, ProductAnalyticsService],
})
export class OrdersModule {}
