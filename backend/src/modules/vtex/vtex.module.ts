import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { VtexOrdersService } from '../orders/services/vtex-orders.service';

/**
 * Módulo dedicado exclusivamente a `VtexOrdersService` (la comunicación
 * HTTP con VTEX). Se separó de `OrdersModule` para evitar una dependencia
 * circular: `SyncModule` necesita `VtexOrdersService`, y `OrdersModule`
 * necesita `HistoricalSyncService` (de `SyncModule`). Con este módulo
 * intermedio, la dirección de dependencias queda limpia:
 * `VtexModule` ← `SyncModule` ← `OrdersModule`.
 */
@Module({
  imports: [HttpModule],
  providers: [VtexOrdersService],
  exports: [VtexOrdersService],
})
export class VtexModule {}
