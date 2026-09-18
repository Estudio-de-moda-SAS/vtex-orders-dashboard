import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import configuration from '../config/configuration';
import { DatabaseModule } from '../modules/database/database.module';
import { CategoryTreeService } from '../modules/catalog/services/category-tree.service';
import { CollectionSyncService } from '../modules/catalog/services/collection-sync.service';
import { VtexModule } from '../modules/vtex/vtex.module';

/**
 * Script temporal de un solo uso: dispara el refresco de catálogo
 * (categorías + colecciones) de forma aislada, sin levantar todo
 * `AppModule` (que también correría el cron completo de VTEX vía
 * `SyncModule.onModuleInit`). A propósito NO importa `CatalogModule`
 * completo (que incluiría `CatalogCronService`, cuyo propio
 * `onModuleInit` dispararía el mismo trabajo en paralelo/duplicado) —
 * solo los dos servicios necesarios. Se borra después de usarse.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), VtexModule, DatabaseModule],
  providers: [CategoryTreeService, CollectionSyncService],
})
class CatalogOnlyModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CatalogOnlyModule);
  try {
    const collectionSync = app.get(CollectionSyncService);
    const categoryTree = app.get(CategoryTreeService);
    console.log('Sincronizando árbol de categorías...');
    await categoryTree.syncCategoryTree();
    console.log('Sincronizando colecciones de todas las tiendas...');
    await collectionSync.syncAllStores();
    console.log('Listo.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
