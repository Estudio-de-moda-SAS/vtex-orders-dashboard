import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { subtractDaysUtc, todayColombia } from '../../common/utils/date-range.util';
import { GaSyncService } from './ga-sync.service';

/**
 * GA4 NO tiene su propio `setInterval` — `VtexSyncCronService` llama a
 * `maybeSync()` al final de CADA uno de sus propios ticks (boot + cada
 * `SYNC_CRON_INTERVAL_HOURS`), y este servicio decide si ya pasó
 * `GA_SYNC_CRON_HOURS` desde la última vez. Como SIEMPRE corre después
 * de que el tick de VTEX termina (nunca en paralelo), está garantizado
 * por construcción que los dos crons nunca compiten por memoria al mismo
 * tiempo — sin necesitar un candado propio. Ver "decisiones" en el plan
 * de este módulo.
 */
@Injectable()
export class GaSyncCronService {
  private readonly logger = new Logger(GaSyncCronService.name);
  private readonly syncCronHours: number;
  private readonly recalcWindowDays: number;
  /**
   * `null` = "sincronizar en la próxima oportunidad" (pasa en el primer
   * `maybeSync()` si `GA_SYNC_ON_BOOT=true`). Si es `false`, se inicializa
   * con la hora actual para que el primer `maybeSync()` (que llega justo
   * al boot, vía el tick inicial de VTEX) NO dispare una sincronización
   * inmediata — hay que esperar `syncCronHours` completas desde el arranque.
   */
  private lastSyncAt: number | null;

  constructor(
    private readonly gaSyncService: GaSyncService,
    private readonly configService: ConfigService,
  ) {
    this.syncCronHours = this.configService.get<number>('app.ga.syncCronHours', 12);
    this.recalcWindowDays = this.configService.get<number>('app.ga.recalcWindowDays', 3);
    const syncOnBoot = this.configService.get<boolean>('app.ga.syncOnBoot', false);
    this.lastSyncAt = syncOnBoot ? null : Date.now();
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
    if (this.lastSyncAt !== null && Date.now() - this.lastSyncAt < intervalMs) return;

    this.lastSyncAt = Date.now();
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
