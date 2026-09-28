export interface MultiplierResponse {
  multiplier: number | null;
}

export type SetMultiplierResponse = { ok: true } | { needsConfirmation: true; currentValue: number };

export interface BudgetDayEntry {
  date: string;
  dayOfMonth: number;
  rawValue: number | null;
  /** `rawValue * multiplier` — `null` si `rawValue` todavía no se ha cargado ese día. */
  budgetValue: number | null;
}

export type GetBudgetsResponse =
  | { needsMultiplier: true }
  | { needsMultiplier: false; multiplier: number; days: BudgetDayEntry[] };

export type SaveBulkResponse = { ok: true } | { needsConfirmation: true };

export interface BudgetStoreSummary {
  storeId: string;
  /** `rawTotal * multiplier` — 0 si esa marca todavía no tiene nada cargado ese mes (o si no hay multiplicador definido). */
  total: number;
}

/** Respuesta de GET /api/budgets/summary — pública, sin código, para las cards de "presupuesto por marca" + total de canal. */
export interface BudgetSummaryResponse {
  multiplier: number | null;
  stores: BudgetStoreSummary[];
  channelTotal: number;
}

/**
 * Respuesta de GET /api/budgets/range-summary — pública. `fullMonth` solo
 * viene poblado si `startDate`/`endDate` caen dentro de UN solo mes
 * calendario; si el rango cruza de mes, es `null` (el frontend debe
 * mostrar un aviso en vez de adivinar a qué mes pertenece "el mes").
 */
export interface BudgetRangeSummaryResponse {
  stores: BudgetStoreSummary[];
  channelTotal: number;
  fullMonth: (BudgetSummaryResponse & { year: number; month: number }) | null;
}
