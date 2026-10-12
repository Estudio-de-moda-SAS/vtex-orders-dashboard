'use client';

import { useState } from 'react';

import { formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { ResumenStoreResult } from '@/types/resumen';

interface ResumenStoreCardProps {
  result: ResumenStoreResult;
}

const COLOR_STYLES: Record<ResumenStoreResult['color'], { badge: string; border: string }> = {
  verde: { badge: 'bg-positive/15 text-positive', border: 'border-l-positive' },
  amarillo: { badge: 'bg-warning/15 text-warning', border: 'border-l-warning' },
  rojo: { badge: 'bg-danger/15 text-danger', border: 'border-l-danger' },
  gris: { badge: 'bg-surface-border text-ink-faint', border: 'border-l-surface-border' },
};

function formatSignedPercent(value: number | null): string {
  if (value === null) return 'sin datos';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatPercentage(value)}`;
}

function formatValueOrDash(value: number | null, formatter: (v: number) => string): string {
  return value === null ? '—' : formatter(value);
}

/** Fila de la mini-tabla A/B/Δ% — `label` ya trae la unidad si aplica (ej. "Conversión (%)"). */
function MetricRow({
  label,
  a,
  b,
  changePercent,
  formatter,
}: {
  label: string;
  a: number | null;
  b: number | null;
  changePercent: number | null;
  formatter: (v: number) => string;
}) {
  return (
    <tr className="border-t border-surface-border/60">
      <td className="py-1.5 pr-3 text-ink-muted">{label}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-ink">{formatValueOrDash(a, formatter)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">{formatValueOrDash(b, formatter)}</td>
      <td className="py-1.5 text-right tabular-nums font-medium text-ink">{formatSignedPercent(changePercent)}</td>
    </tr>
  );
}

export function ResumenStoreCard({ result }: ResumenStoreCardProps) {
  const [showCalculation, setShowCalculation] = useState(false);
  const colorStyle = COLOR_STYLES[result.color];

  return (
    <div className={`flex flex-col gap-4 rounded-2xl border border-l-4 border-surface-border bg-surface-panel p-5 shadow-panel ${colorStyle.border}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-ink">{result.storeName}</h3>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {result.provisional && (
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">Provisional</span>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${colorStyle.badge}`}>{result.color}</span>
          </div>
          {result.color !== 'gris' && (
            <p className="text-[11px] text-ink-faint">
              verde ≥ {formatPercentage(result.thresholds.greenLimit)} · rojo &lt; {formatPercentage(result.thresholds.redLimit)}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs text-ink-faint">Ventas contabilizadas</p>
        <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-ink">
          {formatValueOrDash(result.sales.a, formatCOP)}
        </p>
        <p className="text-xs text-ink-faint">
          {formatSignedPercent(result.sales.changePercent)} vs. {formatValueOrDash(result.sales.b, formatCOP)} del período anterior
        </p>
        {result.pilatos && (
          <p className="mt-1 text-xs text-ink-faint">
            Ventas del sitio (sin marketplaces): <span className="font-medium text-ink">{formatValueOrDash(result.pilatos.siteSales.a, formatCOP)}</span>{' '}
            ({formatSignedPercent(result.pilatos.siteSales.changePercent)})
          </p>
        )}
      </div>

      {result.color === 'gris' && result.grayReason && (
        <p className="rounded-xl border border-surface-border bg-surface px-3 py-2 text-xs text-ink-faint">{result.grayReason}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-faint">
              <th className="pb-1.5 font-medium"></th>
              <th className="pb-1.5 pr-3 text-right font-medium">Actual</th>
              <th className="pb-1.5 pr-3 text-right font-medium">Anterior</th>
              <th className="pb-1.5 text-right font-medium">Δ%</th>
            </tr>
          </thead>
          <tbody>
            <MetricRow label="Sesiones" a={result.sessions.a} b={result.sessions.b} changePercent={result.sessions.changePercent} formatter={formatNumber} />
            <MetricRow
              label="Órdenes contabilizadas"
              a={result.orders.a}
              b={result.orders.b}
              changePercent={result.orders.changePercent}
              formatter={formatNumber}
            />
            <MetricRow
              label="Conversión"
              a={result.conversionPercent.a}
              b={result.conversionPercent.b}
              changePercent={result.conversionPercent.changePercent}
              formatter={formatPercentage}
            />
            <MetricRow label="Ticket" a={result.ticket.a} b={result.ticket.b} changePercent={result.ticket.changePercent} formatter={formatCOP} />
          </tbody>
        </table>
        {result.pilatos && (
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Conversión y Ticket usan las órdenes del sitio (sin marketplaces):{' '}
            <span className="font-medium text-ink">{formatValueOrDash(result.pilatos.siteOrders.a, formatNumber)}</span> (actual) /{' '}
            <span className="font-medium text-ink">{formatValueOrDash(result.pilatos.siteOrders.b, formatNumber)}</span> (anterior) — no las de "Órdenes
            contabilizadas" de arriba, que son el total con marketplaces.
          </p>
        )}
      </div>

      <p className="text-sm text-ink">{result.message}</p>

      {(result.engine || result.brakes.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {result.engine && (
            <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">
              Motor: {result.engine} ({formatSignedPercent(result.engineChangePercent ?? null)})
            </span>
          )}
          {result.brakes.map((brake) => (
            <span key={brake} className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
              Freno: {brake} ({formatSignedPercent(result.brakeChangePercents?.[brake] ?? null)})
            </span>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowCalculation((prev) => !prev)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {showCalculation ? 'Ocultar' : '¿Cómo se calculó este color?'}
        </button>
        {showCalculation && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-surface-border bg-surface p-3.5 text-xs text-ink-muted">
            <p>
              Período actual: <span className="font-medium text-ink">{result.periodA.startDate} → {result.periodA.endDate}</span>
            </p>
            <p>
              Período anterior: <span className="font-medium text-ink">{result.periodB.startDate} → {result.periodB.endDate}</span>
            </p>
            <p>
              Variación de ventas: <span className="font-medium text-ink">{formatSignedPercent(result.sales.changePercent)}</span>
            </p>
            <p>
              Límites aplicados: rojo <span className="font-medium text-ink">{formatPercentage(result.thresholds.redLimit)}</span> · verde{' '}
              <span className="font-medium text-ink">{formatPercentage(result.thresholds.greenLimit)}</span> — fuente:{' '}
              <span className="font-medium text-ink">{result.thresholds.source}</span>
              {result.thresholds.source === 'historial propio' && result.thresholds.sigma !== null && (
                <> (σ = {formatPercentage(result.thresholds.sigma)}, {result.thresholds.windowCount} ventanas)</>
              )}
            </p>
            <p>
              Órdenes contabilizadas vs. mínimo ({formatNumber(result.minOrdersInfo.minOrders)}):{' '}
              <span className="font-medium text-ink">
                {formatValueOrDash(result.orders.a, formatNumber)} (actual) / {formatValueOrDash(result.orders.b, formatNumber)} (anterior)
              </span>{' '}
              — mínimo calculado con: <span className="font-medium text-ink">{result.minOrdersInfo.source}</span>
              {result.minOrdersInfo.source === 'historial propio' && result.minOrdersInfo.medianOrders !== null && (
                <> (30% de su mediana histórica de {formatNumber(result.minOrdersInfo.medianOrders)} órdenes, {result.minOrdersInfo.windowCount} ventanas)</>
              )}
            </p>
            <p>
              Cobertura de Analytics: <span className="font-medium text-ink">{formatPercentage(result.gaCoverageA * 100)}</span> (actual) /{' '}
              <span className="font-medium text-ink">{formatPercentage(result.gaCoverageB * 100)}</span> (anterior)
            </p>
            {result.mix && (
              <p>
                Lectura de mezcla de canales (según Analytics, indicativo): <span className="font-medium text-ink">{result.mix.reading}</span> — mezcla{' '}
                {formatSignedPercent(result.mix.mixEffect)} pp, dentro {formatSignedPercent(result.mix.withinEffect)} pp
              </p>
            )}
            {result.pilatos && (
              <p>
                Marketplaces excluidos de la base del sitio: <span className="font-medium text-ink">{result.pilatos.excludedMarketplaces.join(', ')}</span>
              </p>
            )}
            {result.provisionalDates.length > 0 && (
              <p>
                Días provisionales: <span className="font-medium text-ink">{result.provisionalDates.join(', ')}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
