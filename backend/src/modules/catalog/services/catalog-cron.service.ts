import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { CategoryTreeService } from './category-tree.service';
import { CollectionSyncService } from './collection-sync.service';

/**
 * Refresco automático de catálogo: colecciones (diario, pueden cambiar
 * SKUs de un día a otro) y árbol de categorías (una vez al arrancar —
 * cambia con muy poca frecuencia, no hace falta un cron dedicado). El
 * botón manual en `CatalogController` cubre el caso de querer refrescar
 * antes de esas ventanas.
 */
@Injectable()
export class CatalogCronService implements OnModuleInit {
  private readonly logger = new Logger(CatalogCronService.name);

  constructor(
    private readonly collectionSyncService: CollectionSyncService,
    private readonly categoryTreeService: CategoryTreeService,
  ) {}

  onModuleInit(): void {
    void this.categoryTreeService.syncCategoryTree().catch((error) =>
      this.logger.error(`Falló el refresco inicial de category_reference: ${this.describe(error)}`),
    );
    void this.collectionSyncService.syncAllStores().catch((error) =>
      this.logger.error(`Falló el refresco inicial de collection_reference: ${this.describe(error)}`),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async dailyCollectionSync(): Promise<void> {
    try {
      await this.collectionSyncService.syncAllStores();
    } catch (error) {
      this.logger.error(`Falló el refresco diario de colecciones: ${this.describe(error)}`);
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
