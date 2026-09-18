import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../pg-pool.provider';

export interface CategoryReferenceEntry {
  categoryId: number;
  categoryName: string;
}

export interface CollectionReferenceEntry {
  skuId: string;
  storeId: string;
  collectionName: string;
}

/** Filas por sentencia INSERT — suficientemente chico para no chocar límites de parámetros de Postgres/pg, suficientemente grande para no pagar un round-trip de red por fila. */
const BATCH_SIZE = 1000;

/**
 * Tablas de referencia chicas y casi estáticas usadas para resolver el
 * histórico de Excel (que no trae nombre de categoría/marca/colección
 * directamente, solo IDs de SKU/categoría) — ver `category-tree.service.ts`
 * y `collection-sync.service.ts` para quién las puebla, y
 * `cli/import-historical-orders.ts` para quién las consulta.
 */
@Injectable()
export class ReferenceRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Categorías por lote (un `INSERT` multi-fila cada `BATCH_SIZE`, no una
   * consulta por categoría) — una colección de VTEX puede traer miles de
   * filas de catálogo, y una consulta de red por fila hacía que esto
   * tardara varios minutos.
   */
  async upsertCategories(entries: CategoryReferenceEntry[]): Promise<void> {
    // `category_id` es la PK: si el mismo id se repite en `entries`, un
    // solo INSERT no puede tocar la misma fila dos veces (Postgres lo
    // rechaza) — se deduplica quedándose con la última aparición.
    const deduped = new Map<number, CategoryReferenceEntry>();
    for (const entry of entries) deduped.set(entry.categoryId, entry);

    for (const batch of chunk(Array.from(deduped.values()), BATCH_SIZE)) {
      const { sql, params } = buildUpsert(
        'category_reference',
        ['category_id', 'category_name'],
        batch.map((e) => [e.categoryId, e.categoryName]),
        ['category_id'],
        ['category_name'],
      );
      await this.pool.query(sql, params);
    }
  }

  async getCategoryName(categoryId: number): Promise<string | undefined> {
    const result = await this.pool.query<{ category_name: string }>(
      `SELECT category_name FROM category_reference WHERE category_id = $1`,
      [categoryId],
    );
    return result.rows[0]?.category_name;
  }

  /**
   * Trae TODA la tabla de una sola vez, para que un consumidor con
   * muchas búsquedas (ej. el importador de Excel, que resuelve categoría
   * por cada línea de producto) haga lookups en memoria en vez de una
   * consulta de red por fila — `category_reference` es chica (cientos de
   * filas), así que cargarla completa es barato.
   */
  async getAllCategories(): Promise<Map<number, string>> {
    const result = await this.pool.query<{ category_id: number; category_name: string }>(
      `SELECT category_id, category_name FROM category_reference`,
    );
    return new Map(result.rows.map((r) => [r.category_id, r.category_name]));
  }

  /**
   * Última colección consultada gana en caso de solape (ver
   * `collection-sync.service.ts`, que llama esto UNA vez por colección en
   * el orden configurado — el orden de las LLAMADAS, no de `entries`
   * dentro de una sola llamada, es lo que determina el ganador). Por
   * lotes, igual que `upsertCategories` — VTEX puede reportar el mismo
   * SKU en varias "posiciones" dentro de la misma colección.
   */
  async upsertCollections(entries: CollectionReferenceEntry[]): Promise<void> {
    const deduped = new Map<string, CollectionReferenceEntry>();
    for (const entry of entries) deduped.set(`${entry.skuId}::${entry.storeId}`, entry);

    for (const batch of chunk(Array.from(deduped.values()), BATCH_SIZE)) {
      const { sql, params } = buildUpsert(
        'collection_reference',
        ['sku_id', 'store_id', 'collection_name'],
        batch.map((e) => [e.skuId, e.storeId, e.collectionName]),
        ['sku_id', 'store_id'],
        ['collection_name'],
      );
      await this.pool.query(sql, params);
    }
  }

  async getCollectionName(skuId: string, storeId: string): Promise<string | undefined> {
    const result = await this.pool.query<{ collection_name: string }>(
      `SELECT collection_name FROM collection_reference WHERE sku_id = $1 AND store_id = $2`,
      [skuId, storeId],
    );
    return result.rows[0]?.collection_name;
  }

  /** Igual que `getAllCategories`, pero para `collection_reference` — clave `sku_id::store_id`. Usado por el importador de Excel (miles de lookups por archivo). */
  async getAllCollections(): Promise<Map<string, string>> {
    const result = await this.pool.query<{ sku_id: string; store_id: string; collection_name: string }>(
      `SELECT sku_id, store_id, collection_name FROM collection_reference`,
    );
    return new Map(result.rows.map((r) => [`${r.sku_id}::${r.store_id}`, r.collection_name]));
  }

  /** Se escribe pasivamente cada vez que un detalle de orden (cron o Excel) trae `brandName` para un SKU — nunca se sobrescribe con un valor vacío. */
  async upsertBrand(skuId: string, brandName: string): Promise<void> {
    if (!skuId || !brandName) return;
    await this.pool.query(
      `INSERT INTO brand_reference (sku_id, brand_name)
       VALUES ($1, $2)
       ON CONFLICT (sku_id) DO UPDATE SET brand_name = EXCLUDED.brand_name`,
      [skuId, brandName],
    );
  }

  /**
   * Igual que `upsertBrand`, pero por lotes — usado por el cron/backfill
   * de VTEX cuando procesa muchas órdenes de una sola vez (ej. un
   * backfill de varios meses), para no pagar una consulta de red por
   * cada ítem con marca nueva.
   */
  async upsertBrands(entries: { skuId: string; brandName: string }[]): Promise<void> {
    const filtered = entries.filter((e) => e.skuId && e.brandName);
    if (filtered.length === 0) return;

    const deduped = new Map<string, { skuId: string; brandName: string }>();
    for (const entry of filtered) deduped.set(entry.skuId, entry);

    for (const batch of chunk(Array.from(deduped.values()), BATCH_SIZE)) {
      const { sql, params } = buildUpsert(
        'brand_reference',
        ['sku_id', 'brand_name'],
        batch.map((e) => [e.skuId, e.brandName]),
        ['sku_id'],
        ['brand_name'],
      );
      await this.pool.query(sql, params);
    }
  }

  async getBrand(skuId: string): Promise<string | undefined> {
    const result = await this.pool.query<{ brand_name: string }>(
      `SELECT brand_name FROM brand_reference WHERE sku_id = $1`,
      [skuId],
    );
    return result.rows[0]?.brand_name;
  }

  /** Igual que `getAllCategories`, pero para `brand_reference`. Usado por el importador de Excel. */
  async getAllBrands(): Promise<Map<string, string>> {
    const result = await this.pool.query<{ sku_id: string; brand_name: string }>(
      `SELECT sku_id, brand_name FROM brand_reference`,
    );
    return new Map(result.rows.map((r) => [r.sku_id, r.brand_name]));
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Construye un `INSERT ... VALUES (...), (...) ON CONFLICT (...) DO UPDATE SET ...` multi-fila parametrizado. */
function buildUpsert(
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictColumns: string[],
  updateColumns: string[],
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const valuesSql = rows
    .map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    })
    .join(', ');

  const updateSql = updateColumns.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuesSql}
               ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateSql}`;
  return { sql, params };
}
