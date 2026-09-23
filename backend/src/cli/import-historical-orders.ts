import { config as loadEnv } from 'dotenv';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseArgs } from 'util';
import * as ExcelJS from 'exceljs';
import { Pool } from 'pg';

import { aggregateDailyRows } from '../common/aggregation/daily-aggregator';
import { EnrichedOrder } from '../common/aggregation/types';
import { ReferenceRepository } from '../modules/database/repositories/reference.repository';
import { SalesAggregatesRepository, TouchedDay } from '../modules/database/repositories/sales-aggregates.repository';
import { SyncLogsRepository } from '../modules/database/repositories/sync-logs.repository';
import { readSafeRowsFromCsv } from './excel-import/csv-row-reader';
import { parseHistoricalFileName } from './excel-import/filename-parser';
import { pickSafeRow, SafeRow } from './excel-import/row-picker';
import { buildEnrichedOrder, groupRowsByOrder, HostMismatchError, ReferenceLookups } from './excel-import/row-mapper';

/**
 * Script CLI de importación histórica — SEPARADO del backend desplegado,
 * se ejecuta manualmente desde la máquina del usuario:
 *
 *   npm run import:historico -- --path="C:/Users/.../Desktop/order vtex"
 *
 * Carga `.env.local` (no `.env`, que es el del backend desplegado — ver
 * `backend/.env.local.example`). Nunca se despliega junto con archivos
 * Excel reales (contienen información personal de clientes) — cada fila
 * pasa por `pickSafeRow` (allowlist) apenas se lee, antes de cualquier
 * otro procesamiento.
 */
async function main(): Promise<void> {
  loadEnv({ path: '.env.local' });

  const { values } = parseArgs({ options: { path: { type: 'string' } } });
  const folderPath = values.path;
  if (!folderPath) {
    console.error('Uso: npm run import:historico -- --path="/ruta/a/la/carpeta"');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(folderPath)) {
    console.error(`La carpeta no existe: ${folderPath}`);
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL no está configurada. Revisa backend/.env.local.');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const referenceRepository = new ReferenceRepository(pool);
  const salesAggregatesRepository = new SalesAggregatesRepository(pool);
  const syncLogsRepository = new SyncLogsRepository(pool);

  const files = readdirSync(folderPath).filter((f) => /\.(xlsx?|csv)$/i.test(f));
  if (files.length === 0) {
    console.log(`No se encontraron archivos .xlsx/.csv en ${folderPath}`);
    await pool.end();
    return;
  }

  console.log(`Encontrados ${files.length} archivo(s). Precargando tablas de referencia...`);
  const lookups: ReferenceLookups = {
    categoriesById: await referenceRepository.getAllCategories(),
    brandsBySkuId: await referenceRepository.getAllBrands(),
    collectionsBySkuAndStore: await referenceRepository.getAllCollections(),
  };
  console.log(
    `  ${lookups.categoriesById.size} categorías, ${lookups.brandsBySkuId.size} marcas, ${lookups.collectionsBySkuAndStore.size} SKUs con colección.\n`,
  );

  const summary = { processed: 0, skipped: 0, failed: 0 };

  for (const file of files) {
    const parsed = parseHistoricalFileName(file);
    if (!parsed) {
      console.warn(`⚠ Omitido (nombre no reconocido): ${file}`);
      summary.skipped += 1;
      continue;
    }

    console.log(`→ ${file} (tienda: ${parsed.store.name}, ${parsed.startMonth}-${parsed.endMonth}/${parsed.year})`);
    const syncLogId = await syncLogsRepository.start(parsed.store.id, 'excel_import');

    try {
      const filePath = join(folderPath, file);
      const rows = /\.csv$/i.test(file) ? await readSafeRowsFromCsv(filePath) : await readSafeRowsFromXlsx(filePath);
      const orderGroups = groupRowsByOrder(rows, parsed.store);

      const enrichedOrders: EnrichedOrder[] = [];
      for (const [orderId, group] of orderGroups.entries()) {
        enrichedOrders.push(buildEnrichedOrder(orderId, group, parsed.store, lookups));
      }

      const aggregation = aggregateDailyRows(enrichedOrders, Boolean(parsed.store.isMultiBrand));
      const touchedDays: TouchedDay[] = Array.from(new Set(enrichedOrders.map((o) => o.dayBucket))).map((date) => ({
        date,
        storeId: parsed.store.id,
      }));

      // El Excel es un volcado directo, no una paginación contra VTEX —
      // siempre `isComplete: true` (no aplica la duda de conteo que sí
      // existe para `vtex-sync-cron.service.ts`).
      await salesAggregatesRepository.replaceAggregates(aggregation, touchedDays, true);
      await syncLogsRepository.finish(syncLogId, 'success', {
        recordsRead: rows.length,
        recordsInserted: aggregation.salesDaily.length,
        recordsUpdated: 0,
        recordsFailed: 0,
      });

      console.log(`  ✓ ${orderGroups.size} orden(es), ${touchedDays.length} día(s) recalculado(s).\n`);
      summary.processed += 1;
    } catch (error) {
      const message = error instanceof HostMismatchError ? error.message : error instanceof Error ? error.message : 'error desconocido';
      await syncLogsRepository.finish(syncLogId, 'error', { recordsRead: 0, recordsInserted: 0, recordsUpdated: 0, recordsFailed: 0 }, message);
      console.error(`  ✗ Falló: ${message}\n`);
      summary.failed += 1;
    }
  }

  console.log(`Resumen: ${summary.processed} procesado(s), ${summary.skipped} omitido(s), ${summary.failed} fallido(s).`);
  await pool.end();
}

/**
 * Lee un archivo `.xlsx`/`.xls` fila por fila con el lector STREAMING de
 * `exceljs` (no carga todo el archivo en memoria de una sola vez), y
 * aplica `pickSafeRow` a cada fila apenas se lee — antes de cualquier
 * otro procesamiento, para que las columnas sensibles nunca existan en
 * memoria más allá de esta función. Los 12 archivos reales de histórico
 * son `.csv` (ver `readSafeRowsFromCsv`); este lector queda como soporte
 * por si en el futuro se entrega un archivo `.xlsx` real.
 */
async function readSafeRowsFromXlsx(filePath: string): Promise<SafeRow[]> {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {});
  const safeRows: SafeRow[] = [];
  let headers: string[] = [];

  for await (const worksheetReader of workbookReader) {
    let isFirstRow = true;
    for await (const row of worksheetReader) {
      const values = row.values as unknown[];
      if (isFirstRow) {
        headers = values.map((v) => String(v ?? '').trim());
        isFirstRow = false;
        continue;
      }

      const rawRow: Record<string, unknown> = {};
      for (let i = 1; i < values.length; i += 1) {
        const header = headers[i];
        if (header) rawRow[header] = values[i];
      }
      safeRows.push(pickSafeRow(rawRow));
    }
    break; // solo la primera hoja
  }

  return safeRows;
}

main().catch((error) => {
  console.error('Error inesperado en la importación:', error);
  process.exitCode = 1;
});
