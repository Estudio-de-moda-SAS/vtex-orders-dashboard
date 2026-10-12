import { formatNumber, formatPercentage } from '@/lib/format';
import { ResumenStoreResult } from '@/types/resumen';
import { ChartPanel } from './OrdersByStoreChart';

interface ResumenRankingTableProps {
  stores: ResumenStoreResult[];
}

const COLOR_DOT: Record<ResumenStoreResult['color'], string> = {
  verde: 'bg-positive',
  amarillo: 'bg-warning',
  rojo: 'bg-danger',
  gris: 'bg-ink-faint',
};

function formatSignedPercent(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatPercentage(value)}`;
}

/** Ya viene ordenado (y con `rankingPosition` asignado) por el backend — grises al final, sin puntaje combinado de "salud". */
export function ResumenRankingTable({ stores }: ResumenRankingTableProps) {
  return (
    <ChartPanel title="Ranking por variación de ventas">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
              <th className="py-2 pr-4 font-medium">#</th>
              <th className="py-2 pr-4 font-medium">Tienda</th>
              <th className="py-2 pr-4 font-medium text-right">Ventas Δ%</th>
              <th className="py-2 pr-4 font-medium text-right">Sesiones Δ%</th>
              <th className="py-2 pr-4 font-medium text-right">Conversión Δ%</th>
              <th className="py-2 font-medium text-right">Ticket Δ%</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.storeId} className="border-b border-surface-border/60 last:border-0">
                <td className="py-2.5 pr-4 tabular-nums text-ink-faint">{store.rankingPosition}</td>
                <td className="py-2.5 pr-4 font-medium text-ink">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${COLOR_DOT[store.color]}`} />
                    {store.storeName}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right font-medium tabular-nums text-ink">{formatSignedPercent(store.sales.changePercent)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-ink-muted">{formatSignedPercent(store.sessions.changePercent)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-ink-muted">{formatSignedPercent(store.conversionPercent.changePercent)}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-muted">{formatSignedPercent(store.ticket.changePercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartPanel>
  );
}
