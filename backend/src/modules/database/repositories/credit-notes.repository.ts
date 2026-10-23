import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import { PG_POOL } from '../pg-pool.provider';

const BATCH_SIZE = 500;

/** Una fila de `credit_notes` — mismos nombres de columna que entrega la API ("Conní"), ver migración 0020. */
export interface CreditNoteDbRow {
  rowidNc: number;
  notaCredito: string;
  /** "YYYY-MM-DD". */
  fechaNc: string;
  fechaCreacionNc: string | null;
  idCia: number | null;
  idCo: string | null;
  tienda: string | null;
  marca: string;
  /** `null` si `marca` no coincidió con ninguna tienda configurada (ver `resolveStoreIdFromMarca`). */
  storeId: string | null;
  facturaErp: string | null;
  fechaFactura: string | null;
  vlrNetoFactura: number | null;
  pedidoErp: string | null;
  ordenVtex: string | null;
  razonNc: string | null;
  vlrBruto: number | null;
  vlrDscto: number | null;
  vlrImpuestos: number | null;
  vlrNeto: number;
  totalNcFactura: number | null;
}

export interface CreditNotesDayRow {
  date: string;
  count: number;
  totalValue: number;
}

export interface CreditNotesStoreRow {
  storeId: string | null;
  marca: string;
  count: number;
  totalValue: number;
}

@Injectable()
export class CreditNotesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Upsert por `rowid_nc` (llave de la API, no autogenerada) — una nota
   * crédito corrida dos veces en el mismo rango (ej. backfill re-ejecutado)
   * actualiza la fila existente en vez de duplicarla. `synced_at` se
   * refresca en cada upsert como registro de "la última vez que se
   * confirmó contra el ERP".
   */
  async upsertMany(rows: CreditNoteDbRow[]): Promise<void> {
    if (rows.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        await this.upsertBatch(client, rows.slice(start, start + BATCH_SIZE));
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertBatch(client: PoolClient, batch: CreditNoteDbRow[]): Promise<void> {
    const columns = [
      'rowid_nc', 'nota_credito', 'fecha_nc', 'fecha_creacion_nc', 'id_cia', 'id_co', 'tienda', 'marca', 'store_id',
      'factura_erp', 'fecha_factura', 'vlr_neto_factura', 'pedido_erp', 'orden_vtex', 'razon_nc',
      'vlr_bruto', 'vlr_dscto', 'vlr_impuestos', 'vlr_neto', 'total_nc_factura', 'synced_at',
    ];
    const params: unknown[] = [];
    const valuesSql = batch
      .map((row) => {
        const values = [
          row.rowidNc, row.notaCredito, row.fechaNc, row.fechaCreacionNc, row.idCia, row.idCo, row.tienda, row.marca, row.storeId,
          row.facturaErp, row.fechaFactura, row.vlrNetoFactura, row.pedidoErp, row.ordenVtex, row.razonNc,
          row.vlrBruto, row.vlrDscto, row.vlrImpuestos, row.vlrNeto, row.totalNcFactura, new Date().toISOString(),
        ];
        const placeholders = values.map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');

    const updateSet = columns
      .filter((c) => c !== 'rowid_nc')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');

    await client.query(
      `INSERT INTO credit_notes (${columns.join(', ')}) VALUES ${valuesSql}
       ON CONFLICT (rowid_nc) DO UPDATE SET ${updateSet}`,
      params,
    );
  }

  /** Cantidad y valor neto total por día, dentro del rango — `storeId` opcional (sin él, todas las marcas). */
  async getByDay(startDay: string, endDay: string, storeId?: string): Promise<CreditNotesDayRow[]> {
    const { where, params } = this.buildWhere(startDay, endDay, storeId);
    const result = await this.pool.query<{ fecha_nc: string; count: string; total_value: string }>(
      `SELECT fecha_nc::text AS fecha_nc, COUNT(*) AS count, COALESCE(SUM(vlr_neto), 0) AS total_value
       FROM credit_notes WHERE ${where} GROUP BY fecha_nc ORDER BY fecha_nc`,
      params,
    );
    return result.rows.map((r) => ({ date: r.fecha_nc, count: Number(r.count), totalValue: Number(r.total_value) }));
  }

  /** Cantidad y valor neto total por marca/tienda, dentro del rango — `storeId` opcional (sin él, todas). */
  async getByStore(startDay: string, endDay: string, storeId?: string): Promise<CreditNotesStoreRow[]> {
    const { where, params } = this.buildWhere(startDay, endDay, storeId);
    const result = await this.pool.query<{ store_id: string | null; marca: string; count: string; total_value: string }>(
      `SELECT store_id, marca, COUNT(*) AS count, COALESCE(SUM(vlr_neto), 0) AS total_value
       FROM credit_notes WHERE ${where} GROUP BY store_id, marca ORDER BY total_value DESC`,
      params,
    );
    return result.rows.map((r) => ({ storeId: r.store_id, marca: r.marca, count: Number(r.count), totalValue: Number(r.total_value) }));
  }

  /**
   * Última vez que se confirmó CUALQUIER nota crédito contra el ERP
   * (`MAX(synced_at)`) — a diferencia de VTEX/GA4, notas crédito no tiene
   * fila en `sync_logs` (el script `cli/credit-notes-sync.ts` corre manual,
   * fuera del backend desplegado), así que este es el único indicador de
   * "qué tan al día está este dato". `storeId` opcional (sin él, el último
   * sync de cualquier marca). `null` si nunca se ha corrido el sync.
   */
  async getLastSyncedAt(storeId?: string): Promise<string | null> {
    const params: unknown[] = [];
    let where = '';
    if (storeId) {
      params.push(storeId);
      where = 'WHERE store_id = $1';
    }
    const result = await this.pool.query<{ last_synced_at: string | null }>(
      `SELECT MAX(synced_at) AS last_synced_at FROM credit_notes ${where}`,
      params,
    );
    return result.rows[0]?.last_synced_at ?? null;
  }

  private buildWhere(startDay: string, endDay: string, storeId?: string): { where: string; params: unknown[] } {
    const params: unknown[] = [startDay, endDay];
    let where = 'fecha_nc BETWEEN $1 AND $2';
    if (storeId) {
      params.push(storeId);
      where += ` AND store_id = $${params.length}`;
    }
    return { where, params };
  }
}
