import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';

import configuration from '../config/configuration';
import {
  CreditNotesCredentialsMissingError,
  CreditNotesTimeoutError,
  CreditNotesUnreachableError,
} from '../modules/credit-notes/credit-notes-client.service';
import { CreditNotesModule } from '../modules/credit-notes/credit-notes.module';
import { CreditNotesSyncService } from '../modules/credit-notes/credit-notes-sync.service';
import {
  PosSalesCredentialsMissingError,
  PosSalesTimeoutError,
  PosSalesUnreachableError,
} from '../modules/pos-sales/pos-sales-client.service';
import { PosSalesModule } from '../modules/pos-sales/pos-sales.module';
import { PosSalesSyncService } from '../modules/pos-sales/pos-sales-sync.service';

/**
 * Sincroniza TODAS las fuentes del ERP ("Conní") que requieren VPN en un
 * solo comando — notas crédito y ventas POS, en ese orden. Un wrapper
 * fino sobre `cli/credit-notes-sync.ts`/`cli/pos-sales-sync.ts`, que
 * siguen existiendo por separado para correr solo una de las dos si hace
 * falta. Sin rango por defecto a propósito (decisión explícita del
 * usuario): `--from`/`--to` siempre son obligatorios, igual que los dos
 * scripts individuales.
 *
 * Uso diario (desde una máquina conectada a la VPN):
 *   npm run daily-sync -- --from=2026-10-27 --to=2026-10-27
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), CreditNotesModule, PosSalesModule],
})
class DailySyncModule {}

/** `true` si se pudo completar (haya guardado filas o no); `false` si falló por un error esperado (sin VPN/credenciales/timeout). */
async function syncCreditNotes(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>, from: string, to: string): Promise<boolean> {
  console.log('\n— Notas crédito —');
  try {
    const count = await app.get(CreditNotesSyncService).syncRange(from, to);
    console.log(`Listo: ${count} nota(s) crédito guardada(s)/actualizada(s).`);
    return true;
  } catch (error) {
    if (error instanceof CreditNotesUnreachableError || error instanceof CreditNotesCredentialsMissingError || error instanceof CreditNotesTimeoutError) {
      console.error(`⚠ ${error.message}`);
      return false;
    }
    throw error;
  }
}

async function syncPosSales(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>, from: string, to: string): Promise<boolean> {
  console.log('\n— Ventas POS —');
  try {
    const count = await app.get(PosSalesSyncService).syncRange(from, to);
    console.log(`Listo: ${count} línea(s) de venta POS guardada(s).`);
    return true;
  } catch (error) {
    if (error instanceof PosSalesUnreachableError || error instanceof PosSalesCredentialsMissingError || error instanceof PosSalesTimeoutError) {
      console.error(`⚠ ${error.message}`);
      return false;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' } } });

  if (!values.from || !values.to) {
    console.error('Uso: npm run daily-sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD');
    process.exitCode = 1;
    return;
  }

  console.log(`Sincronizando notas crédito + ventas POS de ${values.from} a ${values.to}...`);

  const app = await NestFactory.createApplicationContext(DailySyncModule);
  try {
    const creditNotesOk = await syncCreditNotes(app, values.from, values.to);
    const posSalesOk = await syncPosSales(app, values.from, values.to);

    if (!creditNotesOk || !posSalesOk) {
      console.error('\nTerminó con al menos una fuente fallida — revisa los avisos de arriba.');
      process.exitCode = 1;
    } else {
      console.log('\nListo: ambas fuentes sincronizadas correctamente.');
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Error en el sync diario:', error);
  process.exitCode = 1;
});
