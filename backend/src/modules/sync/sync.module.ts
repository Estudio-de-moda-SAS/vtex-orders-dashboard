import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AnalyticsGaModule } from '../analytics-ga/analytics-ga.module';
import { DatabaseModule } from '../database/database.module';
import { VtexModule } from '../vtex/vtex.module';
import { VtexSyncCronService } from './services/vtex-sync-cron.service';

/**
 * Importa `AnalyticsGaModule` para que `VtexSyncCronService` pueda
 * inyectar `GaSyncCronService` (con `@Optional()`) y disparar GA4 al
 * final de cada uno de sus propios ticks — ver `ga-sync-cron.service.ts`
 * para el porqué (así los dos crons nunca compiten por memoria).
 */
@Module({
  imports: [VtexModule, DatabaseModule, AnalyticsGaModule, ScheduleModule],
  providers: [VtexSyncCronService],
  exports: [VtexSyncCronService],
})
export class SyncModule {}
