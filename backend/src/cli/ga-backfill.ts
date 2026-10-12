import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';

import { addDaysUtc } from '../common/utils/date-range.util';
import configuration from '../config/configuration';
import { getStoresConfig } from '../config/stores.config';
import { AnalyticsGaModule } from '../modules/analytics-ga/analytics-ga.module';
import { GaSyncService } from '../modules/analytics-ga/ga-sync.service';

/**
 * Backfill manual de Google Analytics 4 — calco de `cli/backfill-range.ts`
 * (mismo bootstrap descartable, mismo `SKIP_AUTO_SYNC`), pero contra
 * `AnalyticsGaModule` en vez de `SyncModule`: proceso totalmente aparte,
 * no interactúa con el cron combinado VTEX+GA del backend en ejecución.
 *
 * Trocea el rango en bloques de ~1 mes, tienda por tienda, EN SECUENCIA
 * (igual restricción de memoria que el cron) — y al final imprime cuántos
 * días reales vinieron vs. cuántos se rellenaron en cero por tienda, para
 * saber cuánto histórico entrega realmente cada propiedad GA4 sin asumir
 * un límite de antemano.
 *
 * Uso:
 *   npm run ga:backfill -- --from=2026-01-01 --to=2026-10-01
 *   npm run ga:backfill -- --from=2026-01-01 --to=2026-10-01 --store=pilatos
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), AnalyticsGaModule],
})
class GaBackfillModule {}

function lastDayOfMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-').map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yyyyMm}-${String(day).padStart(2, '0')}`;
}

/** Parte `[from, to]` en tramos de ~1 mes calendario (el primero y el último pueden quedar más cortos). */
function splitIntoMonthChunks(from: string, to: string): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  let cursor = from;
  while (cursor <= to) {
    const monthEnd = lastDayOfMonth(cursor.slice(0, 7));
    const chunkEnd = monthEnd < to ? monthEnd : to;
    chunks.push({ start: cursor, end: chunkEnd });
    cursor = addDaysUtc(chunkEnd, 1);
  }
  return chunks;
}

async function main(): Promise<void> {
  // Evita que, si este proceso llegara a compartir módulo con el cron
  // automático en algún refactor futuro, dispare una corrida en paralelo.
  process.env.SKIP_AUTO_SYNC = 'true';

  const { values } = parseArgs({
    options: { from: { type: 'string' }, to: { type: 'string' }, store: { type: 'string' } },
  });

  if (!values.from || !values.to) {
    console.error('Uso: npm run ga:backfill -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--store=pilatos]');
    process.exitCode = 1;
    return;
  }

  const stores = getStoresConfig().filter((store) => store.gaPropertyId && (!values.store || store.id === values.store));
  if (stores.length === 0) {
    console.error('Ninguna tienda coincide (revisa --store y que GA_PROPERTY_ID_* esté configurado).');
    process.exitCode = 1;
    return;
  }

  const chunks = splitIntoMonthChunks(values.from, values.to);
  console.log(`Backfill GA4 de ${values.from} a ${values.to}, ${chunks.length} bloque(s) mensual(es), tiendas: ${stores.map((s) => s.id).join(', ')}`);

  const app = await NestFactory.createApplicationContext(GaBackfillModule);
  try {
    const gaSyncService = app.get(GaSyncService);
    const summary = new Map<string, { totalDays: number; daysWithData: number }>();

    for (const store of stores) {
      const acc = { totalDays: 0, daysWithData: 0 };
      for (const chunk of chunks) {
        console.log(`[${store.id}] Sincronizando ${chunk.start} → ${chunk.end}...`);
        const result = await gaSyncService.syncStore(store, chunk.start, chunk.end);
        if (result) {
          acc.totalDays += result.totalDays;
          acc.daysWithData += result.daysWithData;
        }
      }
      summary.set(store.id, acc);
    }

    console.log('\nBackfill completo. Resumen de cobertura real por tienda:');
    for (const [storeId, { totalDays, daysWithData }] of summary.entries()) {
      const pct = totalDays > 0 ? ((daysWithData / totalDays) * 100).toFixed(1) : '0.0';
      console.log(`  ${storeId}: ${daysWithData}/${totalDays} días con sesiones > 0 (${pct}%)`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Error en el backfill de GA4:', error);
  process.exitCode = 1;
});
