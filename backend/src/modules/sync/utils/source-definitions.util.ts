import { StoreConfig } from '../../../config/stores.config';
import { OrderSourceRef } from '../../storage/repositories/orders-cache.repository';
import { SourceDefinition } from '../interfaces/sync.types';

/**
 * Construye la lista de "fuentes" a sincronizar para una tienda: la
 * fuente principal (`main`) más, si aplica, un elemento por cada
 * vendedor (seller) y canal de marketplace configurado en
 * `store.extraSegments`. Se usa tanto en la consulta on-demand del
 * dashboard como en la sincronización automática nocturna, para que
 * ambas cubran exactamente las mismas fuentes.
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
