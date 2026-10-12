import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'util';

import configuration from '../config/configuration';
import { getStoresConfig } from '../config/stores.config';
import { AnalyticsGaModule } from '../modules/analytics-ga/analytics-ga.module';
import { VtexCatalogLinkService } from '../modules/analytics-ga/vtex-catalog-link.service';
import { GaAggregatesRepository } from '../modules/database/repositories/ga-aggregates.repository';
import { GaProductLink, GaProductLinksRepository } from '../modules/database/repositories/ga-product-links.repository';

/**
 * Resuelve de una sola vez la caché `ga_product_links` para TODO lo que ya
 * está sincronizado en `ga_daily_by_product` — a diferencia del sync normal
 * (que resuelve de a poco, máx. 50 SKUs nuevos por llamada, ver
 * `GaSyncService.resolveMissingProductLinks`), este CLI no toca GA4 para
 * nada: solo lee los `item_id` distintos ya guardados y los resuelve contra
 * la API pública de catálogo de VTEX. Útil para ponerse al día después de
 * un backfill histórico grande, sin esperar a que el sync normal los vaya
 * resolviendo de a 50.
 *
 * Uso:
 *   npm run ga:product-links
 *   npm run ga:product-links -- --store=pilatos
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), AnalyticsGaModule],
})
class GaProductLinksBackfillModule {}

async function main(): Promise<void> {
  process.env.SKIP_AUTO_SYNC = 'true';

  const { values } = parseArgs({ options: { store: { type: 'string' } } });

  const stores = getStoresConfig().filter((store) => store.storefrontDomain && (!values.store || store.id === values.store));
  if (stores.length === 0) {
    console.error('Ninguna tienda coincide (revisa --store y que tenga `storefrontDomain` configurado).');
    process.exitCode = 1;
    return;
  }

  console.log(`Resolviendo links de producto para: ${stores.map((s) => s.id).join(', ')}`);

  const app = await NestFactory.createApplicationContext(GaProductLinksBackfillModule);
  try {
    const gaAggregatesRepository = app.get(GaAggregatesRepository);
    const gaProductLinksRepository = app.get(GaProductLinksRepository);
    const vtexCatalogLinkService = app.get(VtexCatalogLinkService);

    for (const store of stores) {
      const allItemIds = await gaAggregatesRepository.getDistinctProductIds(store.id);
      const existing = await gaProductLinksRepository.getExistingItemIds(store.id, allItemIds);
      const missing = allItemIds.filter((id) => !existing.has(id));

      console.log(`[${store.id}] ${allItemIds.length} SKU(s) distintos, ${missing.length} sin resolver todavía.`);

      const resolved: GaProductLink[] = [];
      let failed = 0;
      for (const itemId of missing) {
        const link = await vtexCatalogLinkService.resolveLink(store.storefrontDomain as string, itemId);
        if (link) {
          resolved.push({ itemId, productUrl: link.productUrl, productReference: link.productReference });
        } else {
          failed += 1;
        }
      }

      if (resolved.length > 0) {
        await gaProductLinksRepository.upsertMany(store.id, resolved);
      }
      console.log(`[${store.id}] Resueltos ${resolved.length}/${missing.length} (${failed} no encontrados/fallaron).`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Error resolviendo links de producto:', error);
  process.exitCode = 1;
});
