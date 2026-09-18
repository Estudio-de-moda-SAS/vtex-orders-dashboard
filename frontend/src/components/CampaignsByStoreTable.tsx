import { StoreDashboardResult } from '@/types/dashboard';
import { StoreHighlightsByStore } from '@/types/product-analytics';
import { formatCOP, formatNumber } from '@/lib/format';

const NO_CAMPAIGN_LABEL = 'Sin campaña';

interface CampaignsByStoreTableProps {
  stores: StoreDashboardResult[];
  highlights: StoreHighlightsByStore;
  /** Si se pasa con al menos una campaña, cada tienda muestra SOLO esas campañas en vez de la lista completa. */
  selectedCampaigns?: string[];
}

/**
 * Por tienda: campañas de descuento usadas en órdenes CONTABILIZADAS
 * (mismo criterio de "ventas" que el resto del dashboard — órdenes/valor
 * acá ya vienen filtrados así), ordenadas de mayor a menor por órdenes.
 * Incluye "Sin campaña" (órdenes contabilizadas que no calificaron para
 * ningún beneficio). Recuadro aparte, no dentro de las tarjetas de
 * tienda — se arma como grilla de tarjetas por tienda (mismo patrón que
 * "Descuento más aplicado por tienda"), no como tabla de una sola fila
 * por tienda.
 *
 * IMPORTANTE — por qué NO se muestra "suma de todas las filas de
 * campaña" como número de referencia: una orden puede calificar para
 * VARIOS beneficios a la vez (confirmado con datos reales: una orden de
 * Pilatos tenía "SALE 60%" + "Envío gratis área metropolitana" + "Cobro
 * máximo de flete", los tres simultáneos) — cada uno se cuenta en su
 * propia fila, así que esa ÚNICA orden aporta a 3 filas distintas.
 * Sumar las filas de la lista NUNCA va a cuadrar con el total (ni en
 * órdenes ni en valor), así que en vez de eso se muestra un desglose que
 * SÍ reconcilia exacto: "con alguna campaña" + "Sin campaña" = total de
 * la tienda, sin doble conteo (cada orden solo se cuenta una vez en esa
 * partición, sin importar cuántas campañas tenga).
 */
export function CampaignsByStoreTable({ stores, highlights, selectedCampaigns = [] }: CampaignsByStoreTableProps) {
  const isFiltered = selectedCampaigns.length > 0;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-5 shadow-panel">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">Campañas de descuento por tienda</h3>
      <p className="mb-4 text-xs text-ink-faint">
        {isFiltered
          ? 'Órdenes y valor de las campañas seleccionadas, por tienda (solo ventas contabilizadas).'
          : 'Campañas de descuento usadas en ventas contabilizadas. Una orden puede tener varias campañas a la vez (ej. un % de descuento y envío gratis simultáneos), así que sumar las filas de abajo NO da el total de la tienda — para eso usa el desglose "con alguna campaña / Sin campaña" de cada tienda, que sí reconcilia exacto.'}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => {
          const highlight = highlights[store.id];
          const campaigns = isFiltered
            ? (highlight?.campaigns ?? []).filter((c) => selectedCampaigns.includes(c.campaignName))
            : (highlight?.campaigns ?? []);

          const sinCampañaOrders = highlight?.campaigns.find((c) => c.campaignName === NO_CAMPAIGN_LABEL)?.orders ?? 0;
          const withCampaignOrders = highlight ? highlight.totals.orders - sinCampañaOrders : 0;

          return (
            <div key={store.id} className="rounded-xl border border-surface-border bg-surface p-3.5">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: store.color }} />
                {store.name}
              </p>

              {store.success && highlight && !isFiltered && (
                <p className="mb-2 text-xs tabular-nums text-ink-faint">
                  Total tienda (contabilizado): {formatNumber(highlight.totals.orders)} ord. ·{' '}
                  {formatCOP(highlight.totals.sales)}
                  <br />
                  Con alguna campaña: {formatNumber(withCampaignOrders)} ord. · Sin campaña:{' '}
                  {formatNumber(sinCampañaOrders)} ord.
                </p>
              )}

              {!store.success || !highlight ? (
                <p className="text-xs text-danger">{store.error ?? 'Sin datos'}</p>
              ) : campaigns.length === 0 ? (
                <p className="text-xs text-ink-faint">
                  {isFiltered ? 'Sin ventas de esas campañas en esta tienda.' : 'Sin campañas registradas.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {campaigns.map((campaign) => (
                    <li
                      key={campaign.campaignName}
                      className="flex items-baseline justify-between gap-2 text-xs text-ink-muted"
                    >
                      <span className="truncate">{campaign.campaignName}</span>
                      <span className="shrink-0 tabular-nums text-ink">
                        {formatNumber(campaign.orders)} ord. · {formatCOP(campaign.sales)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
