import { Injectable } from '@nestjs/common';

import { getSmartSaleBudgetSellers } from '../../../config/smartsale.config';
import { BudgetsService } from '../../budgets/services/budgets.service';
import { SmartSaleCombinedService } from '../../orders/services/smartsale-combined.service';

const SMARTSALE_BUDGET_CHANNEL = 'smartsale';

export interface SmartSaleSellerBudget {
  name: string;
  /** Presupuesto del canal ÷ cantidad de vendedores en `getSmartSaleBudgetSellers()` — NO es un presupuesto propio. */
  budgetShare: number;
  /** VTEX + POS de ese vendedor en el rango. */
  actualSales: number;
  /** `null` si `budgetShare` es 0. */
  achievedPercent: number | null;
}

export interface SmartSaleBudgetVsActualResult {
  startDay: string;
  endDay: string;
  /** Presupuesto del CANAL completo (no por tienda) — ver migración 0025. */
  rangeBudget: number;
  /** Venta real VTEX + POS del canal en el rango — VTEX es un acercamiento hasta que haya ERP. */
  rangeActual: number;
  /** `null` si `rangeBudget` es 0 (sin presupuesto cargado para este rango). */
  achievedPercent: number | null;
  fullMonthAvailable: boolean;
  fullMonth: { year: number; month: number; budget: number } | null;
  /** Presupuesto del canal repartido en partes iguales entre los vendedores de `getSmartSaleBudgetSellers()`, cruzado contra su venta real. */
  bySeller: SmartSaleSellerBudget[];
}

/**
 * Herramienta `get_smartsale_budget_vs_actual` — mismo cruce que
 * `get_budget_vs_actual` (presupuesto + venta real con el % ya
 * calculado), pero para el presupuesto del CANAL SmartSale completo
 * (`channel: 'smartsale'`, ver migración 0025 y `SmartSaleBudgetTab.tsx`)
 * en vez de una tienda VTEX — un único presupuesto para las 6 tiendas
 * combinadas, no por marca. La venta real es VTEX + POS
 * (`SmartSaleCombinedService`), igual criterio que `get_smartsale_sales`.
 */
@Injectable()
export class AssistantSmartSaleBudgetService {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly combinedService: SmartSaleCombinedService,
  ) {}

  async getSmartSaleBudgetVsActual(startDay: string, endDay: string): Promise<SmartSaleBudgetVsActualResult> {
    const [rangeSummary, salesSummary] = await Promise.all([
      this.budgetsService.getRangeSummary(startDay, endDay, SMARTSALE_BUDGET_CHANNEL),
      this.combinedService.getCombinedSummary(startDay, endDay),
    ]);

    const rangeBudget = rangeSummary.channelTotal;
    const rangeActual = salesSummary.totalVtexSales + salesSummary.totalPosSales;
    const achievedPercent = rangeBudget > 0 ? Number(((rangeActual / rangeBudget) * 100).toFixed(2)) : null;

    const fullMonth = rangeSummary.fullMonth
      ? { year: rangeSummary.fullMonth.year, month: rangeSummary.fullMonth.month, budget: rangeSummary.fullMonth.channelTotal }
      : null;

    const sellers = getSmartSaleBudgetSellers();
    const budgetShare = sellers.length > 0 ? rangeBudget / sellers.length : 0;
    const bySeller: SmartSaleSellerBudget[] = sellers.map((name) => {
      const actualSales = salesSummary.bySeller.find((p) => p.name === name)?.totalSales ?? 0;
      return {
        name,
        budgetShare,
        actualSales,
        achievedPercent: budgetShare > 0 ? Number(((actualSales / budgetShare) * 100).toFixed(2)) : null,
      };
    });

    return {
      startDay,
      endDay,
      rangeBudget,
      rangeActual,
      achievedPercent,
      fullMonthAvailable: fullMonth !== null,
      fullMonth,
      bySeller,
    };
  }
}
