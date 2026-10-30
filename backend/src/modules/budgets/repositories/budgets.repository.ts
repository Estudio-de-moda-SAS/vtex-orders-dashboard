import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { PG_POOL } from '../../database/pg-pool.provider';

export interface BudgetDayRow {
  date: string;
  rawValue: number;
}

/** Lecturas/escrituras de `budget_multipliers` y `budgets_daily` (migración 0009) — herramienta manual, sin relación con el pipeline de VTEX. */
@Injectable()
export class BudgetsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getMultiplier(year: number, month: number, channel: string): Promise<number | null> {
    const result = await this.pool.query<{ multiplier: string }>(
      `SELECT multiplier FROM budget_multipliers WHERE year = $1 AND month = $2 AND channel = $3`,
      [year, month, channel],
    );
    return result.rows[0] ? Number(result.rows[0].multiplier) : null;
  }

  async upsertMultiplier(year: number, month: number, multiplier: number, channel: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO budget_multipliers (year, month, channel, multiplier, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (year, month, channel) DO UPDATE SET multiplier = EXCLUDED.multiplier, updated_at = now()`,
      [year, month, channel, multiplier],
    );
  }

  async hasExistingBudgets(storeId: string, year: number, month: number, channel: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM budgets_daily WHERE store_id = $1 AND channel = $2 AND year = $3 AND month = $4 LIMIT 1`,
      [storeId, channel, year, month],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Total en pesos (`raw_value * multiplier`, ya no crudo) por tienda
   * para un RANGO arbitrario de fechas — a diferencia de
   * `getMonthRawTotalsByStore` (un solo mes, un solo multiplicador), acá
   * el rango puede cruzar de mes, así que cada fila se multiplica por el
   * multiplicador de SU PROPIO mes (join por year+month), nunca uno solo
   * aplicado a todas. Días sin fila (presupuesto no cargado) simplemente
   * no aportan nada — no hace falta tratarlos aparte.
   */
  async getRangeTotalsByStore(startDate: string, endDate: string, channel: string): Promise<{ storeId: string; total: number }[]> {
    const result = await this.pool.query<{ store_id: string; total: string }>(
      `SELECT bd.store_id, COALESCE(SUM(bd.raw_value * bm.multiplier), 0) AS total
       FROM budgets_daily bd
       JOIN budget_multipliers bm ON bm.year = bd.year AND bm.month = bd.month AND bm.channel = bd.channel
       WHERE bd.channel = $1 AND bd.date BETWEEN $2 AND $3
       GROUP BY bd.store_id`,
      [channel, startDate, endDate],
    );
    return result.rows.map((r) => ({ storeId: r.store_id, total: Number(r.total) }));
  }

  /** Total crudo (SUM de `raw_value`) por tienda para un mes — para las cards de resumen público (todas las marcas a la vez, sin filtrar por una sola). */
  async getMonthRawTotalsByStore(year: number, month: number, channel: string): Promise<{ storeId: string; rawTotal: number }[]> {
    const result = await this.pool.query<{ store_id: string; raw_total: string }>(
      `SELECT store_id, COALESCE(SUM(raw_value), 0) AS raw_total
       FROM budgets_daily
       WHERE channel = $1 AND year = $2 AND month = $3
       GROUP BY store_id`,
      [channel, year, month],
    );
    return result.rows.map((r) => ({ storeId: r.store_id, rawTotal: Number(r.raw_total) }));
  }

  async getBudgetsForMonth(storeId: string, year: number, month: number, channel: string): Promise<BudgetDayRow[]> {
    const result = await this.pool.query<{ date: string; raw_value: string }>(
      `SELECT date::text, raw_value FROM budgets_daily
       WHERE store_id = $1 AND channel = $2 AND year = $3 AND month = $4
       ORDER BY date`,
      [storeId, channel, year, month],
    );
    return result.rows.map((r) => ({ date: r.date, rawValue: Number(r.raw_value) }));
  }

  /**
   * Recalcula por completo el mes: borra las filas existentes de esa
   * marca/mes/canal e inserta las nuevas — mismo criterio "sobrescribe,
   * no incrementa" que `sales-aggregates.repository.ts`.
   */
  async replaceMonth(storeId: string, year: number, month: number, days: BudgetDayRow[], channel: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM budgets_daily WHERE store_id = $1 AND channel = $2 AND year = $3 AND month = $4`, [
        storeId,
        channel,
        year,
        month,
      ]);
      if (days.length > 0) {
        const params: unknown[] = [];
        const valuesSql = days
          .map((d) => {
            params.push(d.date, storeId, channel, d.rawValue);
            const i = params.length;
            return `($${i - 3}, $${i - 2}, $${i - 1}, $${i}, now())`;
          })
          .join(', ');
        await client.query(`INSERT INTO budgets_daily (date, store_id, channel, raw_value, updated_at) VALUES ${valuesSql}`, params);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
