import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';

import { getStoresConfig, StoreConfig } from '../../../config/stores.config';
import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { normalizeEndDate, normalizeStartDate } from '../../../common/utils/date-range.util';
import { HistoricalSyncService } from '../../sync/services/historical-sync.service';
import { buildSourceDefinitions } from '../../sync/utils/source-definitions.util';
import {
  DashboardResponse,
  RevenueStatusBreakdown,
  SegmentDashboardResult,
  StoreDashboardResult,
} from '../interfaces/dashboard.interface';
import { VtexOrder } from '../interfaces/vtex-order.interface';
import { OrdersAnalyticsService } from './orders-analytics.service';

/**
 * Orquesta la consulta del dashboard: para el rango de fechas dado,
 * consulta todas las tiendas configuradas (con concurrencia controlada),
 * transforma sus órdenes en indicadores y ensambla la respuesta final.
 * Un fallo en una tienda (o en un segmento de vendedor/marketplace) nunca
 * interrumpe a las demás.
 *
 * A diferencia de versiones anteriores, este servicio YA NO le pide
 * directamente a VTEX las órdenes: delega en `HistoricalSyncService`, que
 * decide qué se puede leer del caché histórico local (SQLite), qué se
 * consulta en vivo (la ventana "todavía mutable") y qué requiere un
 * backfill en segundo plano (ver ese servicio para el diseño completo).
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly storeConcurrency: number;

  constructor(
    private readonly historicalSyncService: HistoricalSyncService,
    private readonly analyticsService: OrdersAnalyticsService,
    private readonly configService: ConfigService,
  ) {
    this.storeConcurrency = this.configService.get<number>('app.vtex.storeConcurrency', 6);
  }

  async getDashboard(
    rawStartDate: string,
    rawEndDate: string,
    forceRefresh: boolean,
  ): Promise<DashboardResponse> {
    const startDateIso = normalizeStartDate(rawStartDate);
    const endDateIso = normalizeEndDate(rawEndDate);

    const stores = getStoresConfig();
    const limit = pLimit(this.storeConcurrency);

    const perStoreResults = await Promise.all(
      stores.map((store) =>
        limit(() => this.getStoreDashboard(store, startDateIso, endDateIso, forceRefresh)),
      ),
    );

    // Se ordena de mayor a menor participación (valor contabilizado) para
    // que la tabla comparativa y los gráficos muestren primero las tiendas
    // que más venden; las tiendas con error quedan al final.
    const storeResults = perStoreResults
      .map((r) => r.storeResult)
      .sort((a, b) => {
        const aValue = a.success && a.data ? a.data.revenueTotalValue : -1;
        const bValue = b.success && b.data ? b.data.revenueTotalValue : -1;
        return bValue - aValue;
      });
    const segments = perStoreResults.flatMap((r) => r.segments);
    const summary = this.buildGlobalSummary(storeResults);

    return {
      filters: { startDate: startDateIso, endDate: endDateIso },
      summary,
      stores: storeResults,
      segments,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getStoreDashboard(
    store: StoreConfig,
    startDateIso: string,
    endDateIso: string,
    forceRefresh: boolean,
  ): Promise<{ storeResult: StoreDashboardResult; segments: SegmentDashboardResult[] }> {
    const startedAt = Date.now();

    try {
      if (!store.appKey || !store.appToken) {
        throw new Error(
          `Credenciales no configuradas para la tienda "${store.id}". Verifique las variables de entorno.`,
        );
      }

      const sources = buildSourceDefinitions(store);
      const resolved = await this.historicalSyncService.resolveRange(
        store,
        sources,
        startDateIso,
        endDateIso,
        forceRefresh,
      );

      const [mainSourceData, ...segmentSourcesData] = resolved.sources;

      // El total de la tienda combina la fuente principal MÁS todos los
      // segmentos (deduplicado por orderId), ya que los segmentos capturan
      // órdenes adicionales que la consulta general no trae desagregadas.
      const combinedOrdersById = new Map<string, VtexOrder>();
      for (const order of mainSourceData.orders) combinedOrdersById.set(order.orderId, order);
      for (const segmentData of segmentSourcesData) {
        for (const order of segmentData.orders) combinedOrdersById.set(order.orderId, order);
      }
      const combinedOrders = Array.from(combinedOrdersById.values());

      const responseTimeMs = Date.now() - startedAt;
      const allSourcesComplete = resolved.sources.every((s) => s.isComplete);

      const data = this.analyticsService.buildStoreData(store.id, combinedOrders, {
        isComplete: allSourcesComplete && !resolved.backgroundSyncInProgress,
        syncInProgress: resolved.backgroundSyncInProgress,
        syncJobId: resolved.backgroundJobId,
        pendingClosedDays: resolved.pendingClosedDays,
        responseTimeMs,
      });

      const storeResult: StoreDashboardResult = {
        id: store.id,
        name: store.name,
        color: store.color,
        success: true,
        data,
      };

      const segments: SegmentDashboardResult[] = segmentSourcesData.map((segmentData, index) => {
        const definition = sources[index + 1]; // +1 porque sources[0] es 'main'
        const type = definition.ref.sourceType as 'seller' | 'marketplace';
        const segmentAnalytics = this.analyticsService.buildStoreData(definition.ref.sourceKey, segmentData.orders, {
          isComplete: segmentData.isComplete && !resolved.backgroundSyncInProgress,
          syncInProgress: resolved.backgroundSyncInProgress,
          syncJobId: resolved.backgroundJobId,
          pendingClosedDays: 0, // el detalle agregado ya está a nivel de tienda; se evita duplicar el número aquí
          responseTimeMs,
        });
        return {
          id: `${store.id}:${type}:${definition.ref.sourceKey}`,
          storeId: store.id,
          label: definition.label,
          type,
          success: true,
          data: segmentAnalytics,
        };
      });

      return { storeResult, segments };
    } catch (error) {
      this.logger.error(
        `Error consultando la tienda "${store.id}": ${
          error instanceof Error ? error.message : 'Error desconocido'
        }`,
      );
      return {
        storeResult: {
          id: store.id,
          name: store.name,
          color: store.color,
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido consultando VTEX',
        },
        segments: [],
      };
    }
  }

  private buildGlobalSummary(storeResults: StoreDashboardResult[]) {
    let totalOrders = 0;
    let totalRevenueOrders = 0;
    let totalRevenueValue = 0;
    let storesWithErrors = 0;
    let storesWithIncompleteData = 0;
    let storesSyncing = 0;

    const totalRevenueBreakdown: Record<string, RevenueStatusBreakdown> = {};
    for (const definition of getRevenueStatusDefinitions()) {
      totalRevenueBreakdown[definition.key] = { orders: 0, value: 0 };
    }

    for (const result of storeResults) {
      if (result.success && result.data) {
        totalOrders += result.data.totalOrders;
        totalRevenueOrders += result.data.revenueOrders;
        totalRevenueValue += result.data.revenueTotalValue;
        for (const [key, breakdown] of Object.entries(result.data.revenueBreakdown)) {
          const target = totalRevenueBreakdown[key] ?? { orders: 0, value: 0 };
          target.orders += breakdown.orders;
          target.value += breakdown.value;
          totalRevenueBreakdown[key] = target;
        }
        if (!result.data.isComplete) storesWithIncompleteData += 1;
        if (result.data.syncInProgress) storesSyncing += 1;
      } else {
        storesWithErrors += 1;
      }
    }

    return {
      totalOrders,
      totalRevenueOrders,
      totalRevenueValue,
      totalRevenueBreakdown,
      storesQueried: storeResults.length,
      storesWithErrors,
      storesWithIncompleteData,
      storesSyncing,
    };
  }
}
