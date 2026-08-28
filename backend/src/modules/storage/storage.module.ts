import { Module } from '@nestjs/common';

import { DatabaseService } from './database.service';
import { OrderItemsRepository } from './repositories/order-items.repository';
import { OrdersCacheRepository } from './repositories/orders-cache.repository';
import { SyncJobsRepository } from './repositories/sync-jobs.repository';
import { SyncWatermarkRepository } from './repositories/sync-watermark.repository';

/**
 * Capa de persistencia local (SQLite) usada como caché histórico de
 * órdenes VTEX. No es una base de datos "de negocio" ni reemplaza a
 * VTEX como sistema de verdad — solo evita volver a pedirle a VTEX
 * información histórica que ya no cambia. Ver README para el diseño
 * completo (ventana de inmutabilidad, watermarks por día, jobs de
 * sincronización en segundo plano).
 */
@Module({
  providers: [
    DatabaseService,
    OrdersCacheRepository,
    OrderItemsRepository,
    SyncWatermarkRepository,
    SyncJobsRepository,
  ],
  exports: [
    DatabaseService,
    OrdersCacheRepository,
    OrderItemsRepository,
    SyncWatermarkRepository,
    SyncJobsRepository,
  ],
})
export class StorageModule {}
