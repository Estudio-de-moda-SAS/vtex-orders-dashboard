import { Injectable } from '@nestjs/common';

import { toDayBucketColombia } from '../../../common/utils/date-range.util';
import { VtexOrder } from '../../orders/interfaces/vtex-order.interface';
import { DatabaseService } from '../database.service';

export interface OrderSourceRef {
  storeId: string;
  /** 'main' | 'seller' | 'marketplace' */
  sourceType: string;
  /** Vacío para 'main'; nombre del seller o salesChannelId para segmentos. */
  sourceKey: string;
}

/**
 * Repositorio de acceso a la tabla `orders` del caché histórico local.
 * Ningún otro archivo debe escribir SQL directamente sobre esta tabla —
 * todo pasa por aquí.
 */
@Injectable()
export class OrdersCacheRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Inserta o reemplaza un lote de órdenes para una fuente (tienda o segmento) dada. */
  upsertOrders(ref: OrderSourceRef, orders: VtexOrder[]): void {
    if (orders.length === 0) return;
    const db = this.databaseService.getConnection();

    const stmt = db.prepare(`
      INSERT INTO orders (
        store_id, source_type, source_key, order_id, creation_date, day_bucket,
        status, status_description, total_value, currency_code, payment_names,
        sales_channel, origin, total_items, hostname, raw_json
      ) VALUES (
        @storeId, @sourceType, @sourceKey, @orderId, @creationDate, @dayBucket,
        @status, @statusDescription, @totalValue, @currencyCode, @paymentNames,
        @salesChannel, @origin, @totalItems, @hostname, @rawJson
      )
      ON CONFLICT(store_id, source_type, source_key, order_id) DO UPDATE SET
        creation_date = excluded.creation_date,
        day_bucket = excluded.day_bucket,
        status = excluded.status,
        status_description = excluded.status_description,
        total_value = excluded.total_value,
        currency_code = excluded.currency_code,
        payment_names = excluded.payment_names,
        sales_channel = excluded.sales_channel,
        origin = excluded.origin,
        total_items = excluded.total_items,
        hostname = excluded.hostname,
        raw_json = excluded.raw_json
    `);

    // `node:sqlite` no tiene un helper `db.transaction()` como
    // `better-sqlite3`; se envuelve manualmente en BEGIN/COMMIT (con
    // ROLLBACK si algo falla) para que el lote se escriba atómicamente y
    // rápido, en vez de una transacción implícita por cada fila.
    db.exec('BEGIN');
    try {
      for (const order of orders) {
        stmt.run({
          storeId: ref.storeId,
          sourceType: ref.sourceType,
          sourceKey: ref.sourceKey,
          orderId: order.orderId,
          creationDate: order.creationDate,
          dayBucket: toDayBucketColombia(order.creationDate),
          status: order.status ?? null,
          statusDescription: order.statusDescription ?? null,
          totalValue: order.totalValue ?? null,
          currencyCode: order.currencyCode ?? null,
          paymentNames: order.paymentNames ?? null,
          salesChannel: order.salesChannel ?? null,
          origin: order.origin ?? null,
          totalItems: order.totalItems ?? null,
          hostname: order.hostname ?? null,
          rawJson: JSON.stringify(order),
        });
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Retorna las órdenes cacheadas de una fuente para un rango de días
   * (inclusive), leyendo por `day_bucket` (rápido gracias al índice).
   */
  getOrdersInRange(ref: OrderSourceRef, startDayBucket: string, endDayBucket: string): VtexOrder[] {
    const db = this.databaseService.getConnection();
    const rows = db
      .prepare(
        `SELECT raw_json, city FROM orders
         WHERE store_id = ? AND source_type = ? AND source_key = ?
           AND day_bucket BETWEEN ? AND ?`,
      )
      .all(ref.storeId, ref.sourceType, ref.sourceKey, startDayBucket, endDayBucket) as unknown as {
      raw_json: string;
      city: string | null;
    }[];

    return rows.map((row) => this.rowToOrder(row));
  }

  /** Retorna todas las órdenes cacheadas de TODAS las fuentes de una tienda (main + segmentos) en un rango de días. */
  getAllStoreOrdersInRange(storeId: string, startDayBucket: string, endDayBucket: string): VtexOrder[] {
    const db = this.databaseService.getConnection();
    const rows = db
      .prepare(
        `SELECT raw_json, city FROM orders
         WHERE store_id = ?
           AND day_bucket BETWEEN ? AND ?`,
      )
      .all(storeId, startDayBucket, endDayBucket) as unknown as { raw_json: string; city: string | null }[];

    return rows.map((row) => this.rowToOrder(row));
  }

  /**
   * Mezcla la columna `city` (poblada por `OrderCityEnrichmentService`,
   * fuera de `raw_json`) sobre la orden reconstruida desde `raw_json`. Se
   * omite solo si es `NULL` (todavía no revisada) — a propósito NO se usa
   * un chequeo "truthy" (`row.city ? ...`), porque `''` (revisada, sin
   * ciudad) es un valor válido y distinto de `NULL` que sí debe copiarse;
   * un chequeo truthy lo confundiría con "todavía no revisada".
   */
  private rowToOrder(row: { raw_json: string; city: string | null }): VtexOrder {
    const order = JSON.parse(row.raw_json) as VtexOrder;
    return row.city !== null ? { ...order, city: row.city } : order;
  }

  /**
   * Escribe la ciudad normalizada de UNA orden (identificada por
   * `storeId`/`orderId`) en TODAS sus filas cacheadas — el mismo `orderId`
   * puede repetirse bajo distintos `source_type`/`source_key` si la tienda
   * tiene segmentos (sellers/marketplaces), pero la ciudad de envío es la
   * misma orden física, así que se actualiza de una sola vez. Nunca toca
   * `raw_json` ni ninguna otra columna.
   */
  updateCity(storeId: string, orderId: string, city: string): void {
    const db = this.databaseService.getConnection();
    db.prepare(`UPDATE orders SET city = ? WHERE store_id = ? AND order_id = ?`).run(city, storeId, orderId);
  }

  /**
   * Retorna hasta `limit` pares (storeId, orderId) distintos de órdenes que
   * todavía no tienen ciudad resuelta (`city IS NULL`), de la MÁS reciente
   * a la más antigua (`day_bucket DESC`). Se deduplica por `orderId` porque
   * una misma orden puede aparecer cacheada varias veces (main + segmentos)
   * y solo hace falta UNA llamada al detalle de VTEX por orden real.
   *
   * El orden por recencia es deliberado: sin él, con un backlog histórico
   * de decenas de miles de órdenes, el backfill terminaría procesando
   * primero lo más viejo (por ser lo que se cacheó primero) y las órdenes
   * del mes en curso — las que la gente realmente está mirando en el
   * dashboard — podrían tardar muchísimo en resolverse.
   *
   * Como el resultado siempre excluye lo ya resuelto, llamar este método
   * repetidamente (en el mismo proceso o tras un reinicio) es la base de
   * la resumibilidad del backfill: nunca hace falta un cursor ni un
   * checkpoint aparte.
   */
  findOrdersMissingCity(limit: number): { storeId: string; orderId: string }[] {
    const db = this.databaseService.getConnection();
    const rows = db
      .prepare(
        `SELECT store_id, order_id, MAX(day_bucket) AS day_bucket
         FROM orders
         WHERE city IS NULL
         GROUP BY store_id, order_id
         ORDER BY day_bucket DESC
         LIMIT ?`,
      )
      .all(limit) as unknown as { store_id: string; order_id: string }[];
    return rows.map((row) => ({ storeId: row.store_id, orderId: row.order_id }));
  }

  /** Cuenta cuántas órdenes (deduplicadas por `orderId`) todavía no tienen ciudad resuelta. */
  countOrdersMissingCity(): number {
    const db = this.databaseService.getConnection();
    const row = db
      .prepare(`SELECT COUNT(DISTINCT order_id) AS total FROM orders WHERE city IS NULL`)
      .get() as unknown as { total: number };
    return row.total;
  }
}
