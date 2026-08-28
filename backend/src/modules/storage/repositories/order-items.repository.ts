import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database.service';
import { OrderSourceRef } from './orders-cache.repository';

/** Un producto ya listo para guardar en `order_items` (precios ya normalizados, descuento ya calculado). */
export interface OrderItemToStore {
  ean: string;
  skuId: string;
  productName: string;
  category: string;
  brand: string;
  quantity: number;
  listPrice: number;
  sellingPrice: number;
  discountPercentage: number;
}

/** Fila de `order_items` combinada con el status de su orden — ver `getItemsWithOrderStatus`. */
export interface OrderItemWithStatus {
  category: string;
  brand: string;
  quantity: number;
  sellingPrice: number;
  discountPercentage: number;
  orderStatus: string | null;
  orderStatusDescription: string | null;
}

/**
 * Repositorio de acceso a la tabla `order_items` (detalle a nivel de
 * producto, poblado por `OrderCityEnrichmentService` en la misma pasada
 * donde resuelve la ciudad de una orden). Ningún otro archivo debe
 * escribir SQL directamente sobre esta tabla — todo pasa por aquí.
 */
@Injectable()
export class OrderItemsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Guarda todos los productos de UNA orden de una sola vez (reemplaza
   * cualquier fila previa de esa orden — relevante solo si alguna vez se
   * reprocesa la misma orden, algo que hoy no ocurre en el flujo normal
   * ya que el enriquecimiento nunca revisita una orden ya resuelta).
   *
   * Se espera que `items` ya venga deduplicado por (ean, skuId) — ver
   * `OrderCityEnrichmentService.mergeDuplicateItems` — porque VTEX puede
   * reportar dos líneas con la misma llave dentro de la misma orden (ej.
   * productos sin EAN/SKU real, ambos cayendo en la key vacía `''`). El
   * `ON CONFLICT DO UPDATE` de abajo es solo una segunda capa de defensa
   * (evita que una falla de deduplicación tumbe la orden entera con un
   * error de UNIQUE constraint) — "último valor gana" en ese caso, no
   * intenta sumar cantidades.
   */
  upsertItems(ref: OrderSourceRef, orderId: string, dayBucket: string, items: OrderItemToStore[]): void {
    const db = this.databaseService.getConnection();

    const deleteStmt = db.prepare(
      `DELETE FROM order_items WHERE store_id = ? AND source_type = ? AND source_key = ? AND order_id = ?`,
    );
    const insertStmt = db.prepare(`
      INSERT INTO order_items (
        store_id, source_type, source_key, order_id, ean, sku_id, product_name,
        category, brand, quantity, list_price, selling_price, discount_percentage, day_bucket
      ) VALUES (
        @storeId, @sourceType, @sourceKey, @orderId, @ean, @skuId, @productName,
        @category, @brand, @quantity, @listPrice, @sellingPrice, @discountPercentage, @dayBucket
      )
      ON CONFLICT(store_id, source_type, source_key, order_id, ean, sku_id) DO UPDATE SET
        product_name = excluded.product_name,
        category = excluded.category,
        brand = excluded.brand,
        quantity = excluded.quantity,
        list_price = excluded.list_price,
        selling_price = excluded.selling_price,
        discount_percentage = excluded.discount_percentage,
        day_bucket = excluded.day_bucket
    `);

    db.exec('BEGIN');
    try {
      deleteStmt.run(ref.storeId, ref.sourceType, ref.sourceKey, orderId);
      for (const item of items) {
        insertStmt.run({
          storeId: ref.storeId,
          sourceType: ref.sourceType,
          sourceKey: ref.sourceKey,
          orderId,
          ean: item.ean,
          skuId: item.skuId,
          productName: item.productName,
          category: item.category,
          brand: item.brand,
          quantity: item.quantity,
          listPrice: item.listPrice,
          sellingPrice: item.sellingPrice,
          discountPercentage: item.discountPercentage,
          dayBucket: dayBucket,
        });
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Retorna las filas de `order_items` de un rango de días (opcionalmente
   * limitado a una tienda y/o a una fuente específica — sin `storeId`,
   * cubre TODAS las tiendas, usado para el aporte general por categoría),
   * combinadas con el `status`/`status_description` de su orden — vía
   * JOIN contra `orders` por la misma llave compuesta que ambas tablas
   * comparten (`store_id, source_type, source_key, order_id`). Se usa
   * para poder filtrar por status "contabilizado" en
   * `ProductAnalyticsService` sin tener que parsear `raw_json` fila por
   * fila. No hay riesgo de doble conteo por segmentos: a diferencia de
   * `orders`, cada orden física tiene UNA sola fila de productos en
   * `order_items` (ver `upsertItems`), sin importar cuántas fuentes
   * (main/seller/marketplace) la contengan en `orders`.
   */
  getItemsWithOrderStatus(
    startDayBucket: string,
    endDayBucket: string,
    storeId?: string,
    sourceType?: string,
  ): OrderItemWithStatus[] {
    const db = this.databaseService.getConnection();
    const storeFilter = storeId ? 'AND oi.store_id = ?' : '';
    const sourceFilter = sourceType ? 'AND oi.source_type = ?' : '';
    const params: string[] = [startDayBucket, endDayBucket];
    if (storeId) params.push(storeId);
    if (sourceType) params.push(sourceType);

    const rows = db
      .prepare(
        `SELECT
           oi.category AS category,
           oi.brand AS brand,
           oi.quantity AS quantity,
           oi.selling_price AS selling_price,
           oi.discount_percentage AS discount_percentage,
           o.status AS order_status,
           o.status_description AS order_status_description
         FROM order_items oi
         JOIN orders o
           ON oi.store_id = o.store_id
          AND oi.source_type = o.source_type
          AND oi.source_key = o.source_key
          AND oi.order_id = o.order_id
         WHERE oi.day_bucket BETWEEN ? AND ?
           ${storeFilter}
           ${sourceFilter}`,
      )
      .all(...params) as unknown as {
      category: string;
      brand: string;
      quantity: number;
      selling_price: number | null;
      discount_percentage: number | null;
      order_status: string | null;
      order_status_description: string | null;
    }[];

    return rows.map((row) => ({
      category: row.category,
      brand: row.brand,
      quantity: row.quantity,
      sellingPrice: row.selling_price ?? 0,
      discountPercentage: row.discount_percentage ?? 0,
      orderStatus: row.order_status,
      orderStatusDescription: row.order_status_description,
    }));
  }
}
