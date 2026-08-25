import { Module } from '@nestjs/common';

import { VtexModule } from '../vtex/vtex.module';
import { StorageModule } from '../storage/storage.module';
import { HistoricalSyncService } from './services/historical-sync.service';
import { LiveQueryDedupeCache } from './services/live-query-dedupe.cache';
import { NightlySyncScheduler } from './services/nightly-sync.scheduler';
import { OrderCityEnrichmentService } from './services/order-city-enrichment.service';

@Module({
  imports: [VtexModule, StorageModule],
  providers: [HistoricalSyncService, NightlySyncScheduler, LiveQueryDedupeCache, OrderCityEnrichmentService],
  exports: [HistoricalSyncService, OrderCityEnrichmentService],
})
export class SyncModule {}
