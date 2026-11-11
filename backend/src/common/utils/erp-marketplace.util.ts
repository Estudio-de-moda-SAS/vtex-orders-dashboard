/**
 * Margen por marketplace (cuadro aparte en el "Resumen" de `/presupuesto`)
 * — reglas definidas por el usuario:
 * - Una factura es de un marketplace cuando `docto_referencia` EMPIEZA por
 *   el prefijo de su "ID VTEX" (ej. "GVL1093638" → Agaval).
 * - Comisión = valor_subtotal (SIN IVA) × % de comisión del marketplace.
 * - Utilidad = valor_subtotal − comisión (SIN restar costo — así lo
 *   calculan ellos).
 * - Margen = utilidad ÷ valor_subtotal (por construcción, 100% − % de
 *   comisión de ese marketplace).
 * El cuadro de marcas NO resta comisiones (decisión del usuario).
 * Pruebas en `erp-marketplace.util.test.ts`.
 */

export interface MarketplaceConfig {
  prefix: string;
  name: string;
  /** Comisión como fracción (0.4085 = 40,85%). */
  commissionRate: number;
  /** Nombre del marketplace en VTEX (`sales_daily_by_marketplace.marketplace_name`, ver `stores.config.ts`). */
  vtexLabel: string;
}

/** Cuadro de comisiones entregado por el usuario (nov-2026). Uno nuevo se agrega aquí. */
export const ERP_MARKETPLACES: MarketplaceConfig[] = [
  { prefix: 'FFC', name: 'Fruta Fresca', commissionRate: 0.4085, vtexLabel: 'Fruta fresca' },
  { prefix: 'VPC', name: 'Puntos Colombia', commissionRate: 0.11, vtexLabel: 'Puntos colombia' },
  { prefix: 'DTF', name: 'Dafiti', commissionRate: 0.26, vtexLabel: 'Dafiti' },
  { prefix: 'DDD', name: 'Addi Marketplace', commissionRate: 0.13, vtexLabel: 'Addi' },
  { prefix: 'GVL', name: 'Agaval', commissionRate: 0.17, vtexLabel: 'Agaval' },
  { prefix: 'FBL', name: 'Falabella', commissionRate: 0.2, vtexLabel: 'Falabella' },
];

/**
 * Prefijo alfabético inicial de `docto_referencia` ("GVL1093638" → "GVL",
 * "SLR-500192" → "SLR"); `null` si empieza por número (venta sin prefijo).
 */
export function doctoReferenciaPrefix(doctoReferencia: string | null | undefined): string | null {
  const match = /^[A-Z]+/.exec((doctoReferencia ?? '').trim().toUpperCase());
  return match ? match[0] : null;
}

export interface PrefixSalesRow {
  /** `null` = sin prefijo (solo números). */
  prefix: string | null;
  /** Con IVA (`valor_neto`). */
  total: number;
  /** Sin IVA (`valor_subtotal`). */
  subtotal: number;
  invoices: number;
}

export interface MarketplaceRow {
  prefix: string;
  name: string;
  commissionPercent: number;
  vtexSales: number;
  erpSales: number;
  erpSubtotal: number;
  invoices: number;
  commission: number;
  utility: number;
  /** `null` si no hubo venta ERP. */
  marginPercent: number | null;
}

export interface MarketplaceSummary {
  rows: MarketplaceRow[];
  total: {
    vtexSales: number;
    erpSales: number;
    erpSubtotal: number;
    invoices: number;
    commission: number;
    utility: number;
    /** Ponderado: utilidad total ÷ venta sin IVA total. */
    marginPercent: number | null;
    /** Promedio simple de los márgenes de los marketplaces CON venta. */
    simpleAverageMarginPercent: number | null;
    marketplacesInSimpleAverage: number;
  };
  /** Prefijos con venta que NO están en el cuadro de comisiones (ej. "SLR") — se muestran aparte para validarlos. */
  otherPrefixes: { prefix: string; erpSales: number; erpSubtotal: number; invoices: number }[];
}

export function buildMarketplaceSummary(
  prefixRows: PrefixSalesRow[],
  vtexSalesByLabel: Record<string, number>,
  marketplaces: MarketplaceConfig[] = ERP_MARKETPLACES,
): MarketplaceSummary {
  const byPrefix = new Map<string, PrefixSalesRow>();
  for (const r of prefixRows) {
    if (r.prefix === null) continue;
    const key = r.prefix.toUpperCase();
    const prev = byPrefix.get(key);
    byPrefix.set(key, prev ? { prefix: key, total: prev.total + r.total, subtotal: prev.subtotal + r.subtotal, invoices: prev.invoices + r.invoices } : { ...r, prefix: key });
  }

  const rows: MarketplaceRow[] = marketplaces.map((m) => {
    const sales = byPrefix.get(m.prefix);
    const erpSubtotal = sales?.subtotal ?? 0;
    const commission = erpSubtotal * m.commissionRate;
    const utility = erpSubtotal - commission;
    return {
      prefix: m.prefix,
      name: m.name,
      // Redondeado a 2 decimales: 0.4085 × 100 da 40,849999… en punto flotante.
      commissionPercent: Math.round(m.commissionRate * 10000) / 100,
      vtexSales: vtexSalesByLabel[m.vtexLabel] ?? 0,
      erpSales: sales?.total ?? 0,
      erpSubtotal,
      invoices: sales?.invoices ?? 0,
      commission,
      utility,
      marginPercent: erpSubtotal > 0 ? (utility / erpSubtotal) * 100 : null,
    };
  });

  const sum = (f: (r: MarketplaceRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const erpSubtotal = sum((r) => r.erpSubtotal);
  const utility = sum((r) => r.utility);
  const withMargin = rows.filter((r) => r.marginPercent !== null);

  const known = new Set(marketplaces.map((m) => m.prefix));
  const otherPrefixes = Array.from(byPrefix.values())
    .filter((r) => !known.has(r.prefix as string))
    .map((r) => ({ prefix: r.prefix as string, erpSales: r.total, erpSubtotal: r.subtotal, invoices: r.invoices }))
    .sort((a, b) => b.erpSales - a.erpSales);

  return {
    rows,
    total: {
      vtexSales: sum((r) => r.vtexSales),
      erpSales: sum((r) => r.erpSales),
      erpSubtotal,
      invoices: sum((r) => r.invoices),
      commission: sum((r) => r.commission),
      utility,
      marginPercent: erpSubtotal > 0 ? (utility / erpSubtotal) * 100 : null,
      simpleAverageMarginPercent:
        withMargin.length > 0 ? withMargin.reduce((a, r) => a + (r.marginPercent as number), 0) / withMargin.length : null,
      marketplacesInSimpleAverage: withMargin.length,
    },
    otherPrefixes,
  };
}
