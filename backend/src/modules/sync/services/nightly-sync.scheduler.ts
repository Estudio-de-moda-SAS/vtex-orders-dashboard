import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { getStoresConfig } from '../../../config/stores.config';
import { dayBucketEndIso, dayBucketStartIso, subtractDaysUtc, todayColombia } from '../../../common/utils/date-range.util';
import { buildSourceDefinitions } from '../utils/source-definitions.util';
import { HistoricalSyncService } from './historical-sync.service';

/**
 * Sincronización automática nocturna: cada noche, para cada tienda (y sus
 * segmentos de vendedores/marketplaces), se asegura que el día de ayer
 * (que ya pasó a estar "cerrado" o está por cerrarse) y toda la ventana
 * mutable reciente queden sincronizados en el caché local. Así, cuando
 * alguien abre el dashboard en la mañana, los datos recientes ya están
 * calientes en caché y no hay que esperar ninguna consulta en vivo grande.
 *
 * Esto es ADICIONAL a la sincronización on-demand (que ocurre cuando
 * alguien pide un rango desde el dashboard) — no la reemplaza.
 */
@Injectable()
export class NightlySyncScheduler {
  private readonly logger = new Logger(NightlySyncScheduler.name);

  constructor(
    private readonly historicalSyncService: HistoricalSyncService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Corre todos los días a la hora configurada (`NIGHTLY_SYNC_HOUR`,
   * default 1am, hora del servidor). NestJS Schedule usa expresiones cron
   * estándar: minuto 0 de la hora configurada, todos los días.
   */
  @Cron('0 * * * *') // se evalúa cada hora en punto; internamente se filtra por NIGHTLY_SYNC_HOUR
  async handleHourlyTick(): Promise<void> {
    const targetHour = this.configService.get<number>('app.storage.nightlySyncHour', 1);
    const currentHour = new Date().getUTCHours();
    if (currentHour !== targetHour) return;

    await this.runNightlySync();
  }

  async runNightlySync(): Promise<void> {
    this.logger.log('Iniciando sincronización automática nocturna...');
    const stores = getStoresConfig();
    const immutabilityWindowDays = this.configService.get<number>('app.storage.immutabilityWindowDays', 40);

    // Se refresca desde el inicio de la ventana mutable hasta hoy, para
    // todas las tiendas. Esto cubre tanto "ayer" (que puede estar recién
    // cerrando) como el resto de días que todavía podrían cambiar.
    const startDay = subtractDaysUtc(todayColombia(), immutabilityWindowDays);
    const startIso = dayBucketStartIso(startDay);
    const endIso = dayBucketEndIso(todayColombia());

    for (const store of stores) {
      if (!store.appKey || !store.appToken) continue; // sin credenciales, no hay nada que sincronizar

      try {
        const sources = buildSourceDefinitions(store);
        await this.historicalSyncService.resolveRange(store, sources, startIso, endIso, false);
        this.logger.log(`[${store.id}] Sincronización nocturna completada.`);
      } catch (error) {
        this.logger.error(
          `[${store.id}] Falló la sincronización nocturna: ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
        );
      }
    }

    this.logger.log('Sincronización automática nocturna finalizada.');
  }
}
