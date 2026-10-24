import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { subtractDaysUtc, todayColombia } from '../../common/utils/date-range.util';
import { SyncLogsRepository } from '../database/repositories/sync-logs.repository';
import { GaSyncService } from './ga-sync.service';

/**
 * GA4 NO tiene su propio `setInterval` — `VtexSyncCronService` llama a
 * `maybeSync()` al final de CADA uno de sus propios ticks (boot + cada
 * `SYNC_CRON_INTERVAL_HOURS`), y este servicio decide si ya pasó
 * `GA_SYNC_CRON_HOURS` desde el último INTENTO, consultando `sync_logs`
 * (NO un campo en memoria — un campo en memoria se reinicia en cada
 * restart del proceso, y si los restarts son más frecuentes que el
 * cooldown, GA4 nunca llega a sincronizar; confirmado en producción:
 * 0 filas `ga4_api` en `sync_logs` a pesar de más de 150 ticks de VTEX
 * en un solo día, por reinicios frecuentes del backend). Como SIEMPRE
 * corre después de que el tick de VTEX termina (nunca en paralelo), está
 * garantizado por construcción que los dos crons nunca compiten por
 * memoria al mismo tiempo — sin necesitar un candado propio.
 */
@Injectable()
export class GaSyncCronService {
  private readonly logger = new Logger(GaSyncCronService.name);
  private readonly syncCronHours: number;
  private readonly recalcWindowDays: number;

  constructor(
    private readonly gaSyncService: GaSyncService,
    private readonly syncLogsRepository: SyncLogsRepository,
    private readonly configService: ConfigService,
  ) {
    this.syncCronHours = this.configService.get<number>('app.ga.syncCronHours', 12);
    this.recalcWindowDays = this.configService.get<number>('app.ga.recalcWindowDays', 3);
  }

  /**
   * Llamado por `VtexSyncCronService` al terminar su propio tick (nunca
   * se llama desde ningún otro lugar) — si GA no está configurado
   * (`GaClientService.isConfigured()===false`), `GaSyncService.syncAllStores`
   * ya lo detecta y se sale con un aviso, así que no hace falta chequearlo
   * acá también.
   */
  async maybeSync(): Promise<void> {
    const intervalMs = Math.max(1, this.syncCronHours) * 60 * 60 * 1000;
    const lastAttemptAt = await this.syncLogsRepository.getLastAttemptAt('ga4_api');
    if (lastAttemptAt && Date.now() - lastAttemptAt.getTime() < intervalMs) return;

    const todayDay = todayColombia();
    const startDay = subtractDaysUtc(todayDay, this.recalcWindowDays);
    this.logger.log(`Disparando sincronización de GA4 (ventana ${startDay} → ${todayDay})...`);
    try {
      await this.gaSyncService.syncAllStores(startDay, todayDay);
    } catch (error) {
      // `syncAllStores`/`syncStore` ya atrapan sus propios errores por tienda — este catch es
      // solo una red de seguridad para que un fallo inesperado acá nunca tumbe el tick de VTEX.
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`Falló la corrida de GA4 disparada desde el cron de VTEX: ${message}`);
    }
  }
}
