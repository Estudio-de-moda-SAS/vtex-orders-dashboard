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
   * Totales de `sales_daily` (orders/units/sales/discounts) para un rango
   * de días — sin desglosar por ninguna dimensión. `storeId` omitido =
   * TODAS las tiendas combinadas.
   */
  async getStoreTotals(
    startDay: string,
    endDay: string,
    storeId?: string,
    excludedStoreDates?: ExcludedStoreDate[],
  ): Promise<{ storeId: string; orders: number; units: number; sales: number; discounts: number }[]> {
    const { where, params } = this.buildWhere(startDay, endDay, storeId, excludedStoreDates);
    const result = await this.pool.query<{
      store_id: string;
      orders: string;
      units: string;
      sales: string;
      discounts: string;
    }>(
      `SELECT store_id, COALESCE(SUM(orders), 0) AS orders, COALESCE(SUM(units), 0) AS units,
              COALESCE(SUM(sales), 0) AS sales, COALESCE(SUM(discounts), 0) AS discounts
       FROM sales_daily WHERE ${where} GROUP BY store_id`,
      params,
    );
    return result.rows.map((r) => ({
      storeId: r.store_id,
      orders: Number(r.orders),
      units: Number(r.units),
      sales: Number(r.sales),
      discounts: Number(r.discounts),
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
