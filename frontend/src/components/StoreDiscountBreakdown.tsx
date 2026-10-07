'use client';

import { useState } from 'react';

import { StoreDashboardResult } from '@/types/dashboard';
import { DiscountAnalyticsResponse } from '@/types/product-analytics';
import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { DiscountMetric, rankedBuckets, topBucketStats } from '@/lib/discount';
import { DiscountMetricToggle } from './DiscountMetricToggle';

interface StoreDiscountBreakdownProps {
  stores: StoreDashboardResult[];
  discountAnalytics: DiscountAnalyticsResponse;
  /**
   * "Venta con flete" por tienda a mostrar — por defecto `store.data.revenueTotalValue`
   * (la venta TOTAL de la tienda). Este componente se reutiliza en `/smartsale`,
   * donde `discountAnalytics` ya viene ACOTADO al canal SmartSale (no a la
   * tienda completa) — ahí hay que pasar este prop con la venta CON FLETE
   * de SOLO ese canal (`SmartSaleStoreSummary.smartSaleSales`), para no
   * comparar una venta de canal (sin flete) contra la venta de TODA la
   * tienda (con flete) — números de universos distintos.
   */
  revenueTotalByStore?: Record<string, number>;
}

/** `value` ya viene en unidades o en pesos según la métrica activa — este helper solo decide cómo formatearlo para pantalla. */
function formatMetricValue(value: number, metric: DiscountMetric): string {
  return metric === 'units' ? formatNumber(value) : formatCOP(value);
}

/**
 * Descuento más aplicado POR TIENDA — protagonismo para el bucket top
 * (número grande, como antes) — y, debajo, el resto de los buckets que sí
 * se aplicaron, de mayor a menor, para poder leer el comportamiento
 * completo (ej. "70% es el más vendido en Pilatos, pero ¿qué tanto pesan
 * el 50% o el 30%?") sin tener que leerlo de las barras apiladas de
 * `DiscountDistributionChart`. Siempre suma 100% del rango consultado.
 *
 * El toggle `DiscountMetricToggle` alterna entre leer esto por CANTIDAD DE
 * PRODUCTOS o por VALOR EN PESOS vendido bajo cada descuento — este
 * segundo es el insumo que alimenta, más adelante, el cálculo de margen
 * (cuánto se "regaló" en pesos, no solo en unidades).
 */
export function StoreDiscountBreakdown({ stores, discountAnalytics, revenueTotalByStore }: StoreDiscountBreakdownProps) {
  const [metric, setMetric] = useState<DiscountMetric>('units');
  const unitLabel = metric === 'units' ? 'productos' : 'en ventas';

  const generalStats = topBucketStats(discountAnalytics.global, metric);

  const storesWithStats = stores
    .map((store) => ({
      store,
      distribution: discountAnalytics.byStore[store.id],
      stats: discountAnalytics.byStore[store.id] ? topBucketStats(discountAnalytics.byStore[store.id], metric) : null,
    }))
    .filter(
      (entry): entry is { store: StoreDashboardResult; distribution: NonNullable<typeof entry.distribution>; stats: NonNullable<typeof entry.stats> } =>
        entry.distribution !== undefined && entry.stats !== null,
    );

  const generalTotal = metric === 'units' ? discountAnalytics.global.totalItems : discountAnalytics.global.totalSales;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="font-display text-base font-semibold text-ink">Descuento más aplicado por tienda</h3>
        <DiscountMetricToggle value={metric} onChange={setMetric} />
      </div>
      {generalStats && (
        <p className="mb-1 text-xs text-ink-faint">
          En general: {generalStats.bucket}% — {formatMetricValue(generalStats.value, metric)} de{' '}
          {formatMetricValue(generalTotal, metric)} {unitLabel} ({formatPercentage(generalStats.percentage)})
        </p>
      )}
      <p className="mb-4 max-w-3xl text-xs text-ink-faint">
        Para cada tienda, su venta total y el desglose de cuánto participó cada % de descuento.{' '}
        {metric === 'units' ? (
          <>
            Esta vista es <strong className="font-medium text-ink-muted">por producto vendido</strong> — cada % representa
            qué porción de los PRODUCTOS vendidos en el rango de fechas consultado tuvo exactamente ese descuento (una
            misma orden con 2 productos a descuentos distintos aporta a los dos buckets por separado).
          </>
        ) : (
          <>
            Esta vista es <strong className="font-medium text-ink-muted">por valor en pesos</strong> — cuánto se vendió
            bajo cada % de descuento, y qué porción de la venta total representó. Los porcentajes de abajo son sobre la
            venta SIN FLETE (a nivel de producto) — cada tarjeta muestra también la venta CON FLETE para comparar.{' '}
            <strong className="font-medium text-ink-muted">Disponible desde septiembre de 2026</strong> — meses
            anteriores mostrarán $0 en esta vista (sí están completos en &quot;Por producto&quot;).
          </>
        )}{' '}
        Por eso la lista de abajo siempre suma 100%.
      </p>

      {storesWithStats.length === 0 ? (
        <p className="text-sm text-ink-faint">No hay datos de descuento disponibles todavía.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {storesWithStats.map(({ store, distribution, stats }) => {
            const distributionTotal = metric === 'units' ? distribution.totalItems : distribution.totalSales;
            return (
              <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                  {store.name}
                </p>
                {metric === 'units' ? (
                  <p className="mb-3 text-xs text-ink-faint">
                    Productos vendidos:{' '}
                    <span className="font-display text-sm font-semibold text-ink">
                      {formatMetricValue(distributionTotal, metric)}
                    </span>
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-ink-faint">
                    Venta con flete:{' '}
                    <span className="font-display text-sm font-semibold text-ink">
                      {formatCOP(revenueTotalByStore?.[store.id] ?? store.data?.revenueTotalValue ?? 0)}
                    </span>
                    <br />
                    Venta sin flete:{' '}
                    <span className="font-display text-sm font-semibold text-ink">{formatCOP(distributionTotal)}</span>
                  </p>
                )}

                <ul className="flex flex-col gap-1.5">
                  {rankedBuckets(distribution, metric).map((b) => (
                    <li key={b.bucket} className="flex items-center gap-2 text-xs">
                      <span
                        className={`w-9 shrink-0 tabular-nums ${
                          b.bucket === stats.bucket ? 'font-semibold text-ink' : 'text-ink-muted'
                        }`}
                      >
                        {b.bucket}%
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-border">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(b.percentage, 2)}%`,
                            backgroundColor: b.bucket === stats.bucket ? store.color : '#C7CDD9',
                          }}
                        />
                      </span>
                      <span className="shrink-0 text-right tabular-nums text-ink-faint">
                        {formatMetricValue(b.value, metric)} ({formatPercentage(b.percentage)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
