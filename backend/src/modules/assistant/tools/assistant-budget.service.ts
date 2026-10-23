import { Injectable } from '@nestjs/common';

import { BudgetsService } from '../../budgets/services/budgets.service';
import { AssistantToolError } from '../assistant-tool.error';
import { AssistantSalesService } from './assistant-sales.service';

export interface BudgetVsActualResult {
  storeId: string;
  startDay: string;
  endDay: string;
  rangeBudget: number;
  rangeActual: number;
  /** `null` si `rangeBudget` es 0 (sin presupuesto cargado para este rango) — nunca se divide por cero. */
  achievedPercent: number | null;
  fullMonthAvailable: boolean;
  fullMonth: { year: number; month: number; budget: number } | null;
}

/**
 * Herramienta `get_budget_vs_actual` — no existía un único endpoint que
 * cruzara presupuesto + venta real de UNA tienda para un rango (el
 * frontend de `/presupuesto` los pide por separado y los cruza en React,
 * ver `VtexBudgetTab.tsx`); este servicio hace ese cruce server-side,
 * reutilizando `BudgetsService.getRangeSummary` (presupuesto) y
 * `AssistantSalesService` con el corte "status" (venta real contabilizada,
 * MISMO criterio — sin ajuste de marketplaces/sellers — que usa hoy
 * `/presupuesto` para Pilatos, confirmado explícitamente por el usuario).
 */
@Injectable()
export class AssistantBudgetService {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly salesService: AssistantSalesService,
  ) {}

  async getBudgetVsActual(storeId: string, startDay: string, endDay: string): Promise<BudgetVsActualResult> {
    const [rangeSummary, salesResult] = await Promise.all([
      this.budgetsService.getRangeSummary(startDay, endDay),
      this.salesService.getSalesBreakdown(storeId, startDay, endDay, 'status'),
    ]);

    const storeBudget = rangeSummary.stores.find((s) => s.storeId === storeId);
    if (!storeBudget) {
      throw new AssistantToolError(`"${storeId}" no es una tienda con presupuesto configurado.`);
    }

    const rangeBudget = storeBudget.total;
    const rangeActual = salesResult.totalSales;
    const achievedPercent = rangeBudget > 0 ? Number(((rangeActual / rangeBudget) * 100).toFixed(2)) : null;

    const fullMonthStore = rangeSummary.fullMonth?.stores.find((s) => s.storeId === storeId);
    const fullMonth =
      rangeSummary.fullMonth && fullMonthStore
        ? { year: rangeSummary.fullMonth.year, month: rangeSummary.fullMonth.month, budget: fullMonthStore.total }
        : null;

    return {
      storeId,
      startDay,
      endDay,
      rangeBudget,
      rangeActual,
      achievedPercent,
      fullMonthAvailable: fullMonth !== null,
      fullMonth,
    };
  }
}
