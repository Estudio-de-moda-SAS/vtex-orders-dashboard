import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import { ErpLineKind } from '../../../common/utils/erp-sales.util';
import { PG_POOL } from '../pg-pool.provider';

const BATCH_SIZE = 500;

/** Una fila de `erp_sales` — ver migración 0026. */
export interface ErpSaleDbRow {
  /** "YYYY-MM-DD". */
  fecha: string;
  co: string;
  descCo: string | null;
  storeId: string;
  nroDocumento: string;
  doctoReferencia: string | null;
  doctoRemision: string | null;
  codigoVendedor: string | null;
  estadoDocto: string | null;
  clienteFactura: string | null;
  bodega: string | null;
  item: number | null;
  referencia: string | null;
  descItem: string | null;
  cantidad: number | null;
  valorNeto: number;
  valorBruto: number | null;
  valorDescuentos: number | null;
  valorImpuestos: number | null;
  valorSubtotal: number | null;
  marca: string | null;
  categoria: string | null;
  tipo: string | null;
  costoPromedioTotal: number | null;
  utilidadPromedio: number | null;
  pedidoVtex: string | null;
  lineKind: ErpLineKind;
}

/** Totales de `valor_neto` (con IVA) por tipo de línea — `total` = producto + flete + empaque. */
export interface ErpSalesTotalsRow {
  storeId: string;
  total: number;
  freight: number;
  packaging: number;
  product: number;
  /** Facturas distintas (`nro_documento`). */
  invoices: number;
  /** Unidades de producto (excluye flete y empaque). */
  units: number;
}

const COLUMNS = [
  'fecha', 'co', 'desc_co', 'store_id', 'nro_documento', 'docto_referencia', 'docto_remision', 'codigo_vendedor',
  'estado_docto', 'cliente_factura', 'bodega', 'item', 'referencia', 'desc_item', 'cantidad', 'valor_neto',
  'valor_bruto', 'valor_descuentos', 'valor_impuestos', 'valor_subtotal', 'marca', 'categoria', 'tipo',
  'costo_promedio_total', 'utilidad_promedio', 'pedido_vtex', 'line_kind',
];

function rowValues(r: ErpSaleDbRow): unknown[] {
  return [
    r.fecha, r.co, r.descCo, r.storeId, r.nroDocumento, r.doctoReferencia, r.doctoRemision, r.codigoVendedor,
    r.estadoDocto, r.clienteFactura, r.bodega, r.item, r.referencia, r.descItem, r.cantidad, r.valorNeto,
    r.valorBruto, r.valorDescuentos, r.valorImpuestos, r.valorSubtotal, r.marca, r.categoria, r.tipo,
    r.costoPromedioTotal, r.utilidadPromedio, r.pedidoVtex, r.lineKind,
  ];
}

@Injectable()
export class ErpSalesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Reemplaza TODAS las filas del rango [fromDay, toDay] en una transacción — re-sincronizar nunca duplica. */
  async replaceRange(fromDay: string, toDay: string, rows: ErpSaleDbRow[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM erp_sales WHERE fecha BETWEEN $1 AND $2', [fromDay, toDay]);
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

  private async insertBatch(client: PoolClient, batch: ErpSaleDbRow[]): Promise<void> {
    if (batch.length === 0) return;
    const params: unknown[] = [];
    const valuesSql = batch
      .map((row) => {
        const placeholders = rowValues(row).map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');
    await client.query(`INSERT INTO erp_sales (${COLUMNS.join(', ')}) VALUES ${valuesSql}`, params);
  }

  /** Totales por tienda del rango (solo tiendas con al menos una línea). */
  async getTotalsByStore(startDay: string, endDay: string): Promise<ErpSalesTotalsRow[]> {
    const result = await this.pool.query<{
      store_id: string;
      total: string;
      freight: string;
      packaging: string;
      product: string;
      invoices: string;
      units: string;
    }>(
      `SELECT store_id,
              COALESCE(SUM(valor_neto), 0) AS total,
              COALESCE(SUM(valor_neto) FILTER (WHERE line_kind = 'freight'), 0) AS freight,
              COALESCE(SUM(valor_neto) FILTER (WHERE line_kind = 'packaging'), 0) AS packaging,
              COALESCE(SUM(valor_neto) FILTER (WHERE line_kind = 'product'), 0) AS product,
              COUNT(DISTINCT nro_documento) AS invoices,
              COALESCE(SUM(cantidad) FILTER (WHERE line_kind = 'product'), 0) AS units
       FROM erp_sales
       WHERE fecha BETWEEN $1 AND $2
       GROUP BY store_id`,
      [startDay, endDay],
    );
    return result.rows.map((r) => ({
      storeId: r.store_id,
      total: Number(r.total),
      freight: Number(r.freight),
      packaging: Number(r.packaging),
      product: Number(r.product),
      invoices: Number(r.invoices),
      units: Number(r.units),
    }));
  }

  /** Último día con datos y última sincronización — para avisar en pantalla hasta dónde llegan los datos. */
  async getSyncInfo(): Promise<{ lastSyncedAt: string | null; lastDataDay: string | null }> {
    const result = await this.pool.query<{ last_synced_at: string | null; last_data_day: string | null }>(
      `SELECT MAX(synced_at) AS last_synced_at, to_char(MAX(fecha), 'YYYY-MM-DD') AS last_data_day FROM erp_sales`,
    );
    return { lastSyncedAt: result.rows[0]?.last_synced_at ?? null, lastDataDay: result.rows[0]?.last_data_day ?? null };
  }
}
