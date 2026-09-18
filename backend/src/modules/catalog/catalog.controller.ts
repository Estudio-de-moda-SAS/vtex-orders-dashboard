import { Controller, HttpCode, Logger, Post } from '@nestjs/common';

import { CategoryTreeService } from './services/category-tree.service';
import { CollectionSyncService } from './services/collection-sync.service';

/**
 * Botón manual para refrescar catálogo (colecciones + árbol de
 * categorías) sin esperar al refresco automático diario — útil justo
 * después de crear/editar una colección en VTEX, o antes de correr la
 * importación histórica de Excel (que depende de `collection_reference`/
 * `category_reference` ya pobladas).
 */
@Controller('api/catalog')
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(
    private readonly collectionSyncService: CollectionSyncService,
    private readonly categoryTreeService: CategoryTreeService,
  ) {}

  /** POST /api/catalog/sync-collections — 202, fire-and-forget (igual patrón que el viejo `enrich-cities`). */
  @Post('sync-collections')
  @HttpCode(202)
  syncCollections() {
    // `.catch()` explícito: nadie más espera esta promesa — sin esto, un
    // error de red/DB acá sería una rejection no manejada que tumba todo
    // el proceso (mismo bug ya corregido en el cron de VTEX).
    this.collectionSyncService.syncAllStores().catch((error) => {
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`Falló la sincronización manual de colecciones: ${message}`);
    });
    return { message: 'Sincronización de colecciones iniciada en segundo plano.' };
  }

  /** POST /api/catalog/sync-categories — 202, fire-and-forget. */
  @Post('sync-categories')
  @HttpCode(202)
  syncCategories() {
    this.categoryTreeService.syncCategoryTree().catch((error) => {
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.error(`Falló la sincronización manual del árbol de categorías: ${message}`);
    });
    return { message: 'Sincronización del árbol de categorías iniciada en segundo plano.' };
  }
}
