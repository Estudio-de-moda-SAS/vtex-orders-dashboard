import { Controller, Get, HttpCode, NotFoundException, Param, Post, Query, ValidationPipe } from '@nestjs/common';

import { HistoricalSyncService } from '../../sync/services/historical-sync.service';
import { OrderCityEnrichmentService } from '../../sync/services/order-city-enrichment.service';
import { EnrichmentStatusQueryDto } from '../dto/enrichment-status-query.dto';

/**
 * GET /api/sync/jobs/:id
 *
 * Permite que el frontend consulte el progreso de un job de
 * sincronización en segundo plano (backfill histórico grande, o el
 * enriquecimiento de ciudad — ambos comparten la misma tabla `sync_jobs`),
 * para mostrar una barra de progreso y refrescar el dashboard cuando
 * termine.
 */
@Controller('api/sync')
export class SyncStatusController {
  constructor(
    private readonly historicalSyncService: HistoricalSyncService,
    private readonly orderCityEnrichmentService: OrderCityEnrichmentService,
  ) {}

  @Get('jobs/:id')
  getJobStatus(@Param('id') id: string) {
    const job = this.historicalSyncService.getJobStatus(id);
    if (!job) {
      throw new NotFoundException(`No existe un job de sincronización con id "${id}"`);
    }
    return job;
  }

  /**
   * POST /api/sync/enrich-cities
   *
   * Dispara manualmente el backfill retroactivo de ciudad sobre todas las
   * órdenes ya cacheadas que todavía no la tengan resuelta. Responde de
   * inmediato con el job (no espera a que termine) — se puede reutilizar
   * `GET /api/sync/jobs/:id` para consultar su progreso. Es un no-op si ya
   * hay uno corriendo, o si no hay nada pendiente.
   */
  @Post('enrich-cities')
  @HttpCode(202)
  enrichCities() {
    const job = this.orderCityEnrichmentService.triggerEnrichment();
    return job ?? { message: 'No hay órdenes pendientes de enriquecer con ciudad.' };
  }

  /**
   * GET /api/sync/enrichment-status?storeId=pilatos&startDate=...&endDate=...
   *
   * Estado actual del enriquecimiento (ciudad + descuento + categoría +
   * marca, todo se calcula en la misma pasada) para una tienda —
   * calculado al vuelo, no vía un job de `sync_jobs` (ver
   * `OrderCityEnrichmentService.getEnrichmentStatus` para el porqué).
   * `startDate`/`endDate` son opcionales: si se omiten, el % es sobre
   * todo el histórico cacheado de la tienda.
   */
  @Get('enrichment-status')
  getEnrichmentStatus(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: EnrichmentStatusQueryDto,
  ) {
    return this.orderCityEnrichmentService.getEnrichmentStatus(query.storeId, query.startDate, query.endDate);
  }
}
