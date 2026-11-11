/**
 * Margen y utilidad de las facturas ERP — fórmula definida por el usuario:
 *   costo total = costo_promedio_uni_inst × cantidad
 *   utilidad    = valor_subtotal (SIN IVA) − costo total
 *   margen      = utilidad / valor_subtotal
 *
 * Margen del CANAL, dos lecturas (el usuario pidió mostrar ambas):
 * - Ponderado: utilidad total ÷ subtotal total — cuánto queda de cada
 *   peso vendido; cuadra con la utilidad total. Cifra principal.
 * - Promedio simple: promedio de los márgenes de las marcas, cada marca
 *   pesa igual sin importar cuánto vende (así lo calculan hoy). Solo
 *   promedia marcas CON venta en el rango (una marca sin venta no tiene
 *   margen, no es 0%).
 *
 * SOLO LÍNEAS DE PRODUCTO (decisión del usuario, nov-2026): fletes,
 * bolsas/empaque y material publicitario cuentan en la VENTA pero NO en el
 * margen ni en la utilidad — antes se incluían (el flete, sin costo en el ERP, inflaba el
 * margen). `freight`/`packaging` se siguen devolviendo aparte solo como
 * información, NO están dentro de `byStore`/`channel`. Pruebas en
 * `erp-margin.util.test.ts`.
 */

export interface MarginInputRow {
  storeId: string;
  lineKind: 'product' | 'freight' | 'packaging' | 'advertising';
  subtotal: number;
  cost: number;
}

export interface MarginFigures {
  /** Ventas SIN IVA. */
  subtotal: number;
  cost: number;
  /** `subtotal − cost`. */
  utility: number;
  /** `utility / subtotal × 100`, `null` si no hubo venta. */
  marginPercent: number | null;
}

export interface MarginSummary {
  byStore: (MarginFigures & { storeId: string })[];
  channel: MarginFigures & {
    /** Ponderado = `channel.marginPercent` (utilidad total ÷ subtotal total). */
    simpleAverageMarginPercent: number | null;
    /** Marcas que entraron al promedio simple (las que tuvieron venta). */
    storesInSimpleAverage: number;
  };
  /** Fletes y empaque del rango — solo informativo, NO entran en `byStore`/`channel`. */
  freight: { subtotal: number; cost: number; utility: number };
  packaging: { subtotal: number; cost: number; utility: number };
}

function figures(subtotal: number, cost: number): MarginFigures {
  const utility = subtotal - cost;
  return { subtotal, cost, utility, marginPercent: subtotal > 0 ? (utility / subtotal) * 100 : null };
}

export function buildMarginSummary(rows: MarginInputRow[], storeIds: string[]): MarginSummary {
  const productRows = rows.filter((r) => r.lineKind === 'product');
  const byStore = storeIds.map((storeId) => {
    const own = productRows.filter((r) => r.storeId === storeId);
    return {
      storeId,
      ...figures(
        own.reduce((a, r) => a + r.subtotal, 0),
        own.reduce((a, r) => a + r.cost, 0),
      ),
    };
  });

  const channelSubtotal = byStore.reduce((a, s) => a + s.subtotal, 0);
  const channelCost = byStore.reduce((a, s) => a + s.cost, 0);
  const withMargin = byStore.filter((s) => s.marginPercent !== null);
  const simpleAverageMarginPercent =
    withMargin.length > 0 ? withMargin.reduce((a, s) => a + (s.marginPercent as number), 0) / withMargin.length : null;

  const kindTotals = (kind: MarginInputRow['lineKind']) => {
    const own = rows.filter((r) => r.lineKind === kind && storeIds.includes(r.storeId));
    const subtotal = own.reduce((a, r) => a + r.subtotal, 0);
    const cost = own.reduce((a, r) => a + r.cost, 0);
    return { subtotal, cost, utility: subtotal - cost };
  };

  return {
    byStore,
    channel: { ...figures(channelSubtotal, channelCost), simpleAverageMarginPercent, storesInSimpleAverage: withMargin.length },
    freight: kindTotals('freight'),
    packaging: kindTotals('packaging'),
  };
}
