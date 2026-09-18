import { Controller, Get } from '@nestjs/common';

import { SyncLogsRepository } from '../../database/repositories/sync-logs.repository';

/**
 * GET /api/sync/status
 *
 * Última corrida del cron de sincronización VTEX por tienda — reemplaza
 * al viejo modelo de `sync_jobs`/enriquecimiento por petición (ya no
 * existe: el cron es la única fuente de frescura, y corre solo, sin que
 * ningún endpoint lo dispare).
 */
@Controller('api/sync')
export class SyncStatusController {
  constructor(private readonly syncLogsRepository: SyncLogsRepository) {}

  @Get('status')
  async getStatus() {
    return this.syncLogsRepository.getLatestStatusByStore();
  }
}
