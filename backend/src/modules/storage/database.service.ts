import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Administra la conexión al archivo SQLite local usado como caché
 * histórico de órdenes. Es literalmente un archivo en disco (por defecto
 * `backend/data/cache.sqlite`) — no requiere ningún servicio externo,
 * cuenta, ni credenciales adicionales.
 *
 * Usa el módulo SQLite integrado en Node.js (`node:sqlite`, disponible
 * desde Node 22.5+) en vez de un paquete npm con módulo nativo compilado
 * (ej. `better-sqlite3`). Esto evita que instalar el proyecto requiera
 * Python/Visual Studio Build Tools u otras herramientas de compilación —
 * viene incluido en el propio Node que ya tienes instalado, igual en
 * Windows, Mac o Linux.
 *
 * Nota: Node marca esta API como "experimental" (imprime un aviso al
 * arrancar) — es normal y no afecta su funcionamiento; simplemente
 * significa que su interfaz podría cambiar en futuras versiones de Node.
 *
 * IMPORTANTE para despliegue: este archivo debe vivir en un disco
 * persistente (ver README, sección de despliegue). En entornos
 * "serverless" sin disco persistente (ej. Vercel serverless functions)
 * este archivo se perdería entre peticiones y la estrategia de caché no
 * funcionaría — el backend debe desplegarse en un servidor/contenedor con
 * almacenamiento persistente (ej. Azure App Service, Railway con volumen,
 * una VM).
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly db: DatabaseSync;

  constructor(private readonly configService: ConfigService) {
    const dbPath = this.configService.get<string>('app.storage.dbPath', './data/cache.sqlite');
    const resolvedPath = path.resolve(dbPath);
    const dir = path.dirname(resolvedPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(resolvedPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.logger.log(`Base de datos local (caché de órdenes) abierta en: ${resolvedPath}`);

    this.runMigrations();
  }

  getConnection(): DatabaseSync {
    return this.db;
  }

  onModuleDestroy() {
    this.db.close();
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        store_id TEXT NOT NULL,
        source_type TEXT NOT NULL,      -- 'main' | 'seller' | 'marketplace'
        source_key TEXT NOT NULL DEFAULT '',
        order_id TEXT NOT NULL,
        creation_date TEXT NOT NULL,    -- ISO 8601 UTC
        day_bucket TEXT NOT NULL,       -- 'YYYY-MM-DD' (día UTC, usado para el watermark)
        status TEXT,
        status_description TEXT,
        total_value REAL,
        currency_code TEXT,
        payment_names TEXT,
        sales_channel TEXT,
        origin TEXT,
        total_items INTEGER,
        hostname TEXT,
        raw_json TEXT NOT NULL,
        PRIMARY KEY (store_id, source_type, source_key, order_id)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_lookup
        ON orders (store_id, source_type, source_key, day_bucket);

      CREATE TABLE IF NOT EXISTS sync_watermarks (
        store_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_key TEXT NOT NULL DEFAULT '',
        day_bucket TEXT NOT NULL,        -- 'YYYY-MM-DD'
        is_complete INTEGER NOT NULL,    -- 1 = se descargó completo, 0 = quedó incompleto
        synced_at TEXT NOT NULL,
        PRIMARY KEY (store_id, source_type, source_key, day_bucket)
      );

      CREATE TABLE IF NOT EXISTS sync_jobs (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        status TEXT NOT NULL,            -- 'pending' | 'running' | 'completed' | 'failed'
        total_days INTEGER NOT NULL,
        completed_days INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Migración incremental: la tabla `orders` ya existía antes de que se
    // agregara la columna `city` (enriquecimiento de ciudad de envío, ver
    // `OrderCityEnrichmentService`). SQLite no soporta
    // `ADD COLUMN IF NOT EXISTS`, así que se verifica con
    // `pragma_table_info` en vez de depender de capturar el error — así un
    // error de sintaxis real no queda enmascarado como "la columna ya existe".
    //
    // NULL = todavía no se revisó contra VTEX. '' (string vacío) = ya se
    // revisó pero VTEX no reportó ciudad (ej. retiro en tienda) — se usa un
    // sentinel distinto de NULL para que el backfill (que busca
    // `city IS NULL`) no vuelva a intentar esta orden en cada pasada.
    this.addColumnIfMissing('orders', 'city', 'TEXT');

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_orders_city_pending
        ON orders (city)
        WHERE city IS NULL;
    `);
  }

  private addColumnIfMissing(table: string, column: string, type: string): void {
    const existing = this.db
      .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, column);
    if (!existing) {
      // `table`/`column` nunca vienen de input externo (siempre literales
      // fijos en el código), así que interpolarlos aquí es seguro — SQLite
      // no permite parametrizar nombres de columna/tabla con `?`.
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}
