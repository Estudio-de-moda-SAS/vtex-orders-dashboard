import { GaFunnelRates, GaStoreTotals } from '@/types/ga-analytics';
import { formatNumber, formatPercentage, formatRatio } from '@/lib/format';
import { ChartPanel } from './OrdersByStoreChart';

interface GaFunnelTableProps {
  totals: GaStoreTotals;
  funnelRates: GaFunnelRates;
}

interface FunnelStep {
  label: string;
  value: number;
  /** % respecto al paso anterior — `null` en el primer paso (no hay "anterior"). */
  rateFromPrevious: number | null;
}

interface QuickAnalysisRow {
  count: string;
  result: string;
}

function safeDiv(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Para proporciones ≤ 1 (ej. 0,003 compras por visita), "X por visita" solo
 * se lee bien con el denominador correcto — elige el primer N (10, 100,
 * 1.000, 10.000) donde la cuenta redondeada da al menos 1, para no mostrar
 * "0 de cada 10" cuando en realidad son "3 de cada 1.000".
 */
function perNPhrase(ratio: number): string {
  if (ratio <= 0 || ratio > 1) return '';
  for (const n of [10, 100, 1000, 10000]) {
    const rounded = Math.round(ratio * n);
    if (rounded >= 1) return ` (unos ${formatNumber(rounded)} por cada ${formatNumber(n)} visitas)`;
  }
  return '';
}

/**
 * Traduce los conteos crudos del embudo a proporciones por visita (y entre
 * pasos consecutivos) — mismo tipo de lectura que "5,6 vistas por visita"
 * en vez de solo "455.350 vistas". El paréntesis "de cada N visitas" solo
 * aplica a proporciones ≤ 1 (ver `perNPhrase`) — se omite en las que son
 * mayores a 1 (ej. vistas por carrito).
 */
function buildQuickAnalysis(totals: GaStoreTotals): QuickAnalysisRow[] {
  const rows: QuickAnalysisRow[] = [];

  const viewsPerVisit = safeDiv(totals.itemViews, totals.sessions);
  if (viewsPerVisit !== null) {
    rows.push({
      count: `${formatNumber(totals.itemViews)} vistas de producto ÷ ${formatNumber(totals.sessions)} sesiones`,
      result: `${formatRatio(viewsPerVisit)} vistas por visita`,
    });
  }

  const cartsPerVisit = safeDiv(totals.addToCarts, totals.sessions);
  if (cartsPerVisit !== null) {
    rows.push({
      count: `${formatNumber(totals.addToCarts)} agregados al carrito ÷ ${formatNumber(totals.sessions)} sesiones`,
      result: `${formatRatio(cartsPerVisit)} carritos por visita${perNPhrase(cartsPerVisit)}`,
    });
  }

  const viewsPerCart = safeDiv(totals.itemViews, totals.addToCarts);
  if (viewsPerCart !== null) {
    rows.push({
      count: `${formatNumber(totals.itemViews)} vistas ÷ ${formatNumber(totals.addToCarts)} carritos`,
      result: `${formatRatio(viewsPerCart)} vistas por cada carrito`,
    });
  }

  const checkoutsPerVisit = safeDiv(totals.checkouts, totals.sessions);
  if (checkoutsPerVisit !== null) {
    rows.push({
      count: `${formatNumber(totals.checkouts)} checkouts ÷ ${formatNumber(totals.sessions)} sesiones`,
      result: `${formatRatio(checkoutsPerVisit)} checkouts por visita${perNPhrase(checkoutsPerVisit)}`,
    });
  }

  const cartsPerCheckout = safeDiv(totals.addToCarts, totals.checkouts);
  if (cartsPerCheckout !== null) {
    rows.push({
      count: `${formatNumber(totals.addToCarts)} carritos ÷ ${formatNumber(totals.checkouts)} checkouts`,
      result: `${formatRatio(cartsPerCheckout)} carritos por cada checkout iniciado`,
    });
  }

  const purchasesPerVisit = safeDiv(totals.purchases, totals.sessions);
  if (purchasesPerVisit !== null) {
    rows.push({
      count: `${formatNumber(totals.purchases)} compras ÷ ${formatNumber(totals.sessions)} sesiones`,
      result: `${formatRatio(purchasesPerVisit, 3)} compras por visita${perNPhrase(purchasesPerVisit)}`,
    });
  }

  const checkoutsPerPurchase = safeDiv(totals.checkouts, totals.purchases);
  if (checkoutsPerPurchase !== null) {
    rows.push({
      count: `${formatNumber(totals.checkouts)} checkouts ÷ ${formatNumber(totals.purchases)} compras`,
      result: `${formatRatio(checkoutsPerPurchase)} checkouts por cada compra`,
    });
  }

  return rows;
}

/**
 * Embudo de e-commerce (ver producto → agregar al carrito → checkout →
 * compra) a nivel de CONTEOS DE EVENTOS, no de sesiones únicas — una
 * misma sesión puede generar varios de estos eventos. Las tasas entre
 * pasos vienen ya calculadas por el backend (`GaFunnelRates`), acá solo
 * se arma la tabla visual.
 */
export function GaFunnelTable({ totals, funnelRates }: GaFunnelTableProps) {
  const steps: FunnelStep[] = [
    { label: 'Vistas de producto', value: totals.itemViews, rateFromPrevious: null },
    { label: 'Agregar al carrito', value: totals.addToCarts, rateFromPrevious: funnelRates.viewToCartPercent },
    { label: 'Checkout iniciado', value: totals.checkouts, rateFromPrevious: funnelRates.cartToCheckoutPercent },
    { label: 'Compra', value: totals.purchases, rateFromPrevious: funnelRates.checkoutToPurchasePercent },
  ];

  const maxValue = Math.max(...steps.map((s) => s.value), 1);
  const quickAnalysis = buildQuickAnalysis(totals);

  return (
    <ChartPanel title="Embudo de e-commerce">
      <p className="-mt-1 mb-4 text-xs text-ink-faint">
        Conteo de EVENTOS en cada paso (no de sesiones únicas) y qué % pasó de un paso al siguiente.
      </p>
      <div className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <div key={step.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-ink">{step.label}</span>
              <span className="tabular-nums text-ink-muted">{formatNumber(step.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-border">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max((step.value / maxValue) * 100, step.value > 0 ? 2 : 0)}%` }}
              />
            </div>
            {index > 0 && (
              <p className="text-right text-xs text-ink-faint">
                {step.rateFromPrevious === null ? 'Sin datos del paso anterior' : `${formatPercentage(step.rateFromPrevious)} del paso anterior`}
              </p>
            )}
          </div>
        ))}
        <p className="mt-1 border-t border-surface-border pt-2 text-right text-xs font-medium text-ink-muted">
          Vista → compra: {funnelRates.viewToPurchasePercent === null ? '—' : formatPercentage(funnelRates.viewToPurchasePercent)}
        </p>
      </div>

      {quickAnalysis.length > 0 && (
        <div className="mt-4 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Análisis rápido</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-ink-faint">
                  <th className="pb-1.5 pr-3 font-medium">Cuenta</th>
                  <th className="pb-1.5 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {quickAnalysis.map((row) => (
                  <tr key={row.count} className="border-t border-surface-border/60">
                    <td className="py-1.5 pr-3 text-ink-muted">{row.count}</td>
                    <td className="py-1.5 font-medium tabular-nums text-ink">{row.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            ℹ Son proporciones para leer tendencia — compáralas contra el mismo rango de un período anterior para
            saber si mejoran o empeoran, no hay un número "correcto" único.
          </p>
        </div>
      )}
    </ChartPanel>
  );
}
