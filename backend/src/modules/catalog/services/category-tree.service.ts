import { Injectable, Logger } from '@nestjs/common';

import { getStoresConfig } from '../../../config/stores.config';
import { ReferenceRepository } from '../../database/repositories/reference.repository';
import { VtexOrdersService } from '../../orders/services/vtex-orders.service';

/**
 * Refresca `category_reference` desde el árbol de categorías de VTEX.
 * Solo se usa para traducir el histórico de Excel (que trae categorías
 * como IDs puros) — el detalle de orden de la API ya trae el nombre
 * directamente. Se corre contra la primera tienda con credenciales
 * configuradas: el árbol de categorías es prácticamente el mismo catálogo
 * de moda para todas las cuentas de este grupo, y `category_reference` es
 * una tabla global (sin `store_id`), igual que la definió la migración.
 */
@Injectable()
export class CategoryTreeService {
  private readonly logger = new Logger(CategoryTreeService.name);

  constructor(
    private readonly vtexOrdersService: VtexOrdersService,
    private readonly referenceRepository: ReferenceRepository,
  ) {}

  async syncCategoryTree(): Promise<void> {
    const store = getStoresConfig().find((s) => s.appKey && s.appToken);
    if (!store) {
      this.logger.warn('Ninguna tienda tiene credenciales configuradas — no se puede refrescar category_reference.');
      return;
    }

    const categories = await this.vtexOrdersService.fetchCategoryTree(store);
    await this.referenceRepository.upsertCategories(
      categories.map((c) => ({ categoryId: c.id, categoryName: c.name })),
    );
    this.logger.log(`category_reference actualizada: ${categories.length} categorías (fuente: ${store.id}).`);
  }
}
