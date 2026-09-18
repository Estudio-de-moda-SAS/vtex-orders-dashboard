import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from '../database/database.module';
import { VtexModule } from '../vtex/vtex.module';
import { VtexSyncCronService } from './services/vtex-sync-cron.service';

@Module({
  imports: [VtexModule, DatabaseModule, ScheduleModule],
  providers: [VtexSyncCronService],
  exports: [VtexSyncCronService],
})
export class SyncModule {}
