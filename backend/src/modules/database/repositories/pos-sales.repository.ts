import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import { PG_POOL } from '../pg-pool.provider';

const BATCH_SIZE = 500;

/** Una fila de `pos_sales` — mismos nombres de columna que entrega la API ("Conní"), ver migración 0023. */
export interface PosSaleDbRow {
  /** "YYYY-MM-DD". */
  fecha: string;
  co: string | null;
  nroDocumento: string;
  tipoDocto: string;
  idTipo: string | null;
  tipo: string | null;
  idCategoria: string | null;
  categoria: string | null;
  idMarca: string | null;
  marca: string;
  storeId: string;
  idItem: number | null;
  referencia: string | null;
  descripcionItem: string | null;
  nitVendedor: string | null;
  /** Nombre crudo tal cual llega de la API — ver comentario de la migración. */
  nombreVendedor: string | null;
  cantidadInv: number | null;
  valorBruto: number | null;
  valorDescuento: number | null;
  valorNeto: number;
  isFreight: boolean;
  isCreditNote: boolean;
}

export interface PosSalesTotals {
  totalSales: number;
  totalFreight: number;
  totalCreditNotes: number;
  totalOrders: number;
}

export interface PosSalesSellerRow {
  nitVendedor: string;
  /** Nombre crudo — el caller aplica `friendlyPosSellerName` antes de mostrarlo. */
  nombreVendedor: string;
  orders: number;
  sales: number;
}

export interface PosSalesStoreRow {
  storeId: string;
  orders: number;
  sales: number;
}

/** Igual que `PosSalesSellerRow`, pero sin combinar tiendas — una fila por (tienda, vendedor). */
export interface PosSalesStoreSellerRow {
  storeId: string;
  nitVendedor: string;
  nombreVendedor: string;
  orders: number;
  sales: number;
}

/** `marca` CRUDA (no `store_id`) — solo tiene sentido pedirla para Pilatos, la única tienda multimarca. */
export interface PosSalesBrandRow {
  marca: string;
  orders: number;
  sales: number;
}

@Injectable()
export class PosSalesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Reemplaza TODAS las filas del rango [fromDay, toDay] — esta API no
   * entrega un id de fila estable (a diferencia de notas crédito), así
   * que no hay llave natural para un upsert idempotente. Re-sincronizar
   * el mismo rango borra y vuelve a insertar, nunca duplica.
   */
  async replaceRange(fromDay: string, toDay: string, rows: PosSaleDbRow[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM pos_sales WHERE fecha BETWEEN $1 AND $2', [fromDay, toDay]);
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        await this.insertBatch(client, rows.slice(start, start + BATCH_SIZE));
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertBatch(client: PoolClient, batch: PosSaleDbRow[]): Promise<void> {
    if (batch.length === 0) return;
    const columns = [
      'fecha', 'co', 'nro_documento', 'tipo_docto', 'id_tipo', 'tipo', 'id_categoria', 'categoria', 'id_marca', 'marca',
      'store_id', 'id_item', 'referencia', 'descripcion_item', 'nit_vendedor', 'nombre_vendedor', 'cantidad_inv',
      'valor_bruto', 'valor_descuento', 'valor_neto', 'is_freight', 'is_credit_note',
    ];
    const params: unknown[] = [];
    const valuesSql = batch
      .map((row) => {
        const values = [
          row.fecha, row.co, row.nroDocumento, row.tipoDocto, row.idTipo, row.tipo, row.idCategoria, row.categoria, row.idMarca, row.marca,
          row.storeId, row.idItem, row.referencia, row.descripcionItem, row.nitVendedor, row.nombreVendedor, row.cantidadInv,
          row.valorBruto, row.valorDescuento, row.valorNeto, row.isFreight, row.isCreditNote,
        ];
        const placeholders = values.map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');

    await client.query(`INSERT INTO pos_sales (${columns.join(', ')}) VALUES ${valuesSql}`, params);
  }

  /**
   * Totales del rango: `totalSales` es el DEFINITIVO — incluye fletes
   * (regla confirmada por el usuario) y YA RESTA las notas crédito (su
   * `valor_neto` ya viene negativo en la API, así que sumarlas todas
   * junto con las ventas da el neto directo, sin restar dos veces).
   * `totalFreight`/`totalCreditNotes` se muestran aparte, solo
   * informativos (`totalCreditNotes` YA está incluido en `totalSales`,
   * no hay que restarlo de nuevo). `totalOrders` cuenta documentos DE
   * VENTA distintos por tienda (`store_id || nro_documento`, nunca solo
   * `nro_documento`: dos tiendas podrían reusar el mismo número de
   * documento) — una nota crédito no es un documento de venta nuevo, no
   * se cuenta como orden. `storeId` opcional (sin él, las 6 tiendas
   * combinadas).
   */
  async getTotals(startDay: string, endDay: string, storeId?: string): Promise<PosSalesTotals> {
    const { where, params } = this.buildWhere(startDay, endDay, storeId);
    const result = await this.pool.query<{
      total_sales: string;
      total_freight: string;
      total_credit_notes: string;
      total_orders: string;
    }>(
      `SELECT
         COALESCE(SUM(valor_neto), 0) AS total_sales,
         COALESCE(SUM(valor_neto) FILTER (WHERE NOT is_credit_note AND is_freight), 0) AS total_freight,
         COALESCE(SUM(valor_neto) FILTER (WHERE is_credit_note), 0) AS total_credit_notes,
         COUNT(DISTINCT (store_id || ':' || nro_documento)) FILTER (WHERE NOT is_credit_note) AS total_orders
       FROM pos_sales WHERE ${where}`,
      params,
    );
    const r = result.rows[0];
    return {
      totalSales: Number(r?.total_sales ?? 0),
      totalFreight: Number(r?.total_freight ?? 0),
      totalCreditNotes: Number(r?.total_credit_notes ?? 0),
      totalOrders: Number(r?.total_orders ?? 0),
    };
  }

  /** Venta por vendedor, YA NETA de sus notas crédito (ver comentario de `getTotals`) — `storeId` opcional. */
  async getBySeller(startDay: string, endDay: string, storeId?: string): Promise<PosSalesSellerRow[]> {
    const { where, params } = this.buildWhere(startDay, endDay, storeId);
    const result = await this.pool.query<{ nit_vendedor: string; nombre_vendedor: string | null; orders: string; sales: string }>(
      `SELECT nit_vendedor, MAX(nombre_vendedor) AS nombre_vendedor,
              COUNT(DISTINCT (store_id || ':' || nro_documento)) FILTER (WHERE NOT is_credit_note) AS orders,
              COALESCE(SUM(valor_neto), 0) AS sales
       FROM pos_sales
       WHERE ${where} AND nit_vendedor IS NOT NULL
       GROUP BY nit_vendedor ORDER BY sales DESC`,
      params,
    );
    return result.rows.map((r) => ({
      nitVendedor: r.nit_vendedor,
      nombreVendedor: r.nombre_vendedor ?? r.nit_vendedor,
      orders: Number(r.orders),
      sales: Number(r.sales),
    }));
  }

  /** Venta por tienda, YA NETA de sus notas crédito (ver comentario de `getTotals`), siempre las 6 combinadas — para el desglose "por tienda" del resumen. */
  async getByStore(startDay: string, endDay: string): Promise<PosSalesStoreRow[]> {
    const result = await this.pool.query<{ store_id: string; orders: string; sales: string }>(
      `SELECT store_id,
              COUNT(DISTINCT nro_documento) FILTER (WHERE NOT is_credit_note) AS orders,
              COALESCE(SUM(valor_neto), 0) AS sales
       FROM pos_sales
       WHERE fecha BETWEEN $1 AND $2
       GROUP BY store_id ORDER BY sales DESC`,
      [startDay, endDay],
    );
    return result.rows.map((r) => ({ storeId: r.store_id, orders: Number(r.orders), sales: Number(r.sales) }));
  }

  /** Venta por (tienda, vendedor), ya neta de notas crédito — igual que `getBySeller` pero SIN combinar tiendas, para desglosar cada card del resumen. */
  async getBySellerByStore(startDay: string, endDay: string): Promise<PosSalesStoreSellerRow[]> {
    const result = await this.pool.query<{ store_id: string; nit_vendedor: string; nombre_vendedor: string | null; orders: string; sales: string }>(
      `SELECT store_id, nit_vendedor, MAX(nombre_vendedor) AS nombre_vendedor,
              COUNT(DISTINCT nro_documento) FILTER (WHERE NOT is_credit_note) AS orders,
              COALESCE(SUM(valor_neto), 0) AS sales
       FROM pos_sales
       WHERE fecha BETWEEN $1 AND $2 AND nit_vendedor IS NOT NULL
       GROUP BY store_id, nit_vendedor ORDER BY store_id, sales DESC`,
      [startDay, endDay],
    );
    return result.rows.map((r) => ({
      storeId: r.store_id,
      nitVendedor: r.nit_vendedor,
      nombreVendedor: r.nombre_vendedor ?? r.nit_vendedor,
      orders: Number(r.orders),
      sales: Number(r.sales),
    }));
  }

  /**
   * Venta por `marca` CRUDA dentro de una sola tienda — pensado para
   * Pilatos (única tienda multimarca: agrupa varias marcas reales del
   * ERP bajo un mismo `store_id`), para ver cuál marca vende más SIN
   * cambiar el total de la tienda (sigue siendo uno solo en `getByStore`).
   * Excluye fletes: su `marca` viene como "NO APLICA" (no es una marca
   * real) y su valor ya se muestra aparte en el cuadro de fletes. Ya neta
   * de notas crédito (ver comentario de `getTotals`) — sí las incluye en
   * la suma de `valor_neto`, solo no las cuenta como "documento" (orden).
   */
  async getByMarca(startDay: string, endDay: string, storeId: string): Promise<PosSalesBrandRow[]> {
    const result = await this.pool.query<{ marca: string; orders: string; sales: string }>(
      `SELECT marca,
              COUNT(DISTINCT nro_documento) FILTER (WHERE NOT is_credit_note) AS orders,
              COALESCE(SUM(valor_neto), 0) AS sales
       FROM pos_sales
       WHERE fecha BETWEEN $1 AND $2 AND NOT is_freight AND store_id = $3
       GROUP BY marca ORDER BY sales DESC`,
      [startDay, endDay, storeId],
    );
    return result.rows.map((r) => ({ marca: r.marca, orders: Number(r.orders), sales: Number(r.sales) }));
  }

  /**
   * Venta mensual combinando las 6 tiendas, ya neta de notas crédito —
   * para la pestaña "Resumen" (`SmartSaleCombinedService`), que suma esto
   * con la tendencia mensual VTEX existente. Sin columnas `year`/`month`
   * generadas en la tabla (a diferencia de `credit_notes`): se agrupa con
   * `to_char` directo, sin necesidad de una migración nueva.
   */
  async getMonthlyTotals(startDay: string, endDay: string): Promise<{ month: string; orders: number; sales: number }[]> {
    const result = await this.pool.query<{ month: string; orders: string; sales: string }>(
      `SELECT to_char(fecha, 'YYYY-MM') AS month,
              COUNT(DISTINCT (store_id || ':' || nro_documento)) FILTER (WHERE NOT is_credit_note) AS orders,
              COALESCE(SUM(valor_neto), 0) AS sales
       FROM pos_sales
       WHERE fecha BETWEEN $1 AND $2
       GROUP BY 1 ORDER BY 1`,
      [startDay, endDay],
    );
    return result.rows.map((r) => ({ month: r.month, orders: Number(r.orders), sales: Number(r.sales) }));
  }

  /** Última vez que se sincronizó CUALQUIER venta POS contra el ERP — mismo criterio que `CreditNotesRepository.getLastSyncedAt` (esta tabla tampoco tiene fila en `sync_logs`). */
  async getLastSyncedAt(): Promise<string | null> {
    const result = await this.pool.query<{ last_synced_at: string | null }>('SELECT MAX(synced_at) AS last_synced_at FROM pos_sales');
    return result.rows[0]?.last_synced_at ?? null;
  }

  private buildWhere(startDay: string, endDay: string, storeId?: string): { where: string; params: unknown[] } {
    const params: unknown[] = [startDay, endDay];
    let where = 'fecha BETWEEN $1 AND $2';
    if (storeId) {
      params.push(storeId);
      where += ` AND store_id = $${params.length}`;
    }
    return { where, params };
  }
}
