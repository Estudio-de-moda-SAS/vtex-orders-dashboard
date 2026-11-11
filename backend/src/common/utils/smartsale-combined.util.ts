/**
 * Lógica pura del "Resumen" de SmartSale (POS + ERP) — ver
 * `SmartSaleCombinedService`. Pruebas en `smartsale-combined.util.test.ts`.
 */

/**
 * "101B - CAMISETA M/C" (ERP) → "CAMISETA M/C" (mismo texto que POS). Las
 * dos fuentes vienen del mismo ERP; la de facturas solo antepone el
 * código de categoría — quitándolo, las categorías coinciden exacto (sin
 * el emparejamiento por prefijo que hacía falta contra VTEX).
 */
export function stripErpCategoryCode(categoria: string): string {
  const trimmed = categoria.trim();
  const match = /^\S+\s+-\s+(.+)$/.exec(trimmed);
  return (match ? match[1] : trimmed).trim();
}

/** Clave de agrupación de categoría: sin código, en mayúscula y sin espacios repetidos. */
export function combinedCategoryKey(categoria: string): string {
  return stripErpCategoryCode(categoria).toUpperCase().replace(/\s+/g, ' ');
}

export interface CombinedMonthInput {
  /** "YYYY-MM". */
  month: string;
  orders: number;
  sales: number;
}

export interface CombinedMonthlyPoint {
  month: string;
  posSales: number;
  erpSales: number;
  /** `posSales + erpSales`. */
  sales: number;
  /** Documentos POS + facturas ERP. */
  orders: number;
  /**
   * `false` = el mes es anterior al primer mes con facturas ERP
   * sincronizadas (el histórico llegará por Excel) — su venta es SOLO POS,
   * no comparable, y por eso no lleva % de crecimiento.
   */
  erpAvailable: boolean;
  growthPercent: number | null;
  status: string;
}

/**
 * Un punto por mes (unión de los meses de POS y ERP, ordenados). El % de
 * crecimiento solo se calcula entre dos meses consecutivos que AMBOS
 * tengan ERP: comparar un mes POS+ERP contra uno solo-POS inflaría el
 * crecimiento. `classify` es `classifyMonthlyGrowth` (inyectado para no
 * duplicar la regla del semáforo).
 */
export function buildCombinedMonthlyTrend<S extends string>(
  posMonths: CombinedMonthInput[],
  erpMonths: CombinedMonthInput[],
  erpCoverageStartMonth: string | null,
  classify: (current: number, prior: number | null) => { growthPercent: number | null; status: S },
): (CombinedMonthlyPoint & { status: S | 'no-data' })[] {
  const posByMonth = new Map(posMonths.map((m) => [m.month, m]));
  const erpByMonth = new Map(erpMonths.map((m) => [m.month, m]));
  const months = Array.from(new Set([...posByMonth.keys(), ...erpByMonth.keys()])).sort();

  let prior: { sales: number; erpAvailable: boolean } | null = null;
  return months.map((month) => {
    const pos = posByMonth.get(month);
    const erp = erpByMonth.get(month);
    const posSales = pos?.sales ?? 0;
    const erpSales = erp?.sales ?? 0;
    const sales = posSales + erpSales;
    const erpAvailable = erpCoverageStartMonth !== null && month >= erpCoverageStartMonth;

    const comparable = erpAvailable && prior !== null && prior.erpAvailable;
    const { growthPercent, status } = comparable
      ? classify(sales, prior!.sales)
      : { growthPercent: null, status: 'no-data' as const };

    prior = { sales, erpAvailable };
    return {
      month,
      posSales,
      erpSales,
      sales,
      orders: (pos?.orders ?? 0) + (erp?.orders ?? 0),
      erpAvailable,
      growthPercent,
      status,
    };
  });
}

/**
 * Aviso para Vico (`get_smartsale_sales.erpCoverageNote`) cuando algún
 * período empieza antes del primer día con facturas ERP sincronizadas —
 * esos días solo traen POS. `null` si todos los períodos están cubiertos.
 */
export function buildErpCoverageNote(coverageStartDay: string | null, periodStartDays: string[]): string | null {
  if (coverageStartDay === null) {
    return 'Todavía no hay facturas ERP sincronizadas — estas cifras son solo de POS.';
  }
  if (periodStartDays.some((day) => day < coverageStartDay)) {
    return `Las facturas ERP solo están sincronizadas desde el ${coverageStartDay} — los días anteriores de este período solo incluyen POS (el histórico ERP se cargará más adelante).`;
  }
  return null;
}
