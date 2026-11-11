'use client';

import { ChartPanel } from '@/components/OrdersByStoreChart';
import { formatCOP, formatPercentage } from '@/lib/format';
import { StoreInfo } from '@/types/dashboard';
import { SmartSaleCombinedSummaryResponse } from '@/types/smartsale-combined';

/** Mismo orden que `stores.config.ts` y el resto del dashboard — NO por venta. */
const STORE_DISPLAY_ORDER = ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'];

function marginLabel(value: number | null): string {
  return value === null ? '—' : formatPercentage(value);
}

/**
 * Cuadro por marca del Resumen de `/smartsale` — mismo formato que el
 * "Resumen por marca" de `/presupuesto`: ventas POS, ventas ERP, total,
 * venta sin IVA (base del margen), margen y utilidad, con fila de total
 * (margen ponderado + promedio simple) y nota con las fórmulas.
 */
export function SmartSaleBrandSummaryTable({
  summary,
  storeById,
}: {
  summary: SmartSaleCombinedSummaryResponse;
  storeById: Map<string, StoreInfo>;
}) {
  const marginByStore = new Map(summary.margin.byStore.map((m) => [m.storeId, m]));
  const rows = STORE_DISPLAY_ORDER.map((storeId) => {
    const store = summary.byStore.find((s) => s.storeId === storeId);
    const margin = marginByStore.get(storeId);
    return {
      storeId,
      name: storeById.get(storeId)?.name ?? storeId,
      color: storeById.get(storeId)?.color,
      posSales: store?.posSales ?? 0,
      erpSales: store?.erpSales ?? 0,
      totalSales: store?.totalSales ?? 0,
      subtotal: margin?.subtotal ?? 0,
      marginPercent: margin?.marginPercent ?? null,
      utility: margin?.utility ?? 0,
    };
  });
  const rowsWithMargin = rows.filter((r) => r.marginPercent !== null);
  const channel = summary.margin.channel;
  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint';
  const td = 'px-3 py-2 text-right tabular-nums';

  return (
    <ChartPanel title="Resumen por marca (POS + ERP)">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Marca</th>
              <th className={`${th} text-right`}>Ventas POS</th>
              <th className={`${th} text-right`}>Ventas ERP</th>
              <th className={`${th} text-right`}>Ventas totales</th>
              <th className={`${th} text-right`}>Ventas sin IVA (productos)</th>
              <th className={`${th} text-right`}>Margen</th>
              <th className={`${th} text-right`}>Utilidad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.storeId} className="border-t border-surface-border">
                <td className="px-3 py-2 font-medium text-ink">
                  <span className="inline-flex items-center gap-2">
                    {row.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />}
                    {row.name}
                  </span>
                </td>
                <td className={`${td} text-ink`}>{formatCOP(row.posSales)}</td>
                <td className={`${td} text-ink`}>{formatCOP(row.erpSales)}</td>
                <td className={`${td} font-medium text-ink`}>{formatCOP(row.totalSales)}</td>
                <td className={`${td} text-ink`}>{formatCOP(row.subtotal)}</td>
                <td className={`${td} text-ink`}>{marginLabel(row.marginPercent)}</td>
                <td className={`${td} text-ink`}>{formatCOP(row.utility)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-surface-border font-semibold text-ink">
              <td className="px-3 py-2">Total</td>
              <td className={td}>{formatCOP(summary.totalPosSales)}</td>
              <td className={td}>{formatCOP(summary.totalErpSales)}</td>
              <td className={td}>{formatCOP(summary.totalSales)}</td>
              <td className={td}>{formatCOP(channel.subtotal)}</td>
              <td className={td}>
                {marginLabel(channel.marginPercent)}
                <span className="block text-[11px] font-normal text-ink-faint">simple {marginLabel(channel.simpleAverageMarginPercent)}</span>
              </td>
              <td className={td}>{formatCOP(channel.utility)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-1 border-t border-surface-border pt-3 text-xs text-ink-faint">
        <p>
          <span className="font-semibold text-ink-muted">Ventas:</span> POS ya resta sus notas crédito; ERP es lo facturado sin
          notas crédito. <span className="font-semibold text-ink-muted">Margen y utilidad:</span> solo productos, sobre la venta sin
          IVA de POS + ERP, sin notas crédito.
        </p>
        <ul className="ml-4 list-disc space-y-0.5">
          <li>
            <span className="text-ink-muted">Utilidad por marca</span> = venta sin IVA − costo (costo unitario × cantidad) = venta
            sin IVA × margen.
          </li>
          <li>
            <span className="text-ink-muted">Margen por marca</span> = utilidad ÷ venta sin IVA.
          </li>
          <li>
            <span className="text-ink-muted">Margen total ponderado</span> = utilidad total ÷ venta total sin IVA ={' '}
            <span className="tabular-nums">
              {formatCOP(channel.utility)} ÷ {formatCOP(channel.subtotal)} = {marginLabel(channel.marginPercent)}
            </span>
            . Cada marca pesa según lo que vende; cuadra con la utilidad total.
          </li>
          <li>
            <span className="text-ink-muted">Margen total simple</span> = suma de los márgenes de las marcas ÷ número de marcas
            {rowsWithMargin.length > 0 ? (
              <span className="tabular-nums">
                {' '}= (
                {rowsWithMargin.map((r, i) => (
                  <span key={r.storeId} className="whitespace-nowrap">
                    {i > 0 && ' + '}
                    {r.color && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: r.color }} />}
                    {r.name} {marginLabel(r.marginPercent)}
                  </span>
                ))}
                ) ÷ {rowsWithMargin.length} = {marginLabel(channel.simpleAverageMarginPercent)}
              </span>
            ) : (
              ' — sin ventas en el rango'
            )}
            . Todas las marcas pesan igual (solo entran las que vendieron en el rango).
          </li>
        </ul>
        <p>
          <span className="font-semibold text-ink-muted">Fletes, bolsas y material publicitario:</span> cuentan en las ventas pero no
          en el margen ni en la utilidad.
        </p>
      </div>
    </ChartPanel>
  );
}
