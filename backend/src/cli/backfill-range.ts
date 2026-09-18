import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { parseArgs } from 'util';

import configuration from '../config/configuration';
import { SyncModule } from '../modules/sync/sync.module';
import { VtexSyncCronService } from '../modules/sync/services/vtex-sync-cron.service';

/**
 * Backfill manual para un rango de fechas explícito — cierra huecos
 * entre el histórico importado de Excel y la ventana rodante del cron
 * (`SYNC_RECALC_WINDOW_DAYS`), sin que el dashboard tenga que hablarle a
 * VTEX en ningún momento (eso sigue prohibido). Reutiliza EXACTAMENTE la
 * misma lógica que la corrida normal del cron (`VtexSyncCronService`),
 * solo que para el rango indicado en vez de "los últimos N días".
 *
 * Uso:
 *   npm run backfill -- --start=2026-07-01 --end=2026-09-12
 *   npm run backfill -- --start=2026-07-01 --end=2026-09-12 --stores=pilatos,diesel
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), ScheduleModule.forRoot(), SyncModule],
})
class BackfillModule {}

async function main(): Promise<void> {
  // Evita que `onModuleInit` dispare la corrida automática de la ventana
  // reciente (todas las tiendas) en paralelo con el backfill explícito
  // que se pidió acá — competirían por las mismas conexiones globales.
  process.env.SKIP_AUTO_SYNC = 'true';

  const { values } = parseArgs({
    options: { start: { type: 'string' }, end: { type: 'string' }, stores: { type: 'string' } },
  });

  if (!values.start || !values.end) {
    console.error('Uso: npm run backfill -- --start=YYYY-MM-DD --end=YYYY-MM-DD [--stores=pilatos,diesel]');
    process.exitCode = 1;
    return;
  }

  const storeIds = values.stores ? values.stores.split(',').map((s) => s.trim()) : undefined;

  console.log(`Backfill de ${values.start} a ${values.end}${storeIds ? ` (tiendas: ${storeIds.join(', ')})` : ' (todas las tiendas)'}...`);

  const app = await NestFactory.createApplicationContext(BackfillModule);
  try {
    const cronService = app.get(VtexSyncCronService);
    await cronService.runBackfillForRange(values.start, values.end, storeIds);
    console.log('Backfill completo.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Error en el backfill:', error);
  process.exitCode = 1;
});
