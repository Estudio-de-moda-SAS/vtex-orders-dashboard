import { Controller, Get, Post, Query, ValidationPipe } from '@nestjs/common';

import { SyncLogsRepository } from '../../database/repositories/sync-logs.repository';
import { VtexSyncCronService } from '../../sync/services/vtex-sync-cron.service';
import { ResyncQueryDto } from '../dto/resync-query.dto';

/**
 * GET /api/sync/status
 *
 * Última corrida del cron de sincronización VTEX por tienda — el cron es
 * la fuente normal de frescura, y corre solo cada `SYNC_CRON_INTERVAL_HOURS`.
 */
@Controller('api/sync')
export class SyncStatusController {
  constructor(
    private readonly syncLogsRepository: SyncLogsRepository,
    private readonly vtexSyncCronService: VtexSyncCronService,
  ) {}

  @Get('status')
  async getStatus() {
    return this.syncLogsRepository.getLatestStatusByStore();
  }

  /**
   * POST /api/sync/resync?startDate=2026-09-17&endDate=2026-09-23
   *
   * Recalcula EN VIVO (todas las tiendas, mismo comportamiento que el
   * cron — reemplaza, no suma) el rango de fechas dado. Vía de escape
   * manual para el caso confirmado en producción donde el propio buscador
   * de órdenes de VTEX es inestable en el límite entre páginas y puede
   * dar un conteo distinto entre corridas de la MISMA ventana histórica
   * (ver `VtexOrdersService.isWindowClosed`) — permite reintentar sin
   * depender de una corrida de terminal. Síncrono a propósito: quien lo
   * dispara quiere saber si terminó, no un job en segundo plano opaco.
   */
  @Post('resync')
  async resync(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ResyncQueryDto,
  ): Promise<{ ok: true }> {
    ResyncQueryDto.assertRange(query.startDate, query.endDate);
    await this.vtexSyncCronService.runBackfillForRange(query.startDate, query.endDate);
    return { ok: true };
  }
}
