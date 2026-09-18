import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import { DailyAggregationResult } from '../../../common/aggregation/types';
import { PG_POOL } from '../pg-pool.provider';

/** Un día+tienda cuyos agregados se van a recalcular por completo. */
export interface TouchedDay {
  date: string;
  storeId: string;
}

/** Filas por sentencia INSERT — ver la misma constante/razón en `reference.repository.ts`. */
const BATCH_SIZE = 1000;

/**
 * Escribe los agregados diarios calculados por `aggregateDailyRows` (ver
 * `common/aggregation/daily-aggregator.ts`) en las 11 tablas
 * `sales_daily*`. Cada llamada RECALCULA por completo los días indicados
 * en `touchedDays`: borra cualquier fila previa de esos días/tienda en
 * las 11 tablas y escribe las filas nuevas — nunca incrementa un valor
 * existente. Esto es necesario porque el cron siempre vuelve a traer el
 * conjunto COMPLETO de órdenes de la ventana de recálculo desde VTEX
 * (nunca incremental), así que un valor de dimensión que ya no aparece
 * (ej. una ciudad que solo tenía una orden que luego se canceló) debe
 * desaparecer también del agregado, no quedar con un número obsoleto.
 */
@Injectable()
export class SalesAggregatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async replaceAggregates(result: DailyAggregationResult, touchedDays: TouchedDay[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await this.deleteDays(client, touchedDays);

      await this.insertRows(client, 'sales_daily', ['date', 'store_id', 'orders', 'units', 'sales', 'discounts'], result.salesDaily.map((r) => [r.date, r.storeId, r.orders, r.units, r.sales, r.discounts]));

      await this.insertRows(client, 'sales_daily_by_status', ['date', 'store_id', 'status', 'orders', 'sales'], result.byStatus.map((r) => [r.date, r.storeId, r.status, r.orders, r.sales]));

      await this.insertRows(
        client,
        'sales_daily_by_payment',
        ['date', 'store_id', 'payment_method', 'orders', 'sales', 'revenue_orders', 'revenue_sales'],
        result.byPayment.map((r) => [r.date, r.storeId, r.paymentMethod, r.orders, r.sales, r.revenueOrders, r.revenueSales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_city',
        ['date', 'store_id', 'city', 'orders', 'sales', 'revenue_orders', 'revenue_sales'],
        result.byCity.map((r) => [r.date, r.storeId, r.city, r.orders, r.sales, r.revenueOrders, r.revenueSales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_category',
        ['date', 'store_id', 'category_name', 'units', 'sales', 'revenue_units', 'revenue_sales'],
        result.byCategory.map((r) => [r.date, r.storeId, r.categoryName, r.units, r.sales, r.revenueUnits, r.revenueSales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_brand',
        ['date', 'store_id', 'brand_name', 'units', 'sales', 'revenue_units', 'revenue_sales'],
        result.byBrand.map((r) => [r.date, r.storeId, r.brandName, r.units, r.sales, r.revenueUnits, r.revenueSales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_collection',
        ['date', 'store_id', 'collection_name', 'units', 'sales', 'revenue_units', 'revenue_sales'],
        result.byCollection.map((r) => [r.date, r.storeId, r.collectionName, r.units, r.sales, r.revenueUnits, r.revenueSales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_discount_campaign',
        ['date', 'store_id', 'campaign_name', 'orders', 'sales', 'revenue_orders', 'revenue_sales'],
        result.byDiscountCampaign.map((r) => [r.date, r.storeId, r.campaignName, r.orders, r.sales, r.revenueOrders, r.revenueSales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_discount_bucket',
        ['date', 'store_id', 'discount_percentage', 'units', 'sales'],
        result.byDiscountBucket.map((r) => [r.date, r.storeId, r.discountPercentage, r.units, r.sales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_category_brand',
        ['date', 'store_id', 'category_name', 'brand_name', 'units', 'sales'],
        result.byCategoryBrand.map((r) => [r.date, r.storeId, r.categoryName, r.brandName, r.units, r.sales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_collection_category',
        ['date', 'store_id', 'collection_name', 'category_name', 'units', 'sales'],
        result.byCollectionCategory.map((r) => [r.date, r.storeId, r.collectionName, r.categoryName, r.units, r.sales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_brand_discount_bucket',
        ['date', 'store_id', 'brand_name', 'discount_percentage', 'units', 'sales'],
        result.byBrandDiscountBucket.map((r) => [r.date, r.storeId, r.brandName, r.discountPercentage, r.units, r.sales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_seller',
        ['date', 'store_id', 'seller_name', 'orders', 'sales', 'revenue_orders', 'revenue_sales'],
        result.bySeller.map((r) => [r.date, r.storeId, r.sellerName, r.orders, r.sales, r.revenueOrders, r.revenueSales]),
      );

      await this.insertRows(
        client,
        'sales_daily_by_marketplace',
        ['date', 'store_id', 'marketplace_name', 'orders', 'sales', 'revenue_orders', 'revenue_sales'],
        result.byMarketplace.map((r) => [r.date, r.storeId, r.marketplaceName, r.orders, r.sales, r.revenueOrders, r.revenueSales]),
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Borra todos los días tocados de una sola vez POR TABLA (13 DELETE en
   * total, no 13×N) — asume que TODOS los `touchedDays` de una llamada
   * son de la MISMA tienda (siempre así en la práctica: el cron y el
   * importador de Excel procesan una tienda a la vez), así que basta
   * `store_id = $1 AND date = ANY($2)` en vez de repetir por cada día.
   * Antes esto era un DELETE por (día, tabla) — con un histórico de 6
   * meses (~180 días) eso eran miles de round-trips de red solo para
   * borrar, antes de insertar una sola fila nueva.
   */
  private async deleteDays(client: PoolClient, touchedDays: TouchedDay[]): Promise<void> {
    if (touchedDays.length === 0) return;
    const storeId = touchedDays[0].storeId;
    const dates = touchedDays.map((d) => d.date);

    const tables = [
      'sales_daily',
      'sales_daily_by_status',
      'sales_daily_by_payment',
      'sales_daily_by_city',
      'sales_daily_by_category',
      'sales_daily_by_brand',
      'sales_daily_by_category_brand',
      'sales_daily_by_collection_category',
      'sales_daily_by_collection',
      'sales_daily_by_discount_campaign',
      'sales_daily_by_discount_bucket',
      'sales_daily_by_brand_discount_bucket',
      'sales_daily_by_seller',
      'sales_daily_by_marketplace',
    ];
    for (const table of tables) {
      await client.query(`DELETE FROM ${table} WHERE store_id = $1 AND date = ANY($2::date[])`, [storeId, dates]);
    }
  }

  /**
   * INSERT multi-fila por lotes (`BATCH_SIZE` filas por sentencia) dentro
   * de una transacción ya abierta — no hace falta `ON CONFLICT` porque
   * `deleteDays` ya limpió el rango. Antes esto era una consulta de red
   * POR FILA (un archivo histórico de 6 meses puede generar decenas de
   * miles de filas de agregado entre las 13 tablas), lo que hacía que la
   * importación tardara un tiempo impracticable.
   */
  private async insertRows(
    client: PoolClient,
    table: string,
    columns: string[],
    rows: unknown[][],
  ): Promise<void> {
    if (rows.length === 0) return;

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const params: unknown[] = [];
      const valuesSql = batch
        .map((row) => {
          const placeholders = row.map((value) => {
            params.push(value);
            return `$${params.length}`;
          });
          return `(${placeholders.join(', ')})`;
        })
        .join(', ');
      await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuesSql}`, params);
    }
  }
}
