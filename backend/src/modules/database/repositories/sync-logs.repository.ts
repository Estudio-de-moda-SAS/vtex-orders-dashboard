import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../pg-pool.provider';

export type SyncSource = 'vtex_api' | 'excel_import';
export type SyncStatus = 'success' | 'error' | 'partial';

export interface SyncLogSummary {
  storeId: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncStatus | null;
}

/** Trazabilidad operativa: una fila por corrida del cron o del importador de Excel, por tienda. */
@Injectable()
export class SyncLogsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async start(storeId: string, source: SyncSource): Promise<number> {
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO sync_logs (store_id, source, started_at, status)
       VALUES ($1, $2, now(), 'partial')
       RETURNING id`,
      [storeId, source],
    );
    return result.rows[0].id;
  }

  async finish(
    id: number,
    status: SyncStatus,
    counts: { recordsRead: number; recordsInserted: number; recordsUpdated: number; recordsFailed: number },
    errorMessage?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE sync_logs SET
         finished_at = now(),
         status = $2,
         records_read = $3,
         records_inserted = $4,
         records_updated = $5,
         records_failed = $6,
         error_message = $7
       WHERE id = $1`,
      [id, status, counts.recordsRead, counts.recordsInserted, counts.recordsUpdated, counts.recordsFailed, errorMessage ?? null],
    );
  }

  /**
   * Para cada tienda: `lastSyncedAt` = `finished_at` de su corrida EXITOSA
   * más reciente (fuente `vtex_api`); `lastSyncStatus` = status de la
   * corrida TERMINADA más reciente (`finished_at IS NOT NULL`) — así el
   * dashboard puede seguir mostrando la advertencia de "no se pudo
   * refrescar" si la última corrida falló, aunque haya habido una exitosa
   * antes.
   *
   * `start()` inserta la fila con `status='partial'` de entrada (antes de
   * saber el resultado real) y recién la actualiza al terminar — así que
   * mientras una corrida está en vuelo (el cron normal cada 4h, el boot,
   * o un backfill manual troceado en varios bloques que puede tardar
   * varios minutos) SIEMPRE hay una fila reciente con `status='partial'`
   * y `finished_at IS NULL` para esa tienda. Filtrar por `finished_at IS
   * NOT NULL` es lo que evita que ESE placeholder (100% normal, no un
   * hipo de VTEX) se lea como si la última sincronización real hubiera
   * quedado en partial — confirmado en producción: el banner rojo global
   * parpadeaba con corridas que en realidad seguían en curso, no habían
   * fallado.
   */
  async getLatestStatusByStore(): Promise<Record<string, SyncLogSummary>> {
    const result = await this.pool.query<{
      store_id: string;
      last_synced_at: string | null;
      last_status: SyncStatus;
    }>(
      `SELECT
         store_id,
         (SELECT finished_at FROM sync_logs s2
            WHERE s2.store_id = s1.store_id AND s2.source = 'vtex_api' AND s2.status = 'success'
            ORDER BY s2.finished_at DESC LIMIT 1) AS last_synced_at,
         (SELECT status FROM sync_logs s3
            WHERE s3.store_id = s1.store_id AND s3.source = 'vtex_api' AND s3.finished_at IS NOT NULL
            ORDER BY s3.finished_at DESC LIMIT 1) AS last_status
       FROM (SELECT DISTINCT store_id FROM sync_logs WHERE source = 'vtex_api') s1`,
    );

    const summary: Record<string, SyncLogSummary> = {};
    for (const row of result.rows) {
      summary[row.store_id] = {
        storeId: row.store_id,
        lastSyncedAt: row.last_synced_at,
        lastSyncStatus: row.last_status,
      };
    }
    return summary;
  }
}
