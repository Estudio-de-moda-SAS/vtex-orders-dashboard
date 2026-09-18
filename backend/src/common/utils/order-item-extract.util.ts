import { VtexOrderDetailResponse, VtexOrderDetailItem } from '../../modules/orders/interfaces/vtex-order.interface';
import { normalizeCityName } from './city-normalize.util';
import { computeDiscountPercentage } from './discount.util';

const UNKNOWN_CATEGORY = 'Sin categoría';
const UNKNOWN_BRAND = 'Sin marca';
export const UNKNOWN_CITY = 'Sin ciudad';

/**
 * Un ítem extraído del detalle de una orden, ya con precios normalizados
 * y descuento calculado — TODAVÍA sin `collectionName` (eso requiere
 * consultar `collection_reference` en la base de datos, ver
 * `reference.repository.ts`; este archivo es deliberadamente
 * framework-free, sin dependencias de VTEX runtime ni de Postgres, solo
 * conoce la FORMA de la respuesta de VTEX).
 */
export interface ExtractedOrderItem {
  skuId: string;
  ean: string;
  productName: string;
  category: string;
  brand: string;
  quantity: number;
  listPrice: number;
  sellingPrice: number;
  discountPercentage: number;
}

export interface ExtractedOrderDetail {
  /** Ya resuelta, nunca vacía — "Sin ciudad" si VTEX no reportó ciudad de envío. */
  city: string;
  items: ExtractedOrderItem[];
  /** Nombres de campaña de descuento a nivel de orden completa (puede venir vacío). */
  discountCampaignNames: string[];
}

/**
 * Extrae de UN detalle de orden de VTEX todo lo que necesita el agregador
 * diario: ciudad, ítems (categoría/marca/descuento) y campañas de
 * descuento. Adaptado de la vieja `OrderCityEnrichmentService.enrichOrder`/
 * `toStorableItem`. El resto de la respuesta — `clientProfileData`, el
 * resto de `shippingData.address` — se descarta de inmediato: nunca se
 * lee ni se retiene más allá de esta función.
 *
 * La clasificación de seller/marketplace NO pasa por aquí: se resuelve
 * en el cron (`vtex-sync-cron.service.ts`) según CUÁL consulta de listado
 * filtrada (`f_sellerNames`/`salesChannelId`) devolvió la orden — ver
 * `source-definitions.util.ts`.
 */
export function extractOrderDetail(detail: VtexOrderDetailResponse): ExtractedOrderDetail {
  const city = normalizeCityName(detail.shippingData?.address?.city) ?? UNKNOWN_CITY;
  const items = mergeDuplicateItems((detail.items ?? []).map(toExtractedItem));
  const discountCampaignNames = (detail.ratesAndBenefitsData?.rateAndBenefitsIdentifiers ?? [])
    .map((identifier) => identifier.name?.trim())
    .filter((name): name is string => Boolean(name));

  return { city, items, discountCampaignNames };
}

function toExtractedItem(item: VtexOrderDetailItem): ExtractedOrderItem {
  const listPrice = item.price ?? 0;
  const sellingPrice = item.sellingPrice ?? 0;
  const category = item.additionalInfo?.categories?.[0]?.name?.trim() || UNKNOWN_CATEGORY;
  const brand = item.additionalInfo?.brandName?.trim() || UNKNOWN_BRAND;

  return {
    ean: item.ean?.trim() ?? '',
    skuId: item.id?.trim() ?? '',
    productName: item.name ?? '',
    category,
    brand,
    quantity: item.quantity ?? 1,
    listPrice,
    sellingPrice,
    discountPercentage: computeDiscountPercentage(listPrice, sellingPrice),
  };
}

/**
 * VTEX puede reportar el MISMO producto (mismo `ean`+`skuId`) en más de
 * una línea dentro de `items[]` de una misma orden (ej. productos sin
 * EAN/SKU real, donde varias líneas caen en la misma key vacía). Se
 * combinan sumando cantidad y valor, recalculando un precio/descuento
 * PROMEDIO PONDERADO por esa cantidad — mismo criterio que la vieja
 * `OrderCityEnrichmentService.mergeDuplicateItems`.
 */
function mergeDuplicateItems(items: ExtractedOrderItem[]): ExtractedOrderItem[] {
  interface Accumulator extends ExtractedOrderItem {
    totalListValue: number;
    totalSellingValue: number;
  }
  const merged = new Map<string, Accumulator>();

  for (const item of items) {
    const key = `${item.ean}::${item.skuId}`;
    const listValue = item.listPrice * item.quantity;
    const sellingValue = item.sellingPrice * item.quantity;

    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...item, totalListValue: listValue, totalSellingValue: sellingValue });
      continue;
    }
    current.quantity += item.quantity;
    current.totalListValue += listValue;
    current.totalSellingValue += sellingValue;
  }

  return Array.from(merged.values()).map((entry) => {
    const listPrice = entry.quantity > 0 ? entry.totalListValue / entry.quantity : entry.listPrice;
    const sellingPrice = entry.quantity > 0 ? entry.totalSellingValue / entry.quantity : entry.sellingPrice;
    return {
      ean: entry.ean,
      skuId: entry.skuId,
      productName: entry.productName,
      category: entry.category,
      brand: entry.brand,
      quantity: entry.quantity,
      listPrice,
      sellingPrice,
      discountPercentage: computeDiscountPercentage(listPrice, sellingPrice),
    };
  });
}
