import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { SyncModule } from '../sync/sync.module';
import { VtexModule } from '../vtex/vtex.module';
import { OrdersController } from './controllers/orders.controller';
import { SyncStatusController } from './controllers/sync-status.controller';
import { OrdersAnalyticsService } from './services/orders-analytics.service';
import { OrdersService } from './services/orders.service';

@Module({
  imports: [VtexModule, SyncModule, StorageModule],
  controllers: [OrdersController, SyncStatusController],
  providers: [OrdersService, OrdersAnalyticsService],
})
export class OrdersModule {}
