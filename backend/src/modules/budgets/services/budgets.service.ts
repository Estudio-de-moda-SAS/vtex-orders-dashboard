import { BadRequestException, Injectable } from '@nestjs/common';

import { getStoresConfig } from '../../../config/stores.config';
import { BudgetsRepository } from '../repositories/budgets.repository';
import {
  BudgetRangeSummaryResponse,
  BudgetSummaryResponse,
  GetBudgetsResponse,
  MultiplierResponse,
  SaveBulkResponse,
  SetMultiplierResponse,
} from '../interfaces/budgets.interface';

/** Cantidad de días calendario de un mes (`month` 1-12). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Presupuesto manual (canal VTEX) — CRUD puro sobre `budget_multipliers`/
 * `budgets_daily` (migración 0009), sin ninguna relación con el pipeline
 * de sincronización de VTEX. La validación del código de acceso vive en
 * `BudgetCodeGuard`, no acá — este servicio asume que si se llegó hasta
 * aquí, ya se pasó ese guard (para los métodos de escritura).
 */
@Injectable()
export class BudgetsService {
  constructor(private readonly budgetsRepository: BudgetsRepository) {}

  async getMultiplier(year: number, month: number): Promise<MultiplierResponse> {
    const multiplier = await this.budgetsRepository.getMultiplier(year, month);
    return { multiplier };
  }

  /**
   * Resumen PÚBLICO (sin código) para las cards de "presupuesto por
   * marca" + el total del canal — cualquiera puede verlo, solo crear o
   * editar requiere el código (ver `BudgetCodeGuard`). Si el mes todavía
   * no tiene multiplicador (o una marca no tiene nada cargado), esa marca
   * simplemente aparece en 0, nunca como error.
   */
  async getMonthSummary(year: number, month: number): Promise<BudgetSummaryResponse> {
    const [multiplier, rawTotals] = await Promise.all([
      this.budgetsRepository.getMultiplier(year, month),
      this.budgetsRepository.getMonthRawTotalsByStore(year, month),
    ]);
    const rawByStore = new Map(rawTotals.map((r) => [r.storeId, r.rawTotal]));
    const stores = getStoresConfig().map((store) => {
      const rawTotal = rawByStore.get(store.id) ?? 0;
      return { storeId: store.id, total: multiplier !== null ? rawTotal * multiplier : 0 };
    });
    const channelTotal = stores.reduce((acc, s) => acc + s.total, 0);
    return { multiplier, stores, channelTotal };
  }

  /**
   * Presupuesto de un RANGO arbitrario de fechas (para "venta real vs.
   * presupuesto", ver `/presupuesto`) — `stores`/`channelTotal` siempre
   * responden con el rango exacto pedido, sin importar cuántos meses
   * toque. `fullMonth` (el objetivo del mes COMPLETO, para la comparación
   * "¿qué tanto del mes ya logré?") solo se resuelve cuando
   * `startDate`/`endDate` caen en el MISMO mes calendario — un rango que
   * cruza de mes no tiene un solo "mes" al cual referirse, así que se
   * deja en `null` a propósito (el frontend debe avisar, no adivinar).
   */
  async getRangeSummary(startDate: string, endDate: string): Promise<BudgetRangeSummaryResponse> {
    const rawTotals = await this.budgetsRepository.getRangeTotalsByStore(startDate, endDate);
    const totalsByStore = new Map(rawTotals.map((r) => [r.storeId, r.total]));
    const stores = getStoresConfig().map((store) => ({ storeId: store.id, total: totalsByStore.get(store.id) ?? 0 }));
    const channelTotal = stores.reduce((acc, s) => acc + s.total, 0);

    const [startYear, startMonth] = startDate.slice(0, 7).split('-').map(Number);
    const [endYear, endMonth] = endDate.slice(0, 7).split('-').map(Number);
    const sameMonth = startYear === endYear && startMonth === endMonth;

    const fullMonth = sameMonth ? { year: startYear, month: startMonth, ...(await this.getMonthSummary(startYear, startMonth)) } : null;

    return { stores, channelTotal, fullMonth };
  }

  /**
   * Si ya existe un multiplicador para ese año/mes, no lo sobrescribe a
   * menos que venga `confirmOverwrite` — cambiarlo afecta a las 6 marcas
   * a la vez (comparten el mismo multiplicador por mes), así que el
   * frontend debe avisar eso explícitamente antes de confirmar.
   */
  async setMultiplier(year: number, month: number, multiplier: number, confirmOverwrite: boolean): Promise<SetMultiplierResponse> {
    const current = await this.budgetsRepository.getMultiplier(year, month);
    if (current !== null && !confirmOverwrite) {
      return { needsConfirmation: true, currentValue: current };
    }
    await this.budgetsRepository.upsertMultiplier(year, month, multiplier);
    return { ok: true };
  }

  /**
   * `needsMultiplier: true` cuando el mes todavía no tiene multiplicador
   * definido — el frontend debe redirigir al paso de definirlo antes de
   * mostrar la grilla. Con multiplicador definido, siempre devuelve los
   * `daysInMonth(year, month)` días completos (con `rawValue`/
   * `budgetValue` en `null` para los que aún no se han guardado), para
   * que la grilla se pueda pintar completa desde el primer momento.
   */
  async getBudgets(storeId: string, year: number, month: number): Promise<GetBudgetsResponse> {
    const multiplier = await this.budgetsRepository.getMultiplier(year, month);
    if (multiplier === null) {
      return { needsMultiplier: true };
    }

    const rows = await this.budgetsRepository.getBudgetsForMonth(storeId, year, month);
    const rawByDate = new Map(rows.map((r) => [r.date, r.rawValue]));

    const total = daysInMonth(year, month);
    const days = Array.from({ length: total }, (_, i) => {
      const dayOfMonth = i + 1;
      const date = toIsoDate(year, month, dayOfMonth);
      const rawValue = rawByDate.get(date) ?? null;
      return {
        date,
        dayOfMonth,
        rawValue,
        budgetValue: rawValue !== null ? rawValue * multiplier : null,
      };
    });

    return { needsMultiplier: false, multiplier, days };
  }

  /**
   * Sobrescribe por completo el mes de una marca (borra + inserta) — la
   * cantidad de `rawValues` debe coincidir EXACTO con los días del mes,
   * sin excepciones, para no guardar nada a medias o desalineado.
   */
  async saveBulk(storeId: string, year: number, month: number, rawValues: number[], confirmOverwrite: boolean): Promise<SaveBulkResponse> {
    const multiplier = await this.budgetsRepository.getMultiplier(year, month);
    if (multiplier === null) {
      throw new BadRequestException('Define primero el multiplicador de este mes.');
    }

    const total = daysInMonth(year, month);
    if (rawValues.length !== total) {
      throw new BadRequestException(`Se esperaban ${total} valores (días de ${month}/${year}), se recibieron ${rawValues.length}.`);
    }

    const alreadyExists = await this.budgetsRepository.hasExistingBudgets(storeId, year, month);
    if (alreadyExists && !confirmOverwrite) {
      return { needsConfirmation: true };
    }

    const days = rawValues.map((rawValue, index) => ({ date: toIsoDate(year, month, index + 1), rawValue }));
    await this.budgetsRepository.replaceMonth(storeId, year, month, days);
    return { ok: true };
  }
}
