import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import { ErpChannel, ErpLineKind } from '../../../common/utils/erp-sales.util';
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
  channel: ErpChannel;
  /** "NVF-…" — se guarda, pero NUNCA entra en la venta (ver migración 0029). */
  isCreditNote: boolean;
}

/** Totales de `valor_neto` (con IVA) por tipo de línea — `total` = producto + flete + empaque. */
export interface ErpSalesBreakdownRow {
  total: number;
  freight: number;
  packaging: number;
  product: number;
  /** Facturas distintas (`nro_documento`). */
  invoices: number;
  /** Unidades de producto (excluye flete y empaque). */
  units: number;
}

export interface ErpSalesTotalsRow extends ErpSalesBreakdownRow {
  storeId: string;
}

/**
 * Agrupaciones permitidas para `getBreakdown` — lista cerrada (nunca texto
 * libre en el SQL). `product*`: solo líneas de producto (flete/empaque no
 * tienen marca/categoría real).
 */
const GROUPINGS = {
  none: { columns: [] as string[], productOnly: false },
  seller: { columns: ['codigo_vendedor'], productOnly: false },
  store: { columns: ['store_id'], productOnly: false },
  storeSeller: { columns: ['store_id', 'codigo_vendedor'], productOnly: false },
  storeMarca: { columns: ['store_id', 'marca'], productOnly: true },
  categoria: { columns: ['categoria'], productOnly: true },
} as const;
export type ErpSalesGrouping = keyof typeof GROUPINGS;

/** Fila de `getBreakdown`: el desglose + las columnas agrupadas (snake_case, como en la tabla). */
export type ErpSalesGroupedRow = ErpSalesBreakdownRow & { keys: Record<string, string | null> };

/** Notas crédito ("NVF-…") agrupadas — `value` y `units` vienen NEGATIVOS, tal cual el ERP. */
export interface ErpCreditNotesRow {
  keys: Record<string, string | null>;
  /** Notas crédito distintas (`store_id:nro_documento`). */
  count: number;
  value: number;
  units: number;
}

/** Agrupaciones permitidas para `getCreditNotes` — lista cerrada. */
const CREDIT_NOTE_GROUPINGS = {
  none: [] as string[],
  seller: ['codigo_vendedor'],
  store: ['store_id'],
  storeSeller: ['store_id', 'codigo_vendedor'],
} as const;
export type ErpCreditNotesGrouping = keyof typeof CREDIT_NOTE_GROUPINGS;

const COLUMNS = [
  'fecha', 'co', 'desc_co', 'store_id', 'nro_documento', 'docto_referencia', 'docto_remision', 'codigo_vendedor',
  'estado_docto', 'cliente_factura', 'bodega', 'item', 'referencia', 'desc_item', 'cantidad', 'valor_neto',
  'valor_bruto', 'valor_descuentos', 'valor_impuestos', 'valor_subtotal', 'marca', 'categoria', 'tipo',
  'costo_promedio_total', 'utilidad_promedio', 'pedido_vtex', 'line_kind', 'channel', 'is_credit_note',
];

function rowValues(r: ErpSaleDbRow): unknown[] {
  return [
    r.fecha, r.co, r.descCo, r.storeId, r.nroDocumento, r.doctoReferencia, r.doctoRemision, r.codigoVendedor,
    r.estadoDocto, r.clienteFactura, r.bodega, r.item, r.referencia, r.descItem, r.cantidad, r.valorNeto,
    r.valorBruto, r.valorDescuentos, r.valorImpuestos, r.valorSubtotal, r.marca, r.categoria, r.tipo,
    r.costoPromedioTotal, r.utilidadPromedio, r.pedidoVtex, r.lineKind, r.channel, r.isCreditNote,
  ];
}

@Injectable()
export class ErpSalesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Reemplaza TODAS las filas del rango [fromDay, toDay] en una transacción
   * — re-sincronizar nunca duplica — y registra el rango como sincronizado
   * (`erp_sales_synced_ranges`, migración 0028), incluso si no trajo
   * ninguna factura (domingo/festivo).
   */
  async replaceRange(fromDay: string, toDay: string, rows: ErpSaleDbRow[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM erp_sales WHERE fecha BETWEEN $1 AND $2', [fromDay, toDay]);
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        await this.insertBatch(client, rows.slice(start, start + BATCH_SIZE));
      }
      await client.query(
        `INSERT INTO erp_sales_synced_ranges (from_day, to_day, synced_at) VALUES ($1, $2, now())
         ON CONFLICT (from_day, to_day) DO UPDATE SET synced_at = now()`,
        [fromDay, toDay],
      );
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

  /** Totales por tienda del rango para un canal (solo tiendas con al menos una línea). */
  async getTotalsByStore(startDay: string, endDay: string, channel: ErpChannel): Promise<ErpSalesTotalsRow[]> {
    const rows = await this.getBreakdown(startDay, endDay, channel, 'store');
    return rows.map(({ keys, ...b }) => ({ ...b, storeId: keys.store_id ?? '' }));
  }

  /**
   * Desglose (total/flete/empaque/producto, facturas, unidades) agrupado
   * según `grouping`. `invoices` = facturas DISTINTAS por tienda
   * (`store_id:nro_documento`) — una factura con varias líneas cuenta una
   * vez. `units` = `cantidad` de líneas de producto (sin flete/empaque),
   * base del UPT. Ordenado por venta total descendente.
   */
  async getBreakdown(startDay: string, endDay: string, channel: ErpChannel, grouping: ErpSalesGrouping): Promise<ErpSalesGroupedRow[]> {
    const { columns, productOnly } = GROUPINGS[grouping];
    const select = columns.length > 0 ? `${columns.join(', ')}, ` : '';
    const groupBy = columns.length > 0 ? `GROUP BY ${columns.join(', ')}` : '';
    const result = await this.pool.query<Record<string, string | null>>(
      `SELECT ${select}
              COALESCE(SUM(valor_neto), 0) AS total,
              COALESCE(SUM(valor_neto) FILTER (WHERE line_kind = 'freight'), 0) AS freight,
              COALESCE(SUM(valor_neto) FILTER (WHERE line_kind = 'packaging'), 0) AS packaging,
              COALESCE(SUM(valor_neto) FILTER (WHERE line_kind = 'product'), 0) AS product,
              COUNT(DISTINCT (store_id || ':' || nro_documento)) AS invoices,
              COALESCE(SUM(cantidad) FILTER (WHERE line_kind = 'product'), 0) AS units
       FROM erp_sales
       WHERE fecha BETWEEN $1 AND $2 AND channel = $3 AND NOT is_credit_note${productOnly ? " AND line_kind = 'product'" : ''}
       ${groupBy}
       ORDER BY total DESC`,
      [startDay, endDay, channel],
    );
    return result.rows.map((r) => ({
      keys: Object.fromEntries(columns.map((c) => [c, r[c] ?? null])),
      total: Number(r.total),
      freight: Number(r.freight),
      packaging: Number(r.packaging),
      product: Number(r.product),
      invoices: Number(r.invoices),
      units: Number(r.units),
    }));
  }

  /**
   * Notas crédito de un canal, agrupadas según `grouping` — se muestran
   * aparte, NUNCA se restan de la venta (decisión del usuario).
   */
  async getCreditNotes(startDay: string, endDay: string, channel: ErpChannel, grouping: ErpCreditNotesGrouping): Promise<ErpCreditNotesRow[]> {
    const columns = CREDIT_NOTE_GROUPINGS[grouping];
    const select = columns.length > 0 ? `${columns.join(', ')}, ` : '';
    const groupBy = columns.length > 0 ? `GROUP BY ${columns.join(', ')}` : '';
    const result = await this.pool.query<Record<string, string | null>>(
      `SELECT ${select}
              COUNT(DISTINCT (store_id || ':' || nro_documento)) AS count,
              COALESCE(SUM(valor_neto), 0) AS value,
              COALESCE(SUM(cantidad), 0) AS units
       FROM erp_sales
       WHERE fecha BETWEEN $1 AND $2 AND channel = $3 AND is_credit_note
       ${groupBy}
       ORDER BY value ASC`,
      [startDay, endDay, channel],
    );
    return result.rows.map((r) => ({
      keys: Object.fromEntries(columns.map((c) => [c, r[c] ?? null])),
      count: Number(r.count),
      value: Number(r.value),
      units: Number(r.units),
    }));
  }

  /** Venta total y facturas por mes de un canal — para la tendencia mensual del "Resumen" de SmartSale. */
  async getMonthlyTotals(startDay: string, endDay: string, channel: ErpChannel): Promise<{ month: string; orders: number; sales: number }[]> {
    const result = await this.pool.query<{ month: string; orders: string; sales: string }>(
      `SELECT to_char(fecha, 'YYYY-MM') AS month,
              COUNT(DISTINCT (store_id || ':' || nro_documento)) AS orders,
              COALESCE(SUM(valor_neto), 0) AS sales
       FROM erp_sales
       WHERE fecha BETWEEN $1 AND $2 AND channel = $3 AND NOT is_credit_note
       GROUP BY 1 ORDER BY 1`,
      [startDay, endDay, channel],
    );
    return result.rows.map((r) => ({ month: r.month, orders: Number(r.orders), sales: Number(r.sales) }));
  }

  /**
   * Primer día YA SINCRONIZADO contra el ERP ("YYYY-MM-DD", de
   * `erp_sales_synced_ranges` — no `MIN(fecha)`: un día sin facturas no
   * deja filas en `erp_sales`). Un día sincronizado lo está para ambos
   * canales. Antes de ese día no hay ERP (el histórico llegará por Excel).
   * `null` si nunca se sincronizó.
   */
  async getCoverageStartDay(): Promise<string | null> {
    const result = await this.pool.query<{ day: string | null }>(
      `SELECT to_char(MIN(from_day), 'YYYY-MM-DD') AS day FROM erp_sales_synced_ranges`,
    );
    return result.rows[0]?.day ?? null;
  }

  /** Último día con datos y última sincronización — para avisar en pantalla hasta dónde llegan los datos. */
  async getSyncInfo(): Promise<{ lastSyncedAt: string | null; lastDataDay: string | null }> {
    // Desde `erp_sales_synced_ranges` (no `erp_sales`): cuenta el último día
    // SINCRONIZADO aunque no haya tenido facturas, y vale para ambos canales.
    const result = await this.pool.query<{ last_synced_at: string | null; last_data_day: string | null }>(
      `SELECT MAX(synced_at) AS last_synced_at, to_char(MAX(to_day), 'YYYY-MM-DD') AS last_data_day FROM erp_sales_synced_ranges`,
    );
    return { lastSyncedAt: result.rows[0]?.last_synced_at ?? null, lastDataDay: result.rows[0]?.last_data_day ?? null };
  }
}
