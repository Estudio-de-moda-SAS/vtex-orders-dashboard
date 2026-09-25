import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../pg-pool.provider';

/**
 * Lecturas SQL puras (`SUM`/`GROUP BY`) sobre las tablas `sales_daily*`
 * para el dashboard y la analítica de producto — reemplaza toda la
 * orquestación "¿leo caché o consulto VTEX?" del modelo anterior:
 * `OrdersService`/`ProductAnalyticsService` ya NO hablan con VTEX, solo
 * leen agregados ya calculados por el cron/importador.
 *
 * `queryGrouped` es genérico a propósito (una sola implementación para
 * las 9 tablas `by_*`) — `table`/`dimensionColumn`/`valueColumns` SIEMPRE
 * vienen de constantes fijas en el código llamador, nunca de un query
 * param del usuario, así que interpolarlos en el SQL es seguro (los
 * valores de filtro sí van parametrizados con `$1`, `$2`...).
 */
/** Un (tienda, día) puntual a excluir de una consulta SQL — ver `buildWhere`. */
export interface ExcludedStoreDate {
  storeId: string;
  date: string;
}

@Injectable()
export class DashboardQueryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Totales de `sales_daily` (orders/units/sales/discounts/real_*) para
   * un rango de días — sin desglosar por ninguna dimensión. `storeId`
   * omitido = TODAS las tiendas combinadas. `realOrders`/
   * `realRevenueOrders` son "compras reales" (deduplicadas por número
   * base de orden, ver `daily-aggregator.ts`) — solo se usan en la card
   * de cada tienda, nunca en otro cálculo.
   */
  async getStoreTotals(
    startDay: string,
    endDay: string,
    storeId?: string,
    excludedStoreDates?: ExcludedStoreDate[],
  ): Promise<
    { storeId: string; orders: number; units: number; sales: number; discounts: number; realOrders: number; realRevenueOrders: number }[]
  > {
    const { where, params } = this.buildWhere(startDay, endDay, storeId, excludedStoreDates);
    const result = await this.pool.query<{
      store_id: string;
      orders: string;
      units: string;
      sales: string;
      discounts: string;
      real_orders: string;
      real_revenue_orders: string;
    }>(
      `SELECT store_id, COALESCE(SUM(orders), 0) AS orders, COALESCE(SUM(units), 0) AS units,
              COALESCE(SUM(sales), 0) AS sales, COALESCE(SUM(discounts), 0) AS discounts,
              COALESCE(SUM(real_orders), 0) AS real_orders, COALESCE(SUM(real_revenue_orders), 0) AS real_revenue_orders
       FROM sales_daily WHERE ${where} GROUP BY store_id`,
      params,
    );
    return result.rows.map((r) => ({
      storeId: r.store_id,
      orders: Number(r.orders),
      units: Number(r.units),
      sales: Number(r.sales),
      discounts: Number(r.discounts),
      realOrders: Number(r.real_orders),
      realRevenueOrders: Number(r.real_revenue_orders),
    }));
  }

  /**
   * `SUM(valueColumns) GROUP BY store_id, dimensionColumn` sobre una de
   * las tablas `sales_daily_by_*`. Los valores numéricos vuelven como
   * `string` (comportamiento estándar de `pg` para `NUMERIC`) — se
   * convierten a `number` aquí, antes de llegar a los servicios.
   */
  async queryGrouped(
    table: string,
    dimensionColumn: string,
    valueColumns: string[],
    startDay: string,
    endDay: string,
    storeId?: string,
    excludedStoreDates?: ExcludedStoreDate[],
  ): Promise<Record<string, string | number>[]> {
    return this.queryGroupedMulti(table, [dimensionColumn], valueColumns, startDay, endDay, storeId, excludedStoreDates);
  }

  /**
   * Igual que `queryGrouped`, pero agrupa por VARIAS dimensiones a la vez
   * (ej. categoría + marca, para el cruce categoría×marca) — usado sobre
   * `sales_daily_by_category_brand` y `sales_daily_by_brand_discount_bucket`.
   */
  async queryGroupedMulti(
    table: string,
    dimensionColumns: string[],
    valueColumns: string[],
    startDay: string,
    endDay: string,
    storeId?: string,
    excludedStoreDates?: ExcludedStoreDate[],
  ): Promise<Record<string, string | number>[]> {
    const { where, params } = this.buildWhere(startDay, endDay, storeId, excludedStoreDates);
    const sumSelects = valueColumns.map((col) => `COALESCE(SUM(${col}), 0) AS ${col}`);
    const groupCols = ['store_id', ...dimensionColumns];
    const sql = `SELECT ${groupCols.join(', ')}, ${sumSelects.join(', ')}
                 FROM ${table} WHERE ${where} GROUP BY ${groupCols.join(', ')}`;
    const result = await this.pool.query<Record<string, string>>(sql, params);
    return result.rows.map((row) => {
      const mapped: Record<string, string | number> = {};
      for (const col of groupCols) mapped[col] = row[col];
      for (const col of valueColumns) mapped[col] = Number(row[col]);
      return mapped;
    });
  }

  /**
   * Total REAL (sin doble conteo) de las campañas de descuento
   * seleccionadas, por tienda — lee una tabla `*_by_campaign_combo` (ver
   * migración 0005 para la general, 0008 para la de SmartSale), donde
   * cada orden aporta a UNA sola fila (la de su combinación exacta de
   * campañas), así que sumar las filas cuyo `campaign_names` intersecta
   * (`&&`) `campaignNames` da el total real de esas campañas sin importar
   * cuántas de ellas tenga cada orden. `table` siempre viene de una
   * constante fija en el código llamador (nunca de un query param del
   * usuario), igual que en `queryGrouped`.
   */
  async getCampaignComboTotals(
    startDay: string,
    endDay: string,
    campaignNames: string[],
    table: string = 'sales_daily_by_campaign_combo',
  ): Promise<{ storeId: string; orders: number; sales: number; revenueOrders: number; revenueSales: number }[]> {
    const result = await this.pool.query<{
      store_id: string;
      orders: string;
      sales: string;
      revenue_orders: string;
      revenue_sales: string;
    }>(
      `SELECT store_id, COALESCE(SUM(orders), 0) AS orders, COALESCE(SUM(sales), 0) AS sales,
              COALESCE(SUM(revenue_orders), 0) AS revenue_orders, COALESCE(SUM(revenue_sales), 0) AS revenue_sales
       FROM ${table}
       WHERE date BETWEEN $1 AND $2 AND campaign_names && $3::text[]
       GROUP BY store_id`,
      [startDay, endDay, campaignNames],
    );
    return result.rows.map((r) => ({
      storeId: r.store_id,
      orders: Number(r.orders),
      sales: Number(r.sales),
      revenueOrders: Number(r.revenue_orders),
      revenueSales: Number(r.revenue_sales),
    }));
  }

  /**
   * Días (YYYY-MM-DD) dentro de `[startDay, endDay]` que NO tienen
   * ninguna fila en `sales_daily` para esta tienda — es decir, que el
   * cron/importador nunca sincronizó. Usado por `OrdersService` para
   * decidir si hace falta un fallback en vivo a VTEX para completar la
   * respuesta del dashboard (ver `VtexSyncCronService.fetchOnDemand`).
   */
  async findMissingDays(storeId: string, startDay: string, endDay: string): Promise<string[]> {
    const result = await this.pool.query<{ date: string }>(
      `SELECT gs.date::date::text AS date
       FROM generate_series($2::date, $3::date, interval '1 day') AS gs(date)
       LEFT JOIN sales_daily sd ON sd.date = gs.date::date AND sd.store_id = $1
       WHERE sd.date IS NULL
       ORDER BY gs.date`,
      [storeId, startDay, endDay],
    );
    return result.rows.map((r) => r.date);
  }

/**
   * Para TODAS las tiendas a la vez, los días (YYYY-MM-DD) dentro de
   * `[startDay, endDay]` cuya última sincronización quedó marcada
   * `is_complete = false` en `sync_day_status` (ver migración 0004) — es
   * decir, VTEX reportó más órdenes de las que se lograron obtener para
   * ese día, incluso tras los reintentos de `VtexOrdersService`. Un día
   * SIN fila en esta tabla (histórico importado de Excel, o sincronizado
   * antes de que existiera este tracking) NO se considera incompleto —
   * solo se avisa cuando hay evidencia positiva de un posible hueco,
   * nunca por ausencia de dato.
   */
  async findIncompleteDaysByStore(startDay: string, endDay: string): Promise<Record<string, string[]>> {
    const result = await this.pool.query<{ store_id: string; date: string }>(
      `SELECT store_id, date::text AS date FROM sync_day_status
       WHERE date BETWEEN $1 AND $2 AND is_complete = false
       ORDER BY store_id, date`,
      [startDay, endDay],
    );
    const byStore: Record<string, string[]> = {};
    for (const row of result.rows) {
      (byStore[row.store_id] ??= []).push(row.date);
    }
    return byStore;
  }

  /**
   * `excludedStoreDates`: pares (tienda, día) a excluir explícitamente del
   * `SUM`, sin importar que caigan dentro de `[startDay, endDay]` — se usa
   * para los días que YA se acaban de traer en vivo de VTEX en esta misma
   * petición (`OrdersService.fillMissingDays`), y que se van a fusionar
   * aparte en memoria. Sin esto, una segunda petición concurrente para el
   * mismo hueco podría leer por SQL un día que la primera petición
   * acababa de terminar de guardar en segundo plano, y sumarlo DOS VECES
   * (una desde SQL, otra desde su propio resultado en vivo) — no importa
   * qué tan rara sea esa coincidencia de tiempos, excluir el día por SQL
   * la hace imposible en vez de solo improbable.
   */
  private buildWhere(
    startDay: string,
    endDay: string,
    storeId?: string,
    excludedStoreDates?: ExcludedStoreDate[],
  ): { where: string; params: unknown[] } {
    const params: unknown[] = [startDay, endDay];
    let where = 'date BETWEEN $1 AND $2';
    if (storeId) {
      params.push(storeId);
      where += ` AND store_id = $${params.length}`;
    }
    if (excludedStoreDates && excludedStoreDates.length > 0) {
      params.push(excludedStoreDates.map((e) => `${e.storeId}:${e.date}`));
      where += ` AND (store_id || ':' || date::text) <> ALL($${params.length}::text[])`;
    }
    return { where, params };
  }
}
