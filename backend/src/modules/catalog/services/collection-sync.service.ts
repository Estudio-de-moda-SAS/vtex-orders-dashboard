import { Injectable, Logger } from '@nestjs/common';

import { getStoresConfig, StoreConfig } from '../../../config/stores.config';
import { ReferenceRepository } from '../../database/repositories/reference.repository';
import { VtexOrdersService } from '../../orders/services/vtex-orders.service';

/**
 * Refresca `collection_reference` para una o todas las tiendas: por cada
 * colección configurada (`store.collections`, en el orden dado — línea,
 * rack, outlet, saldos), pagina `fetchCollectionProducts` hasta agotarla
 * y hace upsert. Si un SKU aparece en más de una colección, la ÚLTIMA
 * consultada en el orden de configuración sobrescribe a las anteriores
 * (llamadas secuenciales a `upsertCollections`, nunca en paralelo, para
 * que ese orden se respete).
 */
@Injectable()
export class CollectionSyncService {
  private readonly logger = new Logger(CollectionSyncService.name);

  constructor(
    private readonly vtexOrdersService: VtexOrdersService,
    private readonly referenceRepository: ReferenceRepository,
  ) {}

  async syncAllStores(): Promise<void> {
    for (const store of getStoresConfig()) {
      if (!store.appKey || !store.appToken) continue;
      await this.syncStore(store);
    }
  }

  async syncStore(store: StoreConfig): Promise<void> {
    if (!store.collections || store.collections.length === 0) return;

    for (const collection of store.collections) {
      try {
        const skuIds = await this.vtexOrdersService.fetchCollectionProducts(store, collection.collectionId);
        await this.referenceRepository.upsertCollections(
          skuIds.map((skuId) => ({ skuId, storeId: store.id, collectionName: collection.label })),
        );
        this.logger.log(`[${store.id}] Colección "${collection.label}" (${collection.collectionId}): ${skuIds.length} SKUs.`);
      } catch (error) {
        this.logger.error(
          `[${store.id}] No se pudo sincronizar la colección "${collection.label}" (${collection.collectionId}): ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
        );
      }
    }
  }
}
