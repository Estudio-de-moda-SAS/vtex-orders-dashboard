import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database.service';
import { OrderSourceRef } from './orders-cache.repository';

interface WatermarkRow {
  day_bucket: string;
  is_complete: number;
}

/**
 * Repositorio de la tabla `sync_watermarks`: registra qué días (por
 * tienda/segmento) ya se descargaron completos de VTEX y pueden leerse
 * desde el caché local sin volver a consultar VTEX.
 */
@Injectable()
export class SyncWatermarkRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  markDaySynced(ref: OrderSourceRef, dayBucket: string, isComplete: boolean): void {
    const db = this.databaseService.getConnection();
    db.prepare(
      `INSERT INTO sync_watermarks (store_id, source_type, source_key, day_bucket, is_complete, synced_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(store_id, source_type, source_key, day_bucket) DO UPDATE SET
         is_complete = excluded.is_complete,
         synced_at = excluded.synced_at`,
    ).run(ref.storeId, ref.sourceType, ref.sourceKey, dayBucket, isComplete ? 1 : 0, new Date().toISOString());
  }

  /** Retorna el subconjunto de `dayBuckets` que YA están sincronizados y completos para esta fuente. */
  getSyncedDays(ref: OrderSourceRef, dayBuckets: string[]): Set<string> {
    if (dayBuckets.length === 0) return new Set();
    const db = this.databaseService.getConnection();
    const placeholders = dayBuckets.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT day_bucket, is_complete FROM sync_watermarks
         WHERE store_id = ? AND source_type = ? AND source_key = ?
           AND day_bucket IN (${placeholders})`,
      )
      .all(ref.storeId, ref.sourceType, ref.sourceKey, ...dayBuckets) as unknown as WatermarkRow[];

    return new Set(rows.filter((r) => r.is_complete === 1).map((r) => r.day_bucket));
  }
}
