import { StoreConfig } from '../../../config/stores.config';

/** Identifica de forma única una fuente de órdenes dentro de una tienda: la general ("main") o un segmento (seller/marketplace). */
export interface OrderSourceRef {
  storeId: string;
  sourceType: 'main' | 'seller' | 'marketplace';
  sourceKey: string;
}

export interface SourceDefinition {
  ref: OrderSourceRef;
  /** Parámetros adicionales de VTEX a incluir en el listado (ej. `{ salesChannelId: '25' }` o `{ f_sellerNames: 'Disandina S.A.S' }`). */
  extraParams?: Record<string, string>;
  label: string;
}

/**
 * Construye la lista de "fuentes" a sincronizar para una tienda: la
 * fuente principal (`main`) más, si aplica, un elemento por cada
 * vendedor (seller) y canal de marketplace configurado en
 * `store.extraSegments`. Mismo mecanismo para ambos: una consulta de
 * LISTADO adicional filtrada (`f_sellerNames`/`salesChannelId`) — las
 * órdenes que esa consulta devuelve SON las de ese segmento, sin
 * necesitar inspeccionar ningún campo del detalle para clasificarlas.
 */
export function buildSourceDefinitions(store: StoreConfig): SourceDefinition[] {
  const mainRef: OrderSourceRef = { storeId: store.id, sourceType: 'main', sourceKey: '' };
  const sources: SourceDefinition[] = [{ ref: mainRef, label: store.name }];

  const extra = store.extraSegments;
  if (extra) {
    for (const seller of extra.sellers ?? []) {
      sources.push({
        ref: { storeId: store.id, sourceType: 'seller', sourceKey: seller.sellerName },
        extraParams: { f_sellerNames: seller.sellerName },
        label: `${store.name} · ${seller.label}`,
      });
    }
    for (const marketplace of extra.marketplaces ?? []) {
      sources.push({
        ref: { storeId: store.id, sourceType: 'marketplace', sourceKey: marketplace.salesChannelId },
        extraParams: { salesChannelId: marketplace.salesChannelId },
        label: `${store.name} · ${marketplace.label}`,
      });
    }
  }

  return sources;
}
