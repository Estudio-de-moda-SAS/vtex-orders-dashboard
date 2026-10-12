import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface VtexProductSearchItem {
  link?: string;
  /** Referencia de PRODUCTO de VTEX (ej. "KI4485") — string simple, no confundir con `items[].referenceId` (array, a nivel de SKU/variante). */
  productReference?: string;
}

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Resuelve el link REAL de un producto contra la API PÚBLICA de catálogo de
 * VTEX (`/api/catalog_system/pub/products/search?fq=productId:X`, sin
 * autenticación) — usada SOLO por `GaSyncService` para poblar la caché
 * `ga_product_links` durante el sync, nunca en vivo cuando el dashboard
 * consulta.
 *
 * `fq=productId` y NO `fq=skuId`: confirmado en vivo contra las 6 tiendas
 * que el `itemId` que manda GA4 (`google-analytics/data`, dimensión
 * `itemId`) corresponde al `productId` de VTEX (el producto, no una
 * variante/SKU específica) — `fq=skuId:{itemId}` devolvía `[]` (vacío) para
 * TODOS los productos reales, aunque el ID en sí fuera válido como
 * `productId`.
 *
 * Mejor esfuerzo: un producto que no resuelve (descontinuado, error de red
 * puntual) simplemente no se cachea — `GaSyncService` sigue sin romper el
 * sync principal, y se reintenta en el siguiente sync.
 */
@Injectable()
export class VtexCatalogLinkService {
  private readonly logger = new Logger(VtexCatalogLinkService.name);

  constructor(private readonly httpService: HttpService) {}

  async resolveLink(storefrontDomain: string, itemId: string): Promise<{ productUrl: string; productReference: string | null } | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<VtexProductSearchItem[]>(`${storefrontDomain}/api/catalog_system/pub/products/search`, {
          params: { fq: `productId:${itemId}` },
          timeout: REQUEST_TIMEOUT_MS,
          headers: { Accept: 'application/json' },
        }),
      );
      const product = response.data?.[0];
      if (!product?.link) return null;

      return { productUrl: product.link, productReference: product.productReference ?? null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';
      this.logger.warn(`No se pudo resolver el link del producto ${itemId} en ${storefrontDomain}: ${message}`);
      return null;
    }
  }
}
