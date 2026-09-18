import { Injectable, Logger } from '@nestjs/common';

import { DailyAggregationResult } from '../../../common/aggregation/types';
import {
  groupConsecutiveDayRuns,
  normalizeEndDate,
  normalizeStartDate,
  toDayBucketColombia,
} from '../../../common/utils/date-range.util';
import { getStoresConfig } from '../../../config/stores.config';
import { DashboardQueryRepository, ExcludedStoreDate } from '../../database/repositories/dashboard-query.repository';
import { SyncLogsRepository } from '../../database/repositories/sync-logs.repository';
import { VtexSyncCronService } from '../../sync/services/vtex-sync-cron.service';
import { DashboardResponse, SegmentDashboardResult, StoreDashboardResult } from '../interfaces/dashboard.interface';
import { OrdersAnalyticsService, ByCityRow, ByPaymentRow, ByStatusRow, StoreTotalsRow } from './orders-analytics.service';

/**
 * Orquesta la respuesta del dashboard leyendo directamente los agregados
 * de Supabase (`sales_daily*`). El cron (`VtexSyncCronService`) sigue
 * siendo el único responsable de mantener esos agregados frescos — pero
 * si el rango pedido incluye días que TODAVÍA no existen ahí (un hueco
 * real: ni el cron ni el histórico de Excel los cubrieron nunca), este
 * servicio consulta esos días puntuales EN VIVO a VTEX (reutilizando
 * `VtexSyncCronService.fetchOnDemand`, la misma lógica de
 * fetch+enriquecimiento+agregación del cron), arma la respuesta con esos
 * datos reales, y dispara el guardado en Supabase EN SEGUNDO PLANO — la
 * respuesta HTTP espera a VTEX, pero no a que Supabase confirme la
 * escritura. La próxima consulta del mismo rango ya sale servida
 * enteramente desde la base, sin volver a tocar VTEX.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dashboardQueryRepository: DashboardQueryRepository,
    private readonly syncLogsRepository: SyncLogsRepository,
    private readonly analyticsService: OrdersAnalyticsService,
    private readonly vtexSyncCronService: VtexSyncCronService,
  ) {}

  async getDashboard(rawStartDate: string, rawEndDate: string): Promise<DashboardResponse> {
    const startedAt = Date.now();
    const startDateIso = normalizeStartDate(rawStartDate);
    const endDateIso = normalizeEndDate(rawEndDate);
    const startDay = toDayBucketColombia(startDateIso);
    const endDay = toDayBucketColombia(endDateIso);

    const stores = getStoresConfig();

    // Por cada tienda, si hay días del rango que nunca se sincronizaron,
    // los trae en vivo ANTES de leer los agregados — así la respuesta
    // siempre refleja datos reales, sin importar si el cron/Excel ya
    // habían cubierto ese rango o no.
    const { onDemandByStore, excludedStoreDates } = await this.fillMissingDays(stores, startDay, endDay);

    // Los días recién traídos en vivo se EXCLUYEN explícitamente de las
    // consultas SQL (ver `ExcludedStoreDate`) — así, si otra petición
    // concurrente para el mismo hueco ya alcanzó a guardarlos en segundo
    // plano, esta petición no los cuenta dos veces (una por SQL, otra
    // desde su propio resultado en vivo).
    const [totalsRows, statusRows, paymentRows, cityRows, sellerRows, marketplaceRows, syncStatusByStore] =
      await Promise.all([
        this.dashboardQueryRepository.getStoreTotals(startDay, endDay, undefined, excludedStoreDates),
        this.dashboardQueryRepository.queryGrouped(
          'sales_daily_by_status',
          'status',
          ['orders', 'sales'],
          startDay,
          endDay,
          undefined,
          excludedStoreDates,
        ),
        this.dashboardQueryRepository.queryGrouped(
          'sales_daily_by_payment',
          'payment_method',
          ['orders', 'sales', 'revenue_orders', 'revenue_sales'],
          startDay,
          endDay,
          undefined,
          excludedStoreDates,
        ),
        this.dashboardQueryRepository.queryGrouped(
          'sales_daily_by_city',
          'city',
          ['orders', 'sales', 'revenue_orders', 'revenue_sales'],
          startDay,
          endDay,
          undefined,
          excludedStoreDates,
        ),
        this.dashboardQueryRepository.queryGrouped(
          'sales_daily_by_seller',
          'seller_name',
          ['orders', 'sales', 'revenue_orders', 'revenue_sales'],
          startDay,
          endDay,
          undefined,
          excludedStoreDates,
        ),
        this.dashboardQueryRepository.queryGrouped(
          'sales_daily_by_marketplace',
          'marketplace_name',
          ['orders', 'sales', 'revenue_orders', 'revenue_sales'],
          startDay,
          endDay,
          undefined,
          excludedStoreDates,
        ),
        this.syncLogsRepository.getLatestStatusByStore(),
      ]);

    const responseTimeMs = Date.now() - startedAt;

    const storeResults: StoreDashboardResult[] = stores.map((store) => {
      const onDemand = onDemandByStore.get(store.id);

      const totals = mergeTotals(
        totalsRows.find((r) => r.storeId === store.id) ?? { orders: 0, units: 0, sales: 0, discounts: 0 },
        onDemand,
      );
      const byStatus = mergeByStatus(
        statusRows
          .filter((r) => r.store_id === store.id)
          .map((r) => ({ status: String(r.status), orders: Number(r.orders), sales: Number(r.sales) })),
        onDemand,
      );
      const byPayment = mergeByPayment(
        paymentRows
          .filter((r) => r.store_id === store.id)
          .map((r) => ({
            paymentMethod: String(r.payment_method),
            orders: Number(r.orders),
            sales: Number(r.sales),
            revenueOrders: Number(r.revenue_orders),
            revenueSales: Number(r.revenue_sales),
          })),
        onDemand,
      );
      const byCity = mergeByCity(
        cityRows
          .filter((r) => r.store_id === store.id)
          .map((r) => ({
            city: String(r.city),
            orders: Number(r.orders),
            sales: Number(r.sales),
            revenueOrders: Number(r.revenue_orders),
            revenueSales: Number(r.revenue_sales),
          })),
        onDemand,
      );

      const syncStatus = syncStatusByStore[store.id];
      const data = this.analyticsService.buildStoreData(store.id, totals, byStatus, byPayment, byCity, {
        responseTimeMs,
        lastSyncedAt: syncStatus?.lastSyncedAt ?? null,
        lastSyncStatus: syncStatus?.lastSyncStatus ?? null,
      });

      return { id: store.id, name: store.name, color: store.color, success: true, data };
    });

    const segments: SegmentDashboardResult[] = [
      ...this.buildSegments(sellerRows, 'seller', 'seller_name'),
      ...this.buildSegments(marketplaceRows, 'marketplace', 'marketplace_name'),
    ];

    const summary = this.analyticsService.buildGlobalSummary(storeResults);

    return {
      filters: { startDate: startDateIso, endDate: endDateIso },
      summary,
      stores: storeResults,
      segments,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Para cada tienda, detecta qué días del rango pedido no tienen NINGUNA
   * fila en `sales_daily` (nunca sincronizados) y, si hay alguno, los
   * trae en vivo de VTEX (`VtexSyncCronService.fetchOnDemand`) — en
   * paralelo entre tiendas. Retorna solo las tiendas que sí tuvieron
   * huecos, con el agregado recién calculado listo para fusionar con las
   * filas de Supabase.
   *
   * IMPORTANTE: los días faltantes se agrupan en tramos CONTIGUOS
   * (`groupConsecutiveDayRuns`) antes de consultar VTEX — si se tomara
   * directamente [primer día faltante, último día faltante] como un solo
   * rango, un hueco no contiguo (ej. faltan el 5, el 6 y el 17, pero el
   * 7-16 ya está en la base) haría que el 7-16 se volviera a traer de
   * VTEX y se SUMARA por encima de lo que la consulta SQL ya cuenta para
   * esos mismos días — doble conteo real, no solo un dato "de más".
   *
   * También retorna `excludedStoreDates`: la lista plana de (tienda, día)
   * que se acaban de traer en vivo — el llamador la pasa a TODAS las
   * consultas SQL para que las EXCLUYAN explícitamente. Sin esto, si una
   * petición concurrente para el mismo hueco ya terminó de guardar esos
   * días en segundo plano justo antes de que esta petición hiciera su
   * propia lectura SQL, esos días se contarían dos veces (una por SQL,
   * otra desde el resultado en vivo de ESTA petición) — es la misma
   * familia de bug que el de los tramos no contiguos, pero entre dos
   * peticiones distintas en vez de dentro de una sola.
   */
  private async fillMissingDays(
    stores: ReturnType<typeof getStoresConfig>,
    startDay: string,
    endDay: string,
  ): Promise<{ onDemandByStore: Map<string, DailyAggregationResult>; excludedStoreDates: ExcludedStoreDate[] }> {
    const onDemandByStore = new Map<string, DailyAggregationResult>();
    const excludedStoreDates: ExcludedStoreDate[] = [];

    await Promise.all(
      stores.map(async (store) => {
        const missingDays = await this.dashboardQueryRepository.findMissingDays(store.id, startDay, endDay);
        if (missingDays.length === 0) return;

        const runs = groupConsecutiveDayRuns(missingDays);
        this.logger.log(
          `[${store.id}] ${missingDays.length} día(s) sin sincronizar en el rango pedido (${runs
            .map((r) => (r.start === r.end ? r.start : `${r.start} a ${r.end}`))
            .join(', ')}) — consultando VTEX en vivo.`,
        );

        const settled = await Promise.allSettled(
          runs.map((run) => this.vtexSyncCronService.fetchOnDemand(store.id, run.start, run.end)),
        );

        const aggregations: DailyAggregationResult[] = [];
        const succeededDays: string[] = [];
        settled.forEach((outcome, index) => {
          const run = runs[index];
          if (outcome.status === 'fulfilled') {
            if (outcome.value) {
              aggregations.push(outcome.value);
              // Solo los días de ESTE tramo (no todo `missingDays`) — si
              // otro tramo del mismo hueco falló, sus días no deben
              // excluirse de SQL (no hay dato en vivo que los reemplace).
              succeededDays.push(...missingDays.filter((d) => d >= run.start && d <= run.end));
            }
            return;
          }
          const message = outcome.reason instanceof Error ? outcome.reason.message : 'error desconocido';
          this.logger.error(`[${store.id}] Falló la consulta en vivo a VTEX para ${run.start}–${run.end}: ${message}`);
        });

        if (aggregations.length > 0) {
          onDemandByStore.set(store.id, combineAggregations(aggregations));
          for (const date of succeededDays) excludedStoreDates.push({ storeId: store.id, date });
        }
      }),
    );

    return { onDemandByStore, excludedStoreDates };
  }

  private buildSegments(
    rows: Record<string, string | number>[],
    type: 'seller' | 'marketplace',
    nameColumn: string,
  ): SegmentDashboardResult[] {
    return rows.map((row) => {
      const storeId = String(row.store_id);
      const label = String(row[nameColumn]);
      const slug = slugify(label);
      return {
        id: `${storeId}:${type}:${slug}`,
        storeId,
        label,
        type,
        success: true,
        data: {
          // "ventas" = solo estados contabilizados (ver orders-analytics.service.ts) —
          // totalOrders acá YA es el conteo filtrado, no todas las órdenes del segmento.
          totalOrders: Number(row.revenue_orders),
          revenueOrders: Number(row.revenue_orders),
          revenueTotalValue: Number(row.revenue_sales),
        },
      };
    });
  }
}

/** Convierte un label (ej. "Disandina S.A.S") en un id URL-safe (ej. "disandina-s-a-s"), sin tildes. */
function slugify(label: string): string {
  const withoutDiacritics = label.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

/**
 * Combina los agregados de VARIOS tramos contiguos (ver
 * `fillMissingDays`) en uno solo — simple concatenación de arrays, no
 * suma: cada tramo cubre fechas DISJUNTAS de los demás, así que no hay
 * ninguna clave (fecha+tienda+dimensión) que se repita entre tramos.
 */
function combineAggregations(results: DailyAggregationResult[]): DailyAggregationResult {
  return {
    salesDaily: results.flatMap((r) => r.salesDaily),
    byStatus: results.flatMap((r) => r.byStatus),
    byPayment: results.flatMap((r) => r.byPayment),
    byCity: results.flatMap((r) => r.byCity),
    byCategory: results.flatMap((r) => r.byCategory),
    byBrand: results.flatMap((r) => r.byBrand),
    byCategoryBrand: results.flatMap((r) => r.byCategoryBrand),
    byCollectionCategory: results.flatMap((r) => r.byCollectionCategory),
    byCollection: results.flatMap((r) => r.byCollection),
    byDiscountCampaign: results.flatMap((r) => r.byDiscountCampaign),
    byDiscountBucket: results.flatMap((r) => r.byDiscountBucket),
    byBrandDiscountBucket: results.flatMap((r) => r.byBrandDiscountBucket),
    bySeller: results.flatMap((r) => r.bySeller),
    byMarketplace: results.flatMap((r) => r.byMarketplace),
  };
}

function mergeTotals(base: StoreTotalsRow, onDemand: DailyAggregationResult | undefined): StoreTotalsRow {
  if (!onDemand) return base;
  const merged = { ...base };
  for (const row of onDemand.salesDaily) {
    merged.orders += row.orders;
    merged.units += row.units;
    merged.sales += row.sales;
    merged.discounts += row.discounts;
  }
  return merged;
}

function mergeByStatus(base: ByStatusRow[], onDemand: DailyAggregationResult | undefined): ByStatusRow[] {
  if (!onDemand) return base;
  const byKey = new Map(base.map((row) => [row.status, { ...row }]));
  for (const row of onDemand.byStatus) {
    const current = byKey.get(row.status) ?? { status: row.status, orders: 0, sales: 0 };
    current.orders += row.orders;
    current.sales += row.sales;
    byKey.set(row.status, current);
  }
  return Array.from(byKey.values());
}

function mergeByPayment(base: ByPaymentRow[], onDemand: DailyAggregationResult | undefined): ByPaymentRow[] {
  if (!onDemand) return base;
  const byKey = new Map(base.map((row) => [row.paymentMethod, { ...row }]));
  for (const row of onDemand.byPayment) {
    const current =
      byKey.get(row.paymentMethod) ??
      { paymentMethod: row.paymentMethod, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
    current.orders += row.orders;
    current.sales += row.sales;
    current.revenueOrders += row.revenueOrders;
    current.revenueSales += row.revenueSales;
    byKey.set(row.paymentMethod, current);
  }
  return Array.from(byKey.values());
}

function mergeByCity(base: ByCityRow[], onDemand: DailyAggregationResult | undefined): ByCityRow[] {
  if (!onDemand) return base;
  const byKey = new Map(base.map((row) => [row.city, { ...row }]));
  for (const row of onDemand.byCity) {
    const current = byKey.get(row.city) ?? { city: row.city, orders: 0, sales: 0, revenueOrders: 0, revenueSales: 0 };
    current.orders += row.orders;
    current.sales += row.sales;
    current.revenueOrders += row.revenueOrders;
    current.revenueSales += row.revenueSales;
    byKey.set(row.city, current);
  }
  return Array.from(byKey.values());
}
