import { normalizeCityName } from '../../common/utils/city-normalize.util';
import { EnrichedOrder, EnrichedOrderItem } from '../../common/aggregation/types';
import { computeDiscountPercentage } from '../../common/utils/discount.util';
import { toDayBucketColombia } from '../../common/utils/date-range.util';
import { matchRevenueStatusDefinition } from '../../common/utils/revenue-status.util';
import { getRevenueStatusDefinitions } from '../../config/revenue-status.config';
import { StoreConfig } from '../../config/stores.config';
import { SafeRow } from './row-picker';

const REVENUE_STATUS_DEFINITIONS = getRevenueStatusDefinitions();

const UNKNOWN_CATEGORY = 'Sin categoría';
const UNKNOWN_BRAND = 'Sin marca';
const UNKNOWN_COLLECTION = 'Sin colección';
const UNKNOWN_CITY = 'Sin ciudad';

/**
 * Tablas de referencia precargadas EN MEMORIA (una sola consulta al
 * arranque del importador, ver `import-historical-orders.ts`) — un
 * archivo histórico puede traer decenas de miles de líneas de producto;
 * una consulta de red por línea (3 por ítem: categoría/marca/colección)
 * lo hacía impracticablemente lento.
 */
export interface ReferenceLookups {
  categoriesById: Map<number, string>;
  brandsBySkuId: Map<string, string>;
  /** Clave `sku_id::store_id`, igual que `ReferenceRepository.getAllCollections`. */
  collectionsBySkuAndStore: Map<string, string>;
}

export class HostMismatchError extends Error {
  constructor(expected: string, found: string) {
    super(`Host esperado "${expected}" pero la fila trae "${found}"`);
  }
}

/** Todas las filas (`SafeRow`, ya sin columnas sensibles) que pertenecen a UNA orden. */
export type OrderRowGroup = SafeRow[];

/**
 * Agrupa filas ya "limpiadas" (`pickSafeRow`) por `Order` — una orden con
 * varios productos genera varias filas idénticas en los campos de orden,
 * distintas solo en los de SKU. Valida `Host` contra el `accountName`
 * esperado en CADA fila; ante el primer mismatch lanza `HostMismatchError`
 * (el llamador debe abortar TODO el archivo, no solo esa fila — nunca
 * mezclar datos de cuentas distintas silenciosamente).
 */
export function groupRowsByOrder(rows: SafeRow[], store: StoreConfig): Map<string, OrderRowGroup> {
  const groups = new Map<string, OrderRowGroup>();

  for (const row of rows) {
    const orderId = String(row.Order ?? '').trim();
    // Filas sin `Order` no son una línea de producto real (ej. una fila
    // basura producida por un registro CSV mal formado) — se ignoran
    // ANTES de validar `Host`, para no abortar el archivo entero por una
    // fila que de todas formas no aportaría ningún dato.
    if (!orderId) continue;

    const host = String(row.Host ?? '').trim().toLowerCase();
    const expected = store.accountName.toLowerCase();
    if (!host.includes(expected)) {
      throw new HostMismatchError(store.accountName, host || '(vacío)');
    }

    const group = groups.get(orderId) ?? [];
    group.push(row);
    groups.set(orderId, group);
  }

  return groups;
}

/**
 * Convierte un grupo de filas de UNA orden en un `EnrichedOrder` listo
 * para `aggregateDailyRows` — mismo mapeo de columnas que la Parte 5 del
 * plan de migración. Cada fila del Excel se trata como UNA unidad
 * (quantity = 1): la especificación no trae una columna de cantidad, así
 * que varias filas con el mismo `ID_SKU` dentro de una orden representan
 * varias unidades de ese SKU — sumarlas queda resuelto naturalmente por
 * `aggregateDailyRows` (que ya suma `quantity` sobre TODOS los ítems de
 * la orden), sin necesitar fusionarlas de antemano.
 */
export function buildEnrichedOrder(
  orderId: string,
  rows: OrderRowGroup,
  store: StoreConfig,
  lookups: ReferenceLookups,
): EnrichedOrder {
  const first = rows[0];

  const status = resolveStatus(first);
  const totalValue = Number(first['Total Value'] ?? 0);
  const paymentNames = first['Payment System Name'] ? String(first['Payment System Name']) : null;
  const city = normalizeCityName(first.City ? String(first.City) : null) ?? UNKNOWN_CITY;

  const creationDateRaw = String(first['Creation Date'] ?? '').trim();
  const isoDate = new Date(creationDateRaw.replace(' ', 'T')).toISOString();
  const dayBucket = toDayBucketColombia(isoDate);

  const discountCampaignNames = String(first['Discounts Names'] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  const sellerLabel = resolveConfiguredLabel(
    first['Seller Name'] ? String(first['Seller Name']) : null,
    store.extraSegments?.sellers?.map((s) => ({ match: s.sellerName, label: s.label })) ?? [],
  );
  const marketplaceLabel = resolveConfiguredLabel(
    first.SalesChannel ? String(first.SalesChannel) : null,
    store.extraSegments?.marketplaces?.map((m) => ({ match: m.salesChannelId, label: m.label })) ?? [],
  );

  const items: EnrichedOrderItem[] = rows.map((row) => buildItem(row, store, lookups));

  return {
    orderId,
    storeId: store.id,
    dayBucket,
    status,
    statusDescription: null,
    totalValue,
    paymentNames,
    city,
    items,
    discountCampaignNames,
    sellerLabel,
    marketplaceLabel,
    // El Excel histórico nunca trajo `utmiCampaign` (campo agregado
    // después) — sin histórico a propósito, ver `EnrichedOrder.utmiCampaign`.
    utmiCampaign: null,
  };
}

/**
 * `Status raw value (temporary)` es la fuente PRINCIPAL — `Status`
 * (texto en español, ej. "Facturado") es el respaldo si la primera viene
 * vacía. PERO el valor de la columna "raw" tampoco es confiablemente un
 * código en inglés: al menos un archivo real (Kipling) trae ahí
 * directamente el texto en español ("Facturado", "Preparando"), no
 * "invoiced" — la cuenta VTEX de esa tienda simplemente reporta sus
 * status así.
 *
 * Por eso, sin importar de cuál columna salga el valor, SIEMPRE se
 * intenta resolver el código canónico en inglés con el MISMO matcher que
 * usa la clasificación de revenue (`revenue-status.util.ts`, que ya
 * compara tanto por código exacto como por texto de descripción). Sin
 * esto, una orden "Facturado" nunca matchearía `statusMatchers:
 * ['invoiced']` en `sales_daily_by_status` (que solo guarda el código,
 * sin `statusDescription` aparte), y quedaría fuera de
 * `revenueOrders`/`revenueTotalValue` aunque en la práctica SÍ esté
 * facturada. Si no hay match (ej. "Preparando", sin equivalente
 * conocido), se conserva el valor original tal cual, solo para mostrar
 * en el desglose de estados — no afecta la clasificación de revenue de
 * todas formas.
 */
function resolveStatus(row: SafeRow): string {
  const rawStatus = String(row['Status raw value (temporary)'] ?? '').trim();
  const spanishStatus = String(row.Status ?? '').trim();
  const primary = rawStatus || spanishStatus;
  if (!primary) return 'unknown';

  // Se prueba CADA columna por separado (como código exacto Y como
  // texto de descripción) — no alcanza con probar una combinación fija,
  // porque cualquiera de las dos puede traer el texto que sí matchea
  // (ej. `rawStatus` = "Checking invoice" en inglés mientras `Status`
  // trae otra cosa sin relación).
  const definition =
    matchRevenueStatusDefinition({ status: rawStatus, statusDescription: rawStatus }, REVENUE_STATUS_DEFINITIONS) ??
    matchRevenueStatusDefinition({ status: spanishStatus, statusDescription: spanishStatus }, REVENUE_STATUS_DEFINITIONS);

  return definition?.statusMatchers[0] ?? primary;
}

function buildItem(row: SafeRow, store: StoreConfig, lookups: ReferenceLookups): EnrichedOrderItem {
  const skuId = String(row.ID_SKU ?? '').trim();
  const listPrice = Number(row['SKU Value'] ?? 0);
  const sellingPrice = Number(row['SKU Selling Price'] ?? 0);

  const categoryId = deepestCategoryId(row['Category Ids Sku'] ? String(row['Category Ids Sku']) : '');
  const category = (categoryId !== null ? lookups.categoriesById.get(categoryId) : undefined) ?? UNKNOWN_CATEGORY;
  const brand = (skuId ? lookups.brandsBySkuId.get(skuId) : undefined) ?? UNKNOWN_BRAND;
  const collectionName =
    (skuId ? lookups.collectionsBySkuAndStore.get(`${skuId}::${store.id}`) : undefined) ?? UNKNOWN_COLLECTION;

  return {
    skuId,
    ean: '',
    category,
    brand,
    collectionName,
    quantity: 1,
    listPrice,
    sellingPrice,
    discountPercentage: computeDiscountPercentage(listPrice, sellingPrice),
  };
}

/** Ej. "/2/36/37/" → 37 (el ID más profundo/específico de la ruta). `null` si la ruta viene vacía. */
function deepestCategoryId(categoryPath: string): number | null {
  const segments = categoryPath.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const last = Number(segments[segments.length - 1]);
  return Number.isFinite(last) ? last : null;
}

function resolveConfiguredLabel(value: string | null, options: { match: string; label: string }[]): string | null {
  if (!value || options.length === 0) return null;
  const normalized = value.trim().toLowerCase();
  const found = options.find((o) => o.match.trim().toLowerCase() === normalized);
  return found?.label ?? null;
}
