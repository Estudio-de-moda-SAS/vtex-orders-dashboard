import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from '../database/database.module';
import { VtexModule } from '../vtex/vtex.module';
import { CatalogController } from './catalog.controller';
import { CatalogCronService } from './services/catalog-cron.service';
import { CategoryTreeService } from './services/category-tree.service';
import { CollectionSyncService } from './services/collection-sync.service';

@Module({
  imports: [VtexModule, DatabaseModule, ScheduleModule],
  controllers: [CatalogController],
  providers: [CategoryTreeService, CollectionSyncService, CatalogCronService],
  exports: [CategoryTreeService, CollectionSyncService],
})
export class CatalogModule {}
