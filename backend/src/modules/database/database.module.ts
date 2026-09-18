import { Module } from '@nestjs/common';

import { pgPoolProvider } from './pg-pool.provider';
import { DashboardQueryRepository } from './repositories/dashboard-query.repository';
import { ReferenceRepository } from './repositories/reference.repository';
import { SalesAggregatesRepository } from './repositories/sales-aggregates.repository';
import { StoresRepository } from './repositories/stores.repository';
import { SyncLogsRepository } from './repositories/sync-logs.repository';

/**
 * Capa de persistencia en Supabase (Postgres) — reemplaza por completo al
 * viejo `StorageModule` (SQLite). No guarda órdenes crudas: solo los
 * agregados diarios pre-calculados por el cron/importador (ver
 * `sales-aggregates.repository.ts`) y tablas de referencia chicas
 * (categoría/marca/colección).
 */
@Module({
  providers: [
    pgPoolProvider,
    StoresRepository,
    SalesAggregatesRepository,
    ReferenceRepository,
    SyncLogsRepository,
    DashboardQueryRepository,
  ],
  exports: [
    pgPoolProvider,
    StoresRepository,
    SalesAggregatesRepository,
    ReferenceRepository,
    SyncLogsRepository,
    DashboardQueryRepository,
  ],
})
export class DatabaseModule {}
