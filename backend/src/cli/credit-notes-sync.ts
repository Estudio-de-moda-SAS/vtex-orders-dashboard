import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';

import { addDaysUtc } from '../common/utils/date-range.util';
import configuration from '../config/configuration';
import {
  CreditNotesCredentialsMissingError,
  CreditNotesTimeoutError,
  CreditNotesUnreachableError,
} from '../modules/credit-notes/credit-notes-client.service';
import { CreditNotesModule } from '../modules/credit-notes/credit-notes.module';
import { CreditNotesSyncService } from '../modules/credit-notes/credit-notes-sync.service';

/**
 * Sincroniza notas crédito (API "Conní" del ERP) → Supabase. A diferencia
 * de `ga-backfill.ts`/`backfill-range.ts`, este script NO corre nunca
 * desde el backend desplegado — la API solo es alcanzable desde la VPN de
 * la compañía (`10.10.21.7` es una IP interna). Hay que correrlo a mano
 * (o programado con el Programador de tareas / cron) desde una máquina
 * conectada a la VPN, idealmente a diario para que la tabla no quede
 * desactualizada.
 *
 * Uso:
 *   npm run credit-notes:sync -- --from=2026-09-01 --to=2026-10-14
 *   npm run credit-notes:sync -- --from=2026-10-13 --to=2026-10-13   (un solo día, ej. corrida diaria)
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), CreditNotesModule],
})
class CreditNotesSyncModule {}

function lastDayOfMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-').map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yyyyMm}-${String(day).padStart(2, '0')}`;
}

/** Parte `[from, to]` en tramos de ~1 mes calendario — mismo troceo que `ga-backfill.ts`, para no pedirle a la API un rango demasiado ancho de una sola vez. */
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
  const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' } } });

  if (!values.from || !values.to) {
    console.error('Uso: npm run credit-notes:sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD');
    process.exitCode = 1;
    return;
  }

  const chunks = splitIntoMonthChunks(values.from, values.to);
  console.log(`Sincronizando notas crédito de ${values.from} a ${values.to} (${chunks.length} bloque(s) mensual(es))...`);

  const app = await NestFactory.createApplicationContext(CreditNotesSyncModule);
  try {
    const syncService = app.get(CreditNotesSyncService);
    let total = 0;
    for (const chunk of chunks) {
      console.log(`  ${chunk.start} → ${chunk.end}...`);
      total += await syncService.syncRange(chunk.start, chunk.end);
    }
    console.log(`\nListo: ${total} nota(s) crédito guardada(s)/actualizada(s) en total.`);
  } catch (error) {
    if (error instanceof CreditNotesUnreachableError || error instanceof CreditNotesCredentialsMissingError || error instanceof CreditNotesTimeoutError) {
      // Sin stack trace para este caso esperado — el mensaje ya dice exactamente qué hacer
      // (conectarse a la VPN, o revisar .env), no hace falta ningún detalle técnico más.
      console.error(`\n⚠ ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Error sincronizando notas crédito:', error);
  process.exitCode = 1;
});
