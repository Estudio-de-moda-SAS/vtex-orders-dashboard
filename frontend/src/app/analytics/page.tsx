'use client';

import { Suspense, useState } from 'react';

import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ErrorState } from '@/components/ErrorState';
import { GaBreakdownTable, GaBreakdownTableRow } from '@/components/GaBreakdownTable';
import { GaCampaignsTable, GaCampaignsTableRow } from '@/components/GaCampaignsTable';
import { GaFunnelTable } from '@/components/GaFunnelTable';
import { GaNewVsReturningChart } from '@/components/GaNewVsReturningChart';
import { GaProductsTable, GaProductsTableRow } from '@/components/GaProductsTable';
import { GaSessionsTrendChart } from '@/components/GaSessionsTrendChart';
import { analyticsGaService } from '@/services/analytics-ga.service';
import { formatAverageTicket, formatCOP, formatNumber, formatPercentage } from '@/lib/format';
import { useCachedQuery } from '@/lib/useCachedQuery';
import { useDateRangeFilter } from '@/lib/useDateRangeFilter';
import {
  GaCampaignsResponse,
  GaChannelsResponse,
  GaCitiesResponse,
  GaDevicesResponse,
  GaLandingPagesResponse,
  GaOverviewResponse,
  GaProductsResponse,
  GaStoreOverview,
  GaUserTypesResponse,
} from '@/types/ga-analytics';

// Mismos colores de marca que `backend/src/config/stores.config.ts` — se repiten acá porque
// el frontend no importa config del backend (ver el mismo patrón en `DiscountDistributionChart`/`StoreCard`).
// `pdpBaseUrl`: dominio del sitio de cada tienda, usado para armar un link de BÚSQUEDA
// (`/s?q=`) por producto en `GaProductsTable` — no un link directo a la ficha exacta.
// Se probó en vivo: VTEX exige que el slug de `/p?skuId=` coincida EXACTO con el que generó al
// crear el producto (trae un código de referencia que GA4 no expone en `itemName`), así que un
// slug armado solo con el nombre da 404 — la búsqueda sí funciona sin el slug exacto.
const STORES = [
  { id: 'pilatos', name: 'Pilatos', color: '#f5c518', pdpBaseUrl: 'https://www.pilatos.com' },
  { id: 'kipling', name: 'Kipling', color: '#ff73be', pdpBaseUrl: 'https://www.kipling.com.co' },
  { id: 'diesel', name: 'Diesel', color: '#e4002b', pdpBaseUrl: 'https://co.diesel.com' },
  { id: 'superdry', name: 'Superdry', color: '#000000', pdpBaseUrl: 'https://www.superdry.com.co' },
  { id: 'girbaud', name: 'Girbaud', color: '#001489', pdpBaseUrl: 'https://www.girbaud.com.co' },
  { id: 'replay', name: 'Replay', color: '#d71920', pdpBaseUrl: 'https://www.replaycol.com' },
];

interface AnalyticsPageData {
  overview: GaOverviewResponse;
  channels: GaChannelsResponse;
  devices: GaDevicesResponse;
  landingPages: GaLandingPagesResponse;
  userTypes: GaUserTypesResponse;
  cities: GaCitiesResponse;
  products: GaProductsResponse;
  campaigns: GaCampaignsResponse;
}

/** Etiquetas legibles para `newVsReturning` de GA4 — el resto (ej. "(not set)") se muestra tal cual. */
const USER_TYPE_LABELS: Record<string, string> = {
  new: 'Nuevos',
  returning: 'Recurrentes',
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** `useSearchParams` (dentro de `useDateRangeFilter`) exige un límite `<Suspense>` en Next.js App Router. */
export default function AnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsContent />
    </Suspense>
  );
}

function AnalyticsContent() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRangeFilter('vica-analytics-range');
  const [storeId, setStoreId] = useState<string>('');

  // Siempre se trae TODAS las tiendas de una sola vez (nunca con `storeId` en
  // la consulta) — el selector de tienda solo decide qué parte de esto se
  // muestra, SIN volver a consultar al backend. Así cambiar de tienda es
  // instantáneo, y no hace falta darle "Consultar" de nuevo cada vez que se
  // cambia de tienda con las mismas fechas (antes sí recargaba, y además
  // mostraba la tienda equivocada mientras tanto — ver nota en `StoreDetail`).
  const { state: requestState, refetch: runQuery } = useCachedQuery<AnalyticsPageData>(
    // "v2": la forma de `AnalyticsPageData` cambió varias veces (channels, devices, landingPages,
    // userTypes, cities, products se fueron agregando) — sin este cambio de prefijo, un caché
    // guardado en `sessionStorage` ANTES de alguno de esos campos se lee tal cual (sin
    // validación de forma) y revienta con "Cannot read properties of undefined" al intentar
    // leer el campo que faltaba (confirmado en producción). Subir la versión invalida de una
    // sola vez todo el caché viejo de esta página.
    // "v3": se agregó `campaigns` a `AnalyticsPageData` — mismo motivo que el salto a "v2"
    // (ver nota de arriba), bumpeado de nuevo para invalidar el caché viejo sin ese campo.
    `analytics:v3:${startDate}:${endDate}`,
    async () => {
      const [overview, channels, devices, landingPages, userTypes, cities, products, campaigns] = await Promise.all([
        analyticsGaService.getGaOverview(startDate, endDate),
        analyticsGaService.getGaChannels(startDate, endDate),
        analyticsGaService.getGaDevices(startDate, endDate),
        analyticsGaService.getGaLandingPages(startDate, endDate),
        analyticsGaService.getGaUserTypes(startDate, endDate),
        analyticsGaService.getGaCities(startDate, endDate),
        analyticsGaService.getGaProducts(startDate, endDate),
        analyticsGaService.getGaCampaigns(startDate, endDate),
      ]);
      return { overview, channels, devices, landingPages, userTypes, cities, products, campaigns };
    },
    { autoFetchOnKeyChange: false },
  );

  const isLoading = requestState.status === 'loading';
  const selectedStoreName = STORES.find((s) => s.id === storeId)?.name;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Analytics
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Comportamiento en el sitio (Google Analytics 4)</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Tráfico, embudo de compra y canales de adquisición — datos de Google Analytics, no de VTEX. Elige una tienda
          para ver su detalle completo, o deja &quot;Todas las tiendas&quot; para comparar.
        </p>
      </header>

      <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
        ⚠ Analytics subestima el tráfico y las compras reales (bloqueadores de anuncios, rechazo de cookies). Úsalo
        para ver TENDENCIAS y comparaciones, nunca como la cifra exacta de visitas o ventas — esa sigue siendo VTEX.
      </div>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onSubmit={() => runQuery()}
        isLoading={isLoading}
      />

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        Tienda
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">Todas las tiendas</option>
          {STORES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {isLoading && (
        <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm font-medium text-ink">Consultando Analytics…</p>
          </div>
        </div>
      )}

      {requestState.status === 'error' && <ErrorState message={requestState.message} onRetry={() => runQuery()} />}

      {requestState.status === 'success' &&
        (storeId ? (
          <StoreDetail
            overview={requestState.data.overview.stores.find((s) => s.storeId === storeId)}
            channels={requestState.data.channels.byStore[storeId] ?? []}
            totalSessionsChannels={requestState.data.channels.totalSessionsByStore[storeId] ?? 0}
            devices={requestState.data.devices.byStore[storeId] ?? []}
            totalSessionsDevices={requestState.data.devices.totalSessionsByStore[storeId] ?? 0}
            landingPages={requestState.data.landingPages.byStore[storeId] ?? []}
            totalSessionsLandingPages={requestState.data.landingPages.totalSessionsByStore[storeId] ?? 0}
            userTypes={requestState.data.userTypes.byStore[storeId] ?? []}
            totalSessionsUserTypes={requestState.data.userTypes.totalSessionsByStore[storeId] ?? 0}
            cities={requestState.data.cities.byStore[storeId] ?? []}
            totalSessionsCities={requestState.data.cities.totalSessionsByStore[storeId] ?? 0}
            products={requestState.data.products.byStore[storeId] ?? []}
            campaigns={requestState.data.campaigns.byStore[storeId] ?? []}
            totalSessionsCampaigns={requestState.data.campaigns.totalSessionsByStore[storeId] ?? 0}
            pdpBaseUrl={STORES.find((s) => s.id === storeId)?.pdpBaseUrl}
            storeName={selectedStoreName ?? storeId}
          />
        ) : (
          <StoresComparisonGrid stores={requestState.data.overview.stores} />
        ))}
    </main>
  );
}

/** Vista completa de UNA tienda: totales, estado de sincronización, embudo, tendencia de sesiones y desgloses. */
function StoreDetail({
  overview,
  channels,
  totalSessionsChannels,
  devices,
  totalSessionsDevices,
  landingPages,
  totalSessionsLandingPages,
  userTypes,
  totalSessionsUserTypes,
  cities,
  totalSessionsCities,
  products,
  campaigns,
  totalSessionsCampaigns,
  pdpBaseUrl,
  storeName,
}: {
  overview: GaStoreOverview | undefined;
  channels: GaChannelsResponse['byStore'][string];
  totalSessionsChannels: number;
  devices: GaDevicesResponse['byStore'][string];
  totalSessionsDevices: number;
  landingPages: GaLandingPagesResponse['byStore'][string];
  totalSessionsLandingPages: number;
  userTypes: GaUserTypesResponse['byStore'][string];
  totalSessionsUserTypes: number;
  cities: GaCitiesResponse['byStore'][string];
  totalSessionsCities: number;
  products: GaProductsResponse['byStore'][string];
  campaigns: GaCampaignsResponse['byStore'][string];
  totalSessionsCampaigns: number;
  pdpBaseUrl?: string;
  storeName: string;
}) {
  if (!overview) {
    return <p className="text-sm text-ink-faint">Sin datos de Analytics para {storeName} en este rango.</p>;
  }

  const channelRows: GaBreakdownTableRow[] = channels.map((c) => ({
    label: c.channelGroup,
    sessions: c.sessions,
    sessionsPercent: c.sessionsPercent,
    totalUsers: c.totalUsers,
    usersPercent: c.usersPercent,
    purchases: c.purchases,
    purchasesPercent: c.purchasesPercent,
    gaRevenue: c.gaRevenue,
    revenuePercent: c.revenuePercent,
    conversionPercent: c.conversionPercent,
  }));

  const deviceRows: GaBreakdownTableRow[] = devices.map((d) => ({
    label: d.deviceCategory,
    sessions: d.sessions,
    sessionsPercent: d.sessionsPercent,
    totalUsers: d.totalUsers,
    usersPercent: d.usersPercent,
    purchases: d.purchases,
    purchasesPercent: d.purchasesPercent,
    gaRevenue: d.gaRevenue,
    revenuePercent: d.revenuePercent,
    conversionPercent: d.conversionPercent,
  }));

  const landingPageRows: GaBreakdownTableRow[] = landingPages.map((p) => ({
    label: p.landingPage,
    sessions: p.sessions,
    sessionsPercent: p.sessionsPercent,
    totalUsers: p.totalUsers,
    usersPercent: p.usersPercent,
    purchases: p.purchases,
    purchasesPercent: p.purchasesPercent,
    gaRevenue: p.gaRevenue,
    revenuePercent: p.revenuePercent,
    conversionPercent: p.conversionPercent,
  }));

  const userTypeRows: GaBreakdownTableRow[] = userTypes.map((u) => ({
    label: USER_TYPE_LABELS[u.userType] ?? u.userType,
    sessions: u.sessions,
    sessionsPercent: u.sessionsPercent,
    totalUsers: u.totalUsers,
    usersPercent: u.usersPercent,
    purchases: u.purchases,
    purchasesPercent: u.purchasesPercent,
    gaRevenue: u.gaRevenue,
    revenuePercent: u.revenuePercent,
    conversionPercent: u.conversionPercent,
  }));

  const cityRows: GaBreakdownTableRow[] = cities.map((c) => ({
    label: c.city,
    sessions: c.sessions,
    sessionsPercent: c.sessionsPercent,
    totalUsers: c.totalUsers,
    usersPercent: c.usersPercent,
    purchases: c.purchases,
    purchasesPercent: c.purchasesPercent,
    gaRevenue: c.gaRevenue,
    revenuePercent: c.revenuePercent,
    conversionPercent: c.conversionPercent,
  }));

  // "(otros)" y "(not set)" no son productos reales — nunca llevan link (confirmado en
  // producción: Diesel tiene un volumen grande de eventos con item_id "(not set)" por un
  // problema de instrumentación de GTM en su sitio, no algo que el dashboard pueda resolver).
  //
  // `p.productUrl` es el link REAL del producto, resuelto por el backend contra la API
  // pública de catálogo de VTEX durante el sync (ver `GaSyncService.resolveMissingProductLinks`)
  // — se usa cuando ya está cacheado. Si todavía no se resolvió (SKU nuevo, pendiente del
  // próximo sync), cae de vuelta a la búsqueda de VTEX (`/s?q=`): se probó en vivo que un link
  // directo a `/p?skuId=` arma el slug mal (VTEX exige uno idéntico al que generó al crear el
  // producto, con un código de referencia que GA4 no expone) y da 404 en las 6 tiendas.
  const productRows: GaProductsTableRow[] = products.map((p) => {
    const isRealProduct = p.itemId !== '(otros)' && p.itemId !== '(not set)';
    return {
      itemId: p.itemId,
      itemName: p.itemName,
      itemCategory: p.itemCategory,
      itemsViewed: p.itemsViewed,
      itemsAddedToCart: p.itemsAddedToCart,
      itemsPurchased: p.itemsPurchased,
      itemRevenue: p.itemRevenue,
      viewToPurchasePercent: p.viewToPurchasePercent,
      productReference: p.productReference,
      productUrl:
        p.productUrl ?? (pdpBaseUrl && isRealProduct ? `${pdpBaseUrl}/s?q=${encodeURIComponent(p.itemName)}` : undefined),
    };
  });

  // Ya viene ordenado por vistas desde el backend — con "Vista → compra" al lado alcanza para
  // ver qué convierte bien y qué no, sin necesidad de una segunda tabla ordenada por ingresos.
  const mostViewedProducts = productRows;

  const campaignRows: GaCampaignsTableRow[] = campaigns.map((c) => ({
    campaignName: c.campaignName,
    sourceMedium: c.sourceMedium,
    sessions: c.sessions,
    sessionsPercent: c.sessionsPercent,
    addToCarts: c.addToCarts,
    addToCartsPercent: c.addToCartsPercent,
    checkouts: c.checkouts,
    checkoutsPercent: c.checkoutsPercent,
    purchases: c.purchases,
    purchasesPercent: c.purchasesPercent,
    gaRevenue: c.gaRevenue,
    revenuePercent: c.revenuePercent,
    conversionPercent: c.conversionPercent,
  }));

  return (
    <>
      <SyncStatusBanner overview={overview} />

      <StatSectionLabel>Tráfico</StatSectionLabel>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Sesiones" value={formatNumber(overview.totals.sessions)} />
        <StatCard label="Con interacción" value={formatNumber(overview.totals.engagedSessions)} />
        <StatCard
          label="Tasa de rebote"
          value={
            overview.totals.sessions > 0
              ? formatPercentage((1 - overview.totals.engagedSessions / overview.totals.sessions) * 100)
              : '—'
          }
        />
        <StatCard label="Usuarios" value={formatNumber(overview.totals.totalUsersSum)} />
        <StatCard
          label="Nuevos"
          value={formatNumber(overview.totals.newUsersSum)}
          hint={
            overview.totals.totalUsersSum > 0
              ? formatPercentage((overview.totals.newUsersSum / overview.totals.totalUsersSum) * 100)
              : undefined
          }
        />
        <StatCard
          label="Recurrentes (aprox.)"
          value={formatNumber(overview.totals.returningUsersSum)}
          hint={
            overview.totals.totalUsersSum > 0
              ? formatPercentage((overview.totals.returningUsersSum / overview.totals.totalUsersSum) * 100)
              : undefined
          }
        />
      </div>

      <StatSectionLabel>Comercial (según GA)</StatSectionLabel>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Compras" value={formatNumber(overview.totals.purchases)} />
        <StatCard label="Ingresos" value={formatCOP(overview.totals.gaRevenue)} />
        <StatCard label="AVT" value={formatAverageTicket(overview.totals.gaRevenue, overview.totals.purchases)} />
      </div>

      <StatSectionLabel>Cruce con VTEX (real)</StatSectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Conversión REAL (pedidos VTEX ÷ sesiones)"
          value={overview.realConversionPercent === null ? '—' : formatPercentage(overview.realConversionPercent)}
          highlight
        />
        <StatCard label="Pedidos VTEX contabilizados (mismo rango)" value={formatNumber(overview.revenueOrders)} />
      </div>
      <p className="-mt-3 text-xs text-ink-faint">
        ℹ &quot;Usuarios&quot; es la suma día por día del rango — no deduplicado (alguien que visita más de un día
        cuenta más de una vez). El &quot;AVT&quot; (ticket promedio) de esta tarjeta usa ingresos y compras SEGÚN GA —
        no el ticket real de VTEX, así que puede diferir del AVT que se muestra en el Dashboard. La
        &quot;Conversión REAL&quot; cruza sesiones de Analytics con pedidos contabilizados de VTEX de este mismo
        rango — es un adelanto del cruce completo que viene en la Fase B (con comparación de período y el ajuste de
        marketplaces externos para Pilatos).
      </p>

      <GaFunnelTable totals={overview.totals} funnelRates={overview.funnelRates} />
      <GaSessionsTrendChart dailySeries={overview.dailySeries} provisionalDays={overview.provisionalDays} />
      <GaNewVsReturningChart dailySeries={overview.dailySeries} />
      <GaBreakdownTable
        title="Nuevos vs. recurrentes (compras e ingresos)"
        rowLabel="Tipo de usuario"
        rows={userTypeRows}
        totalSessions={totalSessionsUserTypes}
      />

      <GaBreakdownTable title="Resultados por canal" rowLabel="Canal" rows={channelRows} totalSessions={totalSessionsChannels} />
      <GaBreakdownTable title="Resultados por dispositivo" rowLabel="Dispositivo" rows={deviceRows} totalSessions={totalSessionsDevices} />
      <GaBreakdownTable
        title="Páginas de entrada más visitadas"
        rowLabel="Página de entrada"
        rows={landingPageRows}
        totalSessions={totalSessionsLandingPages}
      />
      <p className="-mt-3 text-xs text-ink-faint">
        ℹ Se muestran hasta 20 páginas de entrada por día (las de más sesiones) — el resto del tráfico de ese día se
        agrupa en &quot;(otros)&quot;, para que la tabla no crezca sin control en tiendas con muchas URLs distintas.
      </p>

      <GaBreakdownTable title="Ciudades con más interacción" rowLabel="Ciudad" rows={cityRows} totalSessions={totalSessionsCities} />
      <p className="-mt-3 text-xs text-ink-faint">
        ℹ Mismo criterio que páginas de entrada: hasta 20 ciudades por día (las de más sesiones), el resto agrupado en
        &quot;(otros)&quot;. Esta es interacción en el sitio (sesiones), no ventas — para ciudades por VENTAS reales
        de VTEX, ver el Dashboard principal.
      </p>

      <GaProductsTable title="Productos más vistos" rows={mostViewedProducts} />
      <p className="-mt-3 text-xs text-ink-faint">
        ℹ Ordenado por vistas — un producto arriba con &quot;Vista → compra&quot; bajo es candidato a revisar
        stock, precio, tallas o ficha. Se muestran hasta 20 productos por día (los de más vistas), el resto
        agrupado en &quot;(otros)&quot;. El nombre enlaza a la ficha real del producto cuando ya se resolvió, o a
        una búsqueda en el sitio mientras tanto.
      </p>

      <GaCampaignsTable rows={campaignRows} totalSessions={totalSessionsCampaigns} />
      <p className="-mt-3 text-xs text-ink-faint">
        ℹ A diferencia de los demás desgloses, acá se muestran TODAS las campañas del rango (sin tope ni
        &quot;(otros)&quot;) — úsalo con el buscador para encontrar una promo puntual por nombre (ej.
        &quot;bazar&quot;, &quot;addi&quot;).
      </p>
    </>
  );
}

/** Vista "todas las tiendas": cuadrícula comparativa chica, sin el detalle completo (embudo/canales/dispositivos) que solo tiene sentido por tienda. */
function StoresComparisonGrid({ stores }: { stores: GaStoreOverview[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stores.map((store) => {
        const storeMeta = STORES.find((s) => s.id === store.storeId);
        const storeName = storeMeta?.name ?? store.storeId;
        return (
          <div
            key={store.storeId}
            className="rounded-2xl border border-surface-border bg-surface-panel p-4 shadow-panel"
            style={{ borderTopColor: storeMeta?.color, borderTopWidth: 3 }}
          >
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: storeMeta?.color }} />
              {storeName}
            </p>
            {store.coverage === 0 ? (
              <p className="text-xs text-ink-faint">Sin datos de Analytics sincronizados para este rango.</p>
            ) : (
              <div className="flex flex-col gap-1 text-xs text-ink-muted">
                <p>Sesiones: <span className="font-medium text-ink">{formatNumber(store.totals.sessions)}</span></p>
                <p>
                  Con interacción: <span className="font-medium text-ink">{formatNumber(store.totals.engagedSessions)}</span>
                </p>
                <p>Compras (GA): <span className="font-medium text-ink">{formatNumber(store.totals.purchases)}</span></p>
                <p>
                  AVT (GA):{' '}
                  <span className="font-medium text-ink">
                    {formatAverageTicket(store.totals.gaRevenue, store.totals.purchases)}
                  </span>
                </p>
                <p>
                  Tasa de rebote:{' '}
                  <span className="font-medium text-ink">
                    {store.totals.sessions > 0
                      ? formatPercentage((1 - store.totals.engagedSessions / store.totals.sessions) * 100)
                      : '—'}
                  </span>
                </p>
                <p>Pedidos VTEX: <span className="font-medium text-ink">{formatNumber(store.revenueOrders)}</span></p>
                <p>
                  Conversión real:{' '}
                  <span className="font-semibold text-accent">
                    {store.realConversionPercent === null ? '—' : formatPercentage(store.realConversionPercent)}
                  </span>
                </p>
                {store.coverage < 1 && (
                  <p className="text-accent">ℹ Cobertura parcial: {formatPercentage(store.coverage * 100)} de los días del rango.</p>
                )}
                {store.lastSyncedAt && <p className="text-ink-faint">Última sync: {formatDateTime(store.lastSyncedAt)}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SyncStatusBanner({ overview }: { overview: GaStoreOverview }) {
  if (overview.lastSyncStatus === 'error') {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
        ⚠ La última sincronización de Analytics para esta tienda falló — estos datos podrían no estar al día.
      </div>
    );
  }
  if (overview.coverage < 1) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-accent">
        ℹ Cobertura parcial: solo {formatPercentage(overview.coverage * 100)} de los días del rango tienen datos
        sincronizados de Analytics.
        {overview.lastSyncedAt && ` Última sincronización: ${formatDateTime(overview.lastSyncedAt)}.`}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-positive/30 bg-positive/10 px-4 py-3 text-xs text-positive">
      ✓ Rango completamente sincronizado.
      {overview.lastSyncedAt && ` Última sincronización: ${formatDateTime(overview.lastSyncedAt)}.`}
    </div>
  );
}

function StatSectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="-mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">{children}</p>;
}

function StatCard({ label, value, highlight, hint }: { label: string; value: string; highlight?: boolean; hint?: string }) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-panel ${
        highlight ? 'border-accent/40 bg-accent/10' : 'border-surface-border bg-surface-panel'
      }`}
    >
      <p className={`text-xs font-medium uppercase tracking-wide ${highlight ? 'text-accent' : 'text-ink-faint'}`}>{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${highlight ? 'text-accent' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
