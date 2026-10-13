import { protos } from '@google-analytics/data';

import { enumerateDayBuckets, dayBucketStartIso, dayBucketEndIso } from '../../common/utils/date-range.util';
import {
  GaDailyByCampaignRow,
  GaDailyByChannelRow,
  GaDailyByCityRow,
  GaDailyByDeviceRow,
  GaDailyByLandingPageRow,
  GaDailyByProductRow,
  GaDailyByUserTypeRow,
  GaDailyRow,
} from '../database/repositories/ga-aggregates.repository';

/** Más allá de esto, el resto de páginas de entrada de un día/tienda se agrupan en `OTHER_LANDING_PAGE_LABEL` (ver `rowsToByLandingPage`). */
const MAX_LANDING_PAGES_PER_DAY = 20;
const OTHER_LANDING_PAGE_LABEL = '(otros)';
/** Mismo tope/criterio que `MAX_LANDING_PAGES_PER_DAY`, aplicado a ciudades (ver `rowsToByCity`). */
const MAX_CITIES_PER_DAY = 20;
const OTHER_CITY_LABEL = '(otros)';
/** Mismo tope/criterio, aplicado a productos (ver `rowsToByProduct`) — ordenado por `itemsViewed`, no por sesiones. */
const MAX_PRODUCTS_PER_DAY = 20;
const OTHER_PRODUCT_ID = '(otros)';

type GaRow = protos.google.analytics.data.v1beta.IRow;

/**
 * Convierte la dimensión `date` de GA4 (`YYYYMMDD`, en la zona horaria de
 * LA PROPIEDAD — ver README sobre verificar que esté en America/Bogota)
 * a `YYYY-MM-DD`, SIN aplicar ningún desplazamiento de zona horaria: si
 * la propiedad está bien configurada, el día calendario que reporta GA
 * ya es el mismo día calendario de Colombia que usa `sales_daily*`.
 */
export function parseGaDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) {
    throw new Error(`Fecha de GA4 con formato inesperado (se esperaba YYYYMMDD): "${yyyymmdd}"`);
  }
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function metricNumber(row: GaRow, index: number): number {
  const raw = row.metricValues?.[index]?.value;
  return raw ? Number(raw) : 0;
}

/**
 * GA4 no siempre manda `null`/`undefined` para un valor sin clasificar —
 * confirmado en producción: `newVsReturning` devolvió un string VACÍO
 * literal (`""`) en algunas filas, que `?? '(not set)'` no atrapa (solo
 * reemplaza `null`/`undefined`, nunca `""`). Se normaliza acá para que
 * ninguna fila llegue con una etiqueta en blanco.
 */
function dimensionValue(row: GaRow, index: number): string {
  const raw = row.dimensionValues?.[index]?.value;
  return raw && raw.length > 0 ? raw : '(not set)';
}

/**
 * Filas crudas del reporte A (dimensión `date`; métricas en este orden
 * exacto: sessions, totalUsers, newUsers, engagedSessions, itemViewEvents,
 * addToCarts, checkouts, ecommercePurchases, purchaseRevenue) → filas de
 * `ga_daily`. El orden de métricas lo decide `GaSyncService` al construir
 * el `RunReportRequest` — esta función asume que respeta ese orden.
 */
export function rowsToGaDaily(rows: GaRow[], storeId: string): GaDailyRow[] {
  return rows.map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    storeId,
    sessions: metricNumber(row, 0),
    totalUsers: metricNumber(row, 1),
    newUsers: metricNumber(row, 2),
    engagedSessions: metricNumber(row, 3),
    itemViews: metricNumber(row, 4),
    addToCarts: metricNumber(row, 5),
    checkouts: metricNumber(row, 6),
    purchases: metricNumber(row, 7),
    gaRevenue: metricNumber(row, 8),
  }));
}

/** Reporte B (dimensiones `date`, `sessionDefaultChannelGroup`; métricas `sessions`, `totalUsers`, `ecommercePurchases`, `purchaseRevenue`) → filas de `ga_daily_by_channel`. "(not set)" se conserva tal cual. */
export function rowsToByChannel(rows: GaRow[], storeId: string): GaDailyByChannelRow[] {
  return rows.map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    storeId,
    channelGroup: dimensionValue(row, 1),
    sessions: metricNumber(row, 0),
    totalUsers: metricNumber(row, 1),
    purchases: metricNumber(row, 2),
    gaRevenue: metricNumber(row, 3),
  }));
}

/** Reporte C (dimensiones `date`, `deviceCategory`; métricas `sessions`, `totalUsers`, `ecommercePurchases`, `purchaseRevenue`) → filas de `ga_daily_by_device`. */
export function rowsToByDevice(rows: GaRow[], storeId: string): GaDailyByDeviceRow[] {
  return rows.map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    storeId,
    deviceCategory: dimensionValue(row, 1),
    sessions: metricNumber(row, 0),
    totalUsers: metricNumber(row, 1),
    purchases: metricNumber(row, 2),
    gaRevenue: metricNumber(row, 3),
  }));
}

/** Reporte E (dimensiones `date`, `newVsReturning`; métricas `sessions`, `totalUsers`, `ecommercePurchases`, `purchaseRevenue`) → filas de `ga_daily_by_user_type`. Baja cardinalidad ("new"/"returning"/"(not set)") — sin tope ni agrupación en "(otros)", a diferencia de `rowsToByLandingPage`. */
export function rowsToByUserType(rows: GaRow[], storeId: string): GaDailyByUserTypeRow[] {
  return rows.map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    storeId,
    userType: dimensionValue(row, 1),
    sessions: metricNumber(row, 0),
    totalUsers: metricNumber(row, 1),
    purchases: metricNumber(row, 2),
    gaRevenue: metricNumber(row, 3),
  }));
}

/**
 * Reporte D (dimensiones `date`, `landingPage`; métricas `sessions`,
 * `totalUsers`, `ecommercePurchases`, `purchaseRevenue`) → filas de
 * `ga_daily_by_landing_page`. A diferencia de canal/dispositivo (un
 * puñado de valores fijos), una tienda puede tener cientos de landing
 * pages distintas — para no disparar el número de filas (y el riesgo de
 * memoria del sync), por cada día se conservan solo las
 * `MAX_LANDING_PAGES_PER_DAY` con más sesiones y el resto se suma en una
 * sola fila `(otros)`.
 */
export function rowsToByLandingPage(rows: GaRow[], storeId: string): GaDailyByLandingPageRow[] {
  const allRows: GaDailyByLandingPageRow[] = rows.map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    storeId,
    landingPage: dimensionValue(row, 1),
    sessions: metricNumber(row, 0),
    totalUsers: metricNumber(row, 1),
    purchases: metricNumber(row, 2),
    gaRevenue: metricNumber(row, 3),
  }));

  const byDate = new Map<string, GaDailyByLandingPageRow[]>();
  for (const row of allRows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  const result: GaDailyByLandingPageRow[] = [];
  for (const [date, dayRows] of byDate) {
    const sorted = [...dayRows].sort((a, b) => b.sessions - a.sessions);
    const top = sorted.slice(0, MAX_LANDING_PAGES_PER_DAY);
    const rest = sorted.slice(MAX_LANDING_PAGES_PER_DAY);
    result.push(...top);
    if (rest.length > 0) {
      result.push({
        date,
        storeId,
        landingPage: OTHER_LANDING_PAGE_LABEL,
        sessions: rest.reduce((sum, r) => sum + r.sessions, 0),
        totalUsers: rest.reduce((sum, r) => sum + r.totalUsers, 0),
        purchases: rest.reduce((sum, r) => sum + r.purchases, 0),
        gaRevenue: rest.reduce((sum, r) => sum + r.gaRevenue, 0),
      });
    }
  }
  return result;
}

/**
 * Reporte F (dimensiones `date`, `city`; métricas `sessions`, `totalUsers`,
 * `ecommercePurchases`, `purchaseRevenue`) → filas de `ga_daily_by_city`.
 * Mismo problema de cardinalidad que landing pages (una tienda puede
 * vender/recibir tráfico de cientos de ciudades) y misma solución: Top 20
 * por día/tienda, el resto se suma en una fila `(otros)`.
 */
export function rowsToByCity(rows: GaRow[], storeId: string): GaDailyByCityRow[] {
  const allRows: GaDailyByCityRow[] = rows.map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    storeId,
    city: dimensionValue(row, 1),
    sessions: metricNumber(row, 0),
    totalUsers: metricNumber(row, 1),
    purchases: metricNumber(row, 2),
    gaRevenue: metricNumber(row, 3),
  }));

  const byDate = new Map<string, GaDailyByCityRow[]>();
  for (const row of allRows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  const result: GaDailyByCityRow[] = [];
  for (const [date, dayRows] of byDate) {
    const sorted = [...dayRows].sort((a, b) => b.sessions - a.sessions);
    const top = sorted.slice(0, MAX_CITIES_PER_DAY);
    const rest = sorted.slice(MAX_CITIES_PER_DAY);
    result.push(...top);
    if (rest.length > 0) {
      result.push({
        date,
        storeId,
        city: OTHER_CITY_LABEL,
        sessions: rest.reduce((sum, r) => sum + r.sessions, 0),
        totalUsers: rest.reduce((sum, r) => sum + r.totalUsers, 0),
        purchases: rest.reduce((sum, r) => sum + r.purchases, 0),
        gaRevenue: rest.reduce((sum, r) => sum + r.gaRevenue, 0),
      });
    }
  }
  return result;
}

/**
 * Reporte G (dimensiones `date`, `itemId`, `itemName`, `itemCategory`;
 * métricas `itemsViewed`, `itemsAddedToCart`, `itemsPurchased`,
 * `itemRevenue`) → filas de `ga_daily_by_product`. A diferencia de los
 * demás desgloses, estas métricas son de ÍTEM (vistas/compras DE ESE
 * producto), no de sesión — un producto no tiene "sesiones" propias.
 * Mismo problema de cardinalidad que landing pages/ciudades (una tienda
 * puede tener cientos de SKUs): Top 20 por día/tienda por `itemsViewed`,
 * el resto se agrupa en una fila `itemId: '(otros)'`.
 *
 * GA4 puede devolver MÁS DE UNA fila para el mismo `(date, itemId)` si
 * `itemName`/`itemCategory` varió entre eventos de ese día (confirmado en
 * producción: violaba la llave única `(date, store_id, item_id)` al
 * insertar) — se fusionan ANTES de aplicar el Top 20, sumando sus
 * métricas y quedándose con el `itemName`/`itemCategory` de la variante
 * con más vistas.
 */
export function rowsToByProduct(rows: GaRow[], storeId: string): GaDailyByProductRow[] {
  const rawRows: GaDailyByProductRow[] = rows.map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    storeId,
    itemId: dimensionValue(row, 1),
    itemName: dimensionValue(row, 2),
    itemCategory: dimensionValue(row, 3),
    itemsViewed: metricNumber(row, 0),
    itemsAddedToCart: metricNumber(row, 1),
    itemsPurchased: metricNumber(row, 2),
    itemRevenue: metricNumber(row, 3),
  }));

  const byDateAndItem = new Map<string, GaDailyByProductRow>();
  for (const row of rawRows) {
    const key = `${row.date}::${row.itemId}`;
    const existing = byDateAndItem.get(key);
    if (!existing) {
      byDateAndItem.set(key, { ...row });
      continue;
    }
    byDateAndItem.set(key, {
      ...existing,
      itemName: row.itemsViewed > existing.itemsViewed ? row.itemName : existing.itemName,
      itemCategory: row.itemsViewed > existing.itemsViewed ? row.itemCategory : existing.itemCategory,
      itemsViewed: existing.itemsViewed + row.itemsViewed,
      itemsAddedToCart: existing.itemsAddedToCart + row.itemsAddedToCart,
      itemsPurchased: existing.itemsPurchased + row.itemsPurchased,
      itemRevenue: existing.itemRevenue + row.itemRevenue,
    });
  }
  const allRows = Array.from(byDateAndItem.values());

  const byDate = new Map<string, GaDailyByProductRow[]>();
  for (const row of allRows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  const result: GaDailyByProductRow[] = [];
  for (const [date, dayRows] of byDate) {
    const sorted = [...dayRows].sort((a, b) => b.itemsViewed - a.itemsViewed);
    const top = sorted.slice(0, MAX_PRODUCTS_PER_DAY);
    const rest = sorted.slice(MAX_PRODUCTS_PER_DAY);
    result.push(...top);
    if (rest.length > 0) {
      result.push({
        date,
        storeId,
        itemId: OTHER_PRODUCT_ID,
        itemName: OTHER_PRODUCT_ID,
        itemCategory: OTHER_PRODUCT_ID,
        itemsViewed: rest.reduce((sum, r) => sum + r.itemsViewed, 0),
        itemsAddedToCart: rest.reduce((sum, r) => sum + r.itemsAddedToCart, 0),
        itemsPurchased: rest.reduce((sum, r) => sum + r.itemsPurchased, 0),
        itemRevenue: rest.reduce((sum, r) => sum + r.itemRevenue, 0),
      });
    }
  }
  return result;
}

/**
 * Reporte H (dimensiones `date`, `sessionCampaignName`, `sessionSourceMedium`;
 * métricas de EMBUDO `sessions`, `addToCarts`, `checkouts`, `ecommercePurchases`,
 * `purchaseRevenue`) → filas de `ga_daily_by_campaign`. A diferencia de
 * landing pages/ciudades/productos, NO hay tope Top 20 ni agrupación
 * "(otros)": las campañas son deliberadas (alguien las crea por cada
 * promo/envío con UTM), de cardinalidad acotada, y hay que poder buscar
 * cualquiera por nombre más adelante — fundirlas en "(otros)" rompería esa
 * búsqueda. GA4 agrupa server-side por la combinación exacta de las 3
 * dimensiones, así que no debería haber duplicados de `(date, campaignName,
 * sourceMedium)` — se fusionan de todas formas por seguridad, mismo
 * criterio defensivo que `rowsToByProduct`.
 */
export function rowsToByCampaign(rows: GaRow[], storeId: string): GaDailyByCampaignRow[] {
  const rawRows: GaDailyByCampaignRow[] = rows.map((row) => ({
    date: parseGaDate(dimensionValue(row, 0)),
    storeId,
    campaignName: dimensionValue(row, 1),
    sourceMedium: dimensionValue(row, 2),
    sessions: metricNumber(row, 0),
    addToCarts: metricNumber(row, 1),
    checkouts: metricNumber(row, 2),
    purchases: metricNumber(row, 3),
    gaRevenue: metricNumber(row, 4),
  }));

  const byKey = new Map<string, GaDailyByCampaignRow>();
  for (const row of rawRows) {
    const key = `${row.date}::${row.campaignName}::${row.sourceMedium}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }
    byKey.set(key, {
      ...existing,
      sessions: existing.sessions + row.sessions,
      addToCarts: existing.addToCarts + row.addToCarts,
      checkouts: existing.checkouts + row.checkouts,
      purchases: existing.purchases + row.purchases,
      gaRevenue: existing.gaRevenue + row.gaRevenue,
    });
  }
  return Array.from(byKey.values());
}

/**
 * Regla de ausencia del encargo: GA4 no devuelve fila para un día sin
 * ningún evento — dentro de la ventana sincronizada, hay que insertar
 * explícitamente una fila en CERO para cada fecha sin datos, para que
 * "no hay fila en `ga_daily`" siga significando siempre "no sincronizado"
 * (nunca "sincronizado pero sin tráfico"). Se usa `enumerateDayBuckets`
 * (mismo helper de días-Colombia que el resto de la app) para enumerar
 * TODOS los días del rango, sin importar si GA trajo filas para ellos.
 */
export function fillMissingDays(startDay: string, endDay: string, storeId: string, existingDays: GaDailyRow[]): GaDailyRow[] {
  const existingByDate = new Map(existingDays.map((row) => [row.date, row]));
  const allDays = enumerateDayBuckets(dayBucketStartIso(startDay), dayBucketEndIso(endDay));

  return allDays.map(
    (date) =>
      existingByDate.get(date) ?? {
        date,
        storeId,
        sessions: 0,
        totalUsers: 0,
        newUsers: 0,
        engagedSessions: 0,
        itemViews: 0,
        addToCarts: 0,
        checkouts: 0,
        purchases: 0,
        gaRevenue: 0,
      },
  );
}
