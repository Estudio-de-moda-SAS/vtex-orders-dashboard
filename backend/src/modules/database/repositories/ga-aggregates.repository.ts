import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

import { PG_POOL } from '../pg-pool.provider';

const BATCH_SIZE = 1000;

export interface GaDailyRow {
  date: string;
  storeId: string;
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  itemViews: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  gaRevenue: number;
}

export interface GaDailyByChannelRow {
  date: string;
  storeId: string;
  channelGroup: string;
  sessions: number;
  /** Suma diaria — NO deduplicado entre días (ver nota de la migración 0013). */
  totalUsers: number;
  purchases: number;
  gaRevenue: number;
}

export interface GaDailyByDeviceRow {
  date: string;
  storeId: string;
  deviceCategory: string;
  sessions: number;
  /** Suma diaria — NO deduplicado entre días (ver nota de la migración 0013). */
  totalUsers: number;
  purchases: number;
  gaRevenue: number;
}

export interface GaDailyByLandingPageRow {
  date: string;
  storeId: string;
  /** Top 20 por día/tienda — el resto se agrupa en una fila `landingPage: '(otros)'` (ver `GaReportUtil.rowsToByLandingPage`). */
  landingPage: string;
  sessions: number;
  totalUsers: number;
  purchases: number;
  gaRevenue: number;
}

export interface GaDailyByUserTypeRow {
  date: string;
  storeId: string;
  /** `newVsReturning` de GA4: "new" | "returning" | "(not set)" — baja cardinalidad, sin tope ni fila "(otros)". */
  userType: string;
  sessions: number;
  totalUsers: number;
  purchases: number;
  gaRevenue: number;
}

export interface GaDailyByCityRow {
  date: string;
  storeId: string;
  /** Top 20 por día/tienda — el resto se agrupa en una fila `city: '(otros)'` (ver `GaReportUtil.rowsToByCity`). */
  city: string;
  sessions: number;
  totalUsers: number;
  purchases: number;
  gaRevenue: number;
}

export interface GaDailyByProductRow {
  date: string;
  storeId: string;
  /** Top 20 por día/tienda — el resto se agrupa en una fila con `itemId: '(otros)'` (ver `GaReportUtil.rowsToByProduct`). */
  itemId: string;
  itemName: string;
  itemCategory: string;
  /** Métricas de ÍTEM — distintas a sessions/totalUsers del resto de desgloses (un producto no tiene "sesiones" propias). */
  itemsViewed: number;
  itemsAddedToCart: number;
  itemsPurchased: number;
  itemRevenue: number;
}

export interface GaDailyByCampaignRow {
  date: string;
  storeId: string;
  /** `sessionCampaignName` de GA4 — SIN tope ni agrupación "(otros)" (ver `GaReportUtil.rowsToByCampaign`): las campañas son deliberadas, no de cardinalidad creciente sin límite, y hay que poder buscarlas todas por nombre. */
  campaignName: string;
  /** `sessionSourceMedium` de GA4, ej. "woowup / email". */
  sourceMedium: string;
  sessions: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  gaRevenue: number;
}

/**
 * Escribe los agregados diarios de GA4 calculados por `GaSyncService` en
 * `ga_daily`/`ga_daily_by_channel`/`ga_daily_by_device` — mismo patrón
 * que `SalesAggregatesRepository`: borra por completo los días indicados
 * de UNA tienda en las 3 tablas, luego inserta las filas nuevas (nunca
 * incrementa un valor existente). `days` debe incluir TODOS los días del
 * rango sincronizado, incluso los que GA no reportó — `GaReportUtil.
 * fillMissingDays` ya se encargó de rellenarlos en cero antes de llegar
 * acá, así que una fila en `ga_daily` siempre significa "este día ya se
 * sincronizó", nunca "faltó por consultar".
 */
@Injectable()
export class GaAggregatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async replaceStoreRange(
    storeId: string,
    days: string[],
    gaDaily: GaDailyRow[],
    byChannel: GaDailyByChannelRow[],
    byDevice: GaDailyByDeviceRow[],
    byLandingPage: GaDailyByLandingPageRow[],
    byUserType: GaDailyByUserTypeRow[],
    byCity: GaDailyByCityRow[],
    byProduct: GaDailyByProductRow[],
    byCampaign: GaDailyByCampaignRow[],
  ): Promise<void> {
    if (days.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const table of [
        'ga_daily',
        'ga_daily_by_channel',
        'ga_daily_by_device',
        'ga_daily_by_landing_page',
        'ga_daily_by_user_type',
        'ga_daily_by_city',
        'ga_daily_by_product',
        'ga_daily_by_campaign',
      ]) {
        await client.query(`DELETE FROM ${table} WHERE store_id = $1 AND date = ANY($2::date[])`, [storeId, days]);
      }

      await this.insertRows(
        client,
        'ga_daily',
        [
          'date',
          'store_id',
          'sessions',
          'total_users',
          'new_users',
          'engaged_sessions',
          'item_views',
          'add_to_carts',
          'checkouts',
          'purchases',
          'ga_revenue',
        ],
        gaDaily.map((r) => [
          r.date,
          r.storeId,
          r.sessions,
          r.totalUsers,
          r.newUsers,
          r.engagedSessions,
          r.itemViews,
          r.addToCarts,
          r.checkouts,
          r.purchases,
          r.gaRevenue,
        ]),
      );

      await this.insertRows(
        client,
        'ga_daily_by_channel',
        ['date', 'store_id', 'channel_group', 'sessions', 'total_users', 'purchases', 'ga_revenue'],
        byChannel.map((r) => [r.date, r.storeId, r.channelGroup, r.sessions, r.totalUsers, r.purchases, r.gaRevenue]),
      );

      await this.insertRows(
        client,
        'ga_daily_by_device',
        ['date', 'store_id', 'device_category', 'sessions', 'total_users', 'purchases', 'ga_revenue'],
        byDevice.map((r) => [r.date, r.storeId, r.deviceCategory, r.sessions, r.totalUsers, r.purchases, r.gaRevenue]),
      );

      await this.insertRows(
        client,
        'ga_daily_by_landing_page',
        ['date', 'store_id', 'landing_page', 'sessions', 'total_users', 'purchases', 'ga_revenue'],
        byLandingPage.map((r) => [r.date, r.storeId, r.landingPage, r.sessions, r.totalUsers, r.purchases, r.gaRevenue]),
      );

      await this.insertRows(
        client,
        'ga_daily_by_user_type',
        ['date', 'store_id', 'user_type', 'sessions', 'total_users', 'purchases', 'ga_revenue'],
        byUserType.map((r) => [r.date, r.storeId, r.userType, r.sessions, r.totalUsers, r.purchases, r.gaRevenue]),
      );

      await this.insertRows(
        client,
        'ga_daily_by_city',
        ['date', 'store_id', 'city', 'sessions', 'total_users', 'purchases', 'ga_revenue'],
        byCity.map((r) => [r.date, r.storeId, r.city, r.sessions, r.totalUsers, r.purchases, r.gaRevenue]),
      );

      await this.insertRows(
        client,
        'ga_daily_by_product',
        ['date', 'store_id', 'item_id', 'item_name', 'item_category', 'items_viewed', 'items_added_to_cart', 'items_purchased', 'item_revenue'],
        byProduct.map((r) => [
          r.date,
          r.storeId,
          r.itemId,
          r.itemName,
          r.itemCategory,
          r.itemsViewed,
          r.itemsAddedToCart,
          r.itemsPurchased,
          r.itemRevenue,
        ]),
      );

      await this.insertRows(
        client,
        'ga_daily_by_campaign',
        ['date', 'store_id', 'campaign_name', 'source_medium', 'sessions', 'add_to_carts', 'checkouts', 'purchases', 'ga_revenue'],
        byCampaign.map((r) => [r.date, r.storeId, r.campaignName, r.sourceMedium, r.sessions, r.addToCarts, r.checkouts, r.purchases, r.gaRevenue]),
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
   * Todos los `item_id` DISTINTOS ya sincronizados para una tienda (de
   * cualquier día, no solo el rango de un sync puntual) — usado por el CLI
   * `ga:product-links` para resolver de una sola vez la caché
   * `ga_product_links` de TODO lo que ya está en `ga_daily_by_product`, sin
   * tener que volver a correr el sync de GA4. Excluye `(otros)`/`(not set)`
   * (no son productos reales).
   */
  async getDistinctProductIds(storeId: string): Promise<string[]> {
    const result = await this.pool.query<{ item_id: string }>(
      `SELECT DISTINCT item_id FROM ga_daily_by_product WHERE store_id = $1 AND item_id NOT IN ('(otros)', '(not set)')`,
      [storeId],
    );
    return result.rows.map((r) => r.item_id);
  }

  /** Igual patrón que `SalesAggregatesRepository.insertRows` — INSERT multi-fila por lotes dentro de una transacción ya abierta. */
  private async insertRows(client: PoolClient, table: string, columns: string[], rows: unknown[][]): Promise<void> {
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
