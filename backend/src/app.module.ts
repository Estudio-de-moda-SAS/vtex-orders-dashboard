import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from './config/configuration';
import { AnalyticsGaModule } from './modules/analytics-ga/analytics-ga.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CreditNotesModule } from './modules/credit-notes/credit-notes.module';
import { DatabaseModule } from './modules/database/database.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ResumenModule } from './modules/resumen/resumen.module';
import { StoresModule } from './modules/stores/stores.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    // `SyncModule` también importa `AnalyticsGaModule` (para que `VtexSyncCronService`
    // dispare GA al final de su tick, ver `ga-sync-cron.service.ts`) — se
    // importa ACÁ también, explícito, para que quede claro desde la raíz
    // de la app que `GaQueryController` existe, sin tener que rastrear la
    // dependencia a través de `SyncModule` (NestJS lo singleton-iza igual).
    AnalyticsGaModule,
    SyncModule,
    CatalogModule,
    OrdersModule,
    ResumenModule,
    StoresModule,
    BudgetsModule,
    CreditNotesModule,
  ],
})
export class AppModule {}
