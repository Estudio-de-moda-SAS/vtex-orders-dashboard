import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ResumenController } from './resumen.controller';
import { ResumenService } from './resumen.service';

/**
 * `/resumen` — semáforo de ventas + motor del cambio + mensaje
 * automático. Lee `sales_daily*` Y `ga_daily*`, así que no encaja limpio
 * en `OrdersModule` ni en `AnalyticsGaModule` — módulo propio y
 * desacoplado (mismo criterio que `AnalyticsGaModule`), solo depende de
 * `DatabaseModule` (`DashboardQueryRepository` es 100% genérico por
 * nombre de tabla, no hace falta ninguna otra dependencia).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ResumenController],
  providers: [ResumenService],
})
export class ResumenModule {}
