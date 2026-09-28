/**
 * Espejo de `backend/src/modules/budgets/interfaces/budgets.interface.ts`.
 * Cualquier cambio ahí debe reflejarse aquí.
 */

export interface MultiplierResponse {
  multiplier: number | null;
}

export type SetMultiplierResponse = { ok: true } | { needsConfirmation: true; currentValue: number };

export interface BudgetDayEntry {
  date: string;
  dayOfMonth: number;
  rawValue: number | null;
  budgetValue: number | null;
}

export type GetBudgetsResponse =
  | { needsMultiplier: true }
  | { needsMultiplier: false; multiplier: number; days: BudgetDayEntry[] };

export type SaveBulkResponse = { ok: true } | { needsConfirmation: true };

export interface BudgetStoreSummary {
  storeId: string;
  total: number;
}

export interface BudgetSummaryResponse {
  multiplier: number | null;
  stores: BudgetStoreSummary[];
  channelTotal: number;
}

export interface BudgetRangeSummaryResponse {
  stores: BudgetStoreSummary[];
  channelTotal: number;
  /** `null` si el rango cruza más de un mes calendario — no hay un solo "mes" al cual referirse. */
  fullMonth: (BudgetSummaryResponse & { year: number; month: number }) | null;
}
