import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../pg-pool.provider';

export interface GaProductLink {
  itemId: string;
  productUrl: string;
  productReference: string | null;
}

/**
 * Caché de links reales de producto (VTEX), resueltos por `GaSyncService`
 * contra la API pública de catálogo durante el sync — nunca en vivo cuando
 * el dashboard consulta. No es una serie diaria: una fila por (tienda,
 * SKU), se sobrescribe con `ON CONFLICT` si VTEX cambia el slug/referencia.
 */
@Injectable()
export class GaProductLinksRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** De `itemIds`, cuáles YA están en caché para esta tienda — así `GaSyncService` solo resuelve los que faltan. */
  async getExistingItemIds(storeId: string, itemIds: string[]): Promise<Set<string>> {
    if (itemIds.length === 0) return new Set();
    const result = await this.pool.query<{ item_id: string }>(
      'SELECT item_id FROM ga_product_links WHERE store_id = $1 AND item_id = ANY($2::text[])',
      [storeId, itemIds],
    );
    return new Set(result.rows.map((r) => r.item_id));
  }

  /** Links cacheados de `itemIds` para esta tienda, indexados por `itemId` — usado por `GaQueryService.getProducts`. */
  async getLinksMap(storeId: string, itemIds: string[]): Promise<Map<string, GaProductLink>> {
    if (itemIds.length === 0) return new Map();
    const result = await this.pool.query<{ item_id: string; product_url: string; product_reference: string | null }>(
      'SELECT item_id, product_url, product_reference FROM ga_product_links WHERE store_id = $1 AND item_id = ANY($2::text[])',
      [storeId, itemIds],
    );
    return new Map(
      result.rows.map((r) => [r.item_id, { itemId: r.item_id, productUrl: r.product_url, productReference: r.product_reference }]),
    );
  }

  async upsertMany(storeId: string, links: GaProductLink[]): Promise<void> {
    if (links.length === 0) return;
    for (const link of links) {
      await this.pool.query(
        `INSERT INTO ga_product_links (store_id, item_id, product_url, product_reference, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (store_id, item_id)
         DO UPDATE SET product_url = excluded.product_url, product_reference = excluded.product_reference, updated_at = excluded.updated_at`,
        [storeId, link.itemId, link.productUrl, link.productReference],
      );
    }
  }
}
