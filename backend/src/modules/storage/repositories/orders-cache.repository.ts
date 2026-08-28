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

/** Resultado de `findOrdersNeedingEnrichment` — ver su comentario para el significado de `sourceType`/`sourceKey`. */
export interface OrderNeedingEnrichment {
  storeId: string;
  orderId: string;
  sourceType: string;
  sourceKey: string;
  dayBucket: string;
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
   * Marca que YA se le extrajeron (o se intentó extraer) los productos a
   * una orden — ver el comentario junto a `items_enriched_at` en
   * `DatabaseService.runMigrations` para por qué esto es una señal
   * SEPARADA de `city` y no simplemente "¿ya tiene filas en
   * `order_items`?". Se llama SIEMPRE que se procesa el detalle de una
   * orden, incluso si terminó sin productos que guardar (una orden con 0
   * ítems reales no debe reintentarse por siempre).
   */
  markItemsEnriched(storeId: string, orderId: string): void {
    const db = this.databaseService.getConnection();
    db.prepare(`UPDATE orders SET items_enriched_at = ? WHERE store_id = ? AND order_id = ?`).run(
      new Date().toISOString(),
      storeId,
      orderId,
    );
  }

  /**
   * Retorna hasta `limit` órdenes distintas que todavía necesitan
   * enriquecimiento — ciudad sin resolver (`city IS NULL`) O productos
   * sin extraer (`items_enriched_at IS NULL`, incluye el backlog de
   * órdenes que ya tenían `city` resuelta de ANTES de que existiera
   * `order_items` — ver comentario de esa columna) —, de la MÁS reciente
   * a la más antigua (`day_bucket DESC`). Se deduplica por `orderId`
   * porque una misma orden puede aparecer cacheada varias veces (main +
   * segmentos) y solo hace falta UNA llamada al detalle de VTEX por
   * orden real — `sourceType`/`sourceKey` en el resultado son de UNA
   * fila cualquiera de las que existan para esa orden (SQLite los toma
   * de un registro arbitrario dentro del grupo; sirve porque solo se
   * usan para tener una `OrderSourceRef` VÁLIDA al guardar
   * `order_items`, no para identificar una fuente específica — ciudad y
   * productos son hechos de la orden física, no de la fuente).
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
  findOrdersNeedingEnrichment(limit: number): OrderNeedingEnrichment[] {
    const db = this.databaseService.getConnection();
    const rows = db
      .prepare(
        `SELECT store_id, order_id, source_type, source_key, MAX(day_bucket) AS day_bucket
         FROM orders
         WHERE city IS NULL OR items_enriched_at IS NULL
         GROUP BY store_id, order_id
         ORDER BY day_bucket DESC
         LIMIT ?`,
      )
      .all(limit) as unknown as {
      store_id: string;
      order_id: string;
      source_type: string;
      source_key: string;
      day_bucket: string;
    }[];
    return rows.map((row) => ({
      storeId: row.store_id,
      orderId: row.order_id,
      sourceType: row.source_type,
      sourceKey: row.source_key,
      dayBucket: row.day_bucket,
    }));
  }

  /** Cuenta cuántas órdenes (deduplicadas por `orderId`) todavía necesitan enriquecimiento — ver `findOrdersNeedingEnrichment`. */
  countOrdersNeedingEnrichment(): number {
    const db = this.databaseService.getConnection();
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT order_id) AS total FROM orders WHERE city IS NULL OR items_enriched_at IS NULL`,
      )
      .get() as unknown as { total: number };
    return row.total;
  }

  /**
   * Cuenta órdenes totales vs. ya COMPLETAMENTE enriquecidas (ciudad Y
   * productos, no solo una de las dos — ver `findOrdersNeedingEnrichment`),
   * deduplicadas por `orderId`, para una tienda, opcionalmente acotado a
   * un rango de días. Usado por el endpoint de progreso del
   * enriquecimiento (`GET /api/sync/enrichment-status`) — sin rango,
   * cubre todo el histórico cacheado de esa tienda.
   */
  getEnrichmentStatus(
    storeId: string,
    startDayBucket?: string,
    endDayBucket?: string,
  ): { total: number; enriched: number } {
    const db = this.databaseService.getConnection();
    const rangeFilter = startDayBucket && endDayBucket ? 'AND day_bucket BETWEEN ? AND ?' : '';
    const params = startDayBucket && endDayBucket ? [storeId, startDayBucket, endDayBucket] : [storeId];

    const row = db
      .prepare(
        `SELECT
           COUNT(DISTINCT order_id) AS total,
           COUNT(DISTINCT CASE WHEN city IS NOT NULL AND items_enriched_at IS NOT NULL THEN order_id END) AS enriched
         FROM orders
         WHERE store_id = ? ${rangeFilter}`,
      )
      .get(...params) as unknown as { total: number; enriched: number };

    return { total: row.total, enriched: row.enriched };
  }
}
