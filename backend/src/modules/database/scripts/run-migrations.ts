import { config as loadEnv } from 'dotenv';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

/**
 * Corre todos los archivos `.sql` de `migrations/` (en orden alfabético,
 * de ahí el prefijo `0001_`, `0002_`...) contra `DATABASE_URL`. Cada
 * archivo ya viene envuelto en su propio `BEGIN; ... COMMIT;` (ver
 * `0001_init.sql`) y usa `DROP TABLE IF EXISTS ... CASCADE` antes de cada
 * `CREATE TABLE`, así que este script es seguro de re-ejecutar mientras
 * se itera el esquema en desarrollo.
 *
 * Uso: `npm run db:migrate` (backend/.env) o, para el script de
 * importación histórica, con backend/.env.local cargado aparte.
 */
async function main(): Promise<void> {
  loadEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está configurada. Revisa backend/.env.');
  }

  const migrationsDir = join(__dirname, '..', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No hay archivos de migración en', migrationsDir);
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      console.log(`Aplicando migración: ${file}...`);
      await client.query(sql);
      console.log(`✓ ${file} aplicada.`);
    }
    console.log('Todas las migraciones se aplicaron correctamente.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Error aplicando migraciones:', error);
  process.exitCode = 1;
});
