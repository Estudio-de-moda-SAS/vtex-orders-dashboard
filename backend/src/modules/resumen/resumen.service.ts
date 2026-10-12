import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChangePieceName, decomposeChange, pickEngineAndBrakes } from '../../common/utils/change-engine.util';
import { ChannelPoint, decomposeMixVsWithin } from '../../common/utils/channel-mix.util';
import { enumerateDayBuckets, normalizeEndDate, normalizeStartDate, sameRangeLastYear, toDayBucketColombia } from '../../common/utils/date-range.util';
import { computeGaCoverage } from '../../common/utils/ga-coverage.util';
import {
  buildHistoryWindowRanges,
  classifySemaphore,
  computeMinOrdersThreshold,
  computeStoreThresholds,
  DateRange,
  filterWindowsFromEarliestDate,
} from '../../common/utils/resumen-semaphore.util';
import { buildResumenMessage } from '../../common/utils/resumen-message.util';
import { matchRevenueStatusDefinition } from '../../common/utils/revenue-status.util';
import { safeDivide, safePercentChange } from '../../common/utils/safe-math.util';
import { getRevenueStatusDefinitions } from '../../config/revenue-status.config';
import { getResumenSemaphoreConfig } from '../../config/resumen-semaphore.config';
import { getStoresConfig, StoreConfig } from '../../config/stores.config';
import { DashboardQueryRepository } from '../database/repositories/dashboard-query.repository';
import { ResumenMetricPair, ResumenPilatosInfo, ResumenResponse, ResumenStoreResult } from './resumen.interface';

/** Umbral de la Parte 4: la lectura de mezcla solo se calcula si la conversión según GA cambió al menos esto. */
const MIX_TRIGGER_THRESHOLD_PERCENT = 5;
/** Compras GA mínimas por canal/período para no agrupar ese canal en "Otros" (Parte 4). */
const MIX_MIN_PURCHASES_PER_CHANNEL = 20;

/**
 * `pg` devuelve una columna `DATE` como objeto `Date` de JS — mismo
 * problema (y misma solución) ya documentado en `GaQueryService`.
 */
function toDateOnlyString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Suma un mapa `fecha → número` dentro de `[startDay, endDay]`. `null` si NINGÚN día del rango tiene dato — nunca inventa un 0 cuando no hay base. Días sueltos sin dato DENTRO de un rango que sí tiene algo cuentan como 0 (mismo nivel de confianza que el resto del dashboard al sumar `sales_daily`). */
function sumDailyRange(dailyMap: Map<string, number> | undefined, startDay: string, endDay: string): number | null {
  if (!dailyMap || dailyMap.size === 0) return null;
  const days = enumerateDayBuckets(`${startDay}T00:00:00-05:00`, `${endDay}T23:59:59-05:00`);
  const anyDayPresent = days.some((d) => dailyMap.has(d));
  if (!anyDayPresent) return null;
  return days.reduce((sum, d) => sum + (dailyMap.get(d) ?? 0), 0);
}

function buildMetricPair(a: number | null, b: number | null): ResumenMetricPair {
  return { a, b, changePercent: safePercentChange(a, b) };
}

/**
 * Primera fecha (orden alfabético = cronológico en `YYYY-MM-DD`) con datos
 * en el mapa — `undefined` si el mapa está vacío. Se usa para no construir
 * ventanas históricas que empiecen ANTES de que exista historial real: una
 * ventana así no suma 0 (la función `sumDailyRange` ya trata los días sin
 * fila DENTRO de un rango con datos como 0), sino un total artificialmente
 * bajo por cobertura parcial, lo que inflaría el σ de la tienda sin que
 * haya pasado nada real ese período.
 */
function earliestDateInMap(map: Map<string, unknown> | undefined): string | undefined {
  if (!map || map.size === 0) return undefined;
  return [...map.keys()].sort()[0];
}

/** Extrae una sola columna (`sales` u `orders`) del mapa combinado de `getDailyContabilizadaData` como `Map<fecha, número>` — lo que espera `sumDailyRange`. */
function toFieldMap(dailyMap: Map<string, { sales: number; orders: number }> | undefined, field: 'sales' | 'orders'): Map<string, number> | undefined {
  if (!dailyMap) return undefined;
  return new Map([...dailyMap].map(([date, value]) => [date, value[field]]));
}

/** `YYYY-MM-DD` compara correctamente de forma lexicográfica = cronológica. */
function minDay(a: string, b: string): string {
  return a < b ? a : b;
}
function maxDay(a: string, b: string): string {
  return a > b ? a : b;
}

@Injectable()
export class ResumenService {
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();
  private readonly semaphoreConfig = getResumenSemaphoreConfig();

  constructor(
    private readonly dashboardQueryRepository: DashboardQueryRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * `/resumen` deja elegir LOS DOS rangos a comparar explícitamente — a
   * diferencia del resto del dashboard, B NO se deriva automáticamente de
   * A. Pueden quedar en cualquier orden cronológico y de cualquier
   * duración entre sí; toda la lectura (ventanas históricas, motor del
   * cambio, mezcla de canales) sigue funcionando igual porque está
   * parametrizada por las fechas reales de cada uno, nunca por una
   * relación de adyacencia asumida entre ambos.
   */
  async getSummary(startDateA: string, endDateA: string, startDateB: string, endDateB: string): Promise<ResumenResponse> {
    const startDayA = toDayBucketColombia(normalizeStartDate(startDateA));
    const endDayA = toDayBucketColombia(normalizeEndDate(endDateA));
    const periodB = {
      startDay: toDayBucketColombia(normalizeStartDate(startDateB)),
      endDay: toDayBucketColombia(normalizeEndDate(endDateB)),
    };
    const periodC = sameRangeLastYear(startDayA, endDayA);
    const pieceThresholdPercent = this.configService.get<number>('app.ga.changeEngineThresholdPercent', 5);

    const stores = getStoresConfig();
    const windows = buildHistoryWindowRanges(periodB.startDay, periodB.endDay, this.semaphoreConfig.maxHistoryWindows);
    const oldestWindowStart = windows[windows.length - 1].startDay;
    // Las ventanas históricas siempre empiezan en B (nunca tocan A), así que `oldestWindowStart`
    // ya cubre B por construcción — el mínimo/máximo son solo para asegurar que A TAMBIÉN
    // quede adentro del rango consultado, sin asumir que A es cronológicamente el extremo tardío.
    const bigQueryStart = minDay(oldestWindowStart, startDayA);
    const bigQueryEnd = maxDay(endDayA, periodB.endDay);

    // Una sola consulta por fuente para TODAS las tiendas y TODO el rango necesario —
    // A, B y las ventanas históricas comparten un solo pase de datos de ventas+órdenes.
    const [dailyByStore, dailyCByStore, sessionsByStoreA, sessionsByStoreB, channelsByStoreA, channelsByStoreB, marketplaceRowsA, marketplaceRowsB] = await Promise.all([
      this.getDailyContabilizadaData(bigQueryStart, bigQueryEnd),
      this.getDailyContabilizadaData(periodC.startDay, periodC.endDay),
      this.getGaSessionsByStore(startDayA, endDayA),
      this.getGaSessionsByStore(periodB.startDay, periodB.endDay),
      this.getChannelPointsByStore(startDayA, endDayA),
      this.getChannelPointsByStore(periodB.startDay, periodB.endDay),
      this.getMarketplaceRowsByStore(startDayA, endDayA),
      this.getMarketplaceRowsByStore(periodB.startDay, periodB.endDay),
    ]);

    const results = stores.map((store) =>
      this.buildStoreResult({
        store,
        startDateA,
        endDateA,
        startDateB,
        endDateB,
        startDayA,
        endDayA,
        periodB,
        periodC,
        windows,
        pieceThresholdPercent,
        dailySales: toFieldMap(dailyByStore.get(store.id), 'sales'),
        dailyOrders: toFieldMap(dailyByStore.get(store.id), 'orders'),
        dailySalesC: toFieldMap(dailyCByStore.get(store.id), 'sales'),
        sessionsMapA: sessionsByStoreA.get(store.id),
        sessionsMapB: sessionsByStoreB.get(store.id),
        channelsA: channelsByStoreA.get(store.id) ?? [],
        channelsB: channelsByStoreB.get(store.id) ?? [],
        marketplaceRowsA: marketplaceRowsA.get(store.id) ?? [],
        marketplaceRowsB: marketplaceRowsB.get(store.id) ?? [],
      }),
    );

    // Ranking: variación de ventas totales desc, grises al final.
    const ranked = [...results].sort((x, y) => {
      if (x.color === 'gris' && y.color !== 'gris') return 1;
      if (y.color === 'gris' && x.color !== 'gris') return -1;
      return (y.sales.changePercent ?? -Infinity) - (x.sales.changePercent ?? -Infinity);
    });
    ranked.forEach((store, index) => {
      store.rankingPosition = index + 1;
    });

    return {
      filters: {
        periodA: { startDate: startDateA, endDate: endDateA },
        periodB: { startDate: startDateB, endDate: endDateB },
      },
      stores: ranked,
    };
  }

  private buildStoreResult(input: {
    store: StoreConfig;
    startDateA: string;
    endDateA: string;
    startDateB: string;
    endDateB: string;
    startDayA: string;
    endDayA: string;
    periodB: DateRange;
    periodC: DateRange;
    windows: DateRange[];
    pieceThresholdPercent: number;
    dailySales: Map<string, number> | undefined;
    dailyOrders: Map<string, number> | undefined;
    dailySalesC: Map<string, number> | undefined;
    sessionsMapA: Map<string, number> | undefined;
    sessionsMapB: Map<string, number> | undefined;
    channelsA: ChannelPoint[];
    channelsB: ChannelPoint[];
    marketplaceRowsA: { marketplaceName: string; orders: number; sales: number; revenueOrders: number; revenueSales: number }[];
    marketplaceRowsB: { marketplaceName: string; orders: number; sales: number; revenueOrders: number; revenueSales: number }[];
  }): ResumenStoreResult {
    const { store, startDayA, endDayA, periodB, periodC, windows } = input;

    // --- Ventas totales contabilizadas (siempre "todas las fuentes" — base del semáforo) ---
    const totalSalesA = sumDailyRange(input.dailySales, startDayA, endDayA);
    const totalSalesB = sumDailyRange(input.dailySales, periodB.startDay, periodB.endDay);
    const totalSalesPair = buildMetricPair(totalSalesA, totalSalesB);
    const salesYearAgo = buildMetricPair(sumDailyRange(input.dailySalesC, periodC.startDay, periodC.endDay), null);

    // --- Órdenes contabilizadas totales (mismo filtro de estado que las ventas) ---
    const totalOrdersA = sumDailyRange(input.dailyOrders, startDayA, endDayA);
    const totalOrdersB = sumDailyRange(input.dailyOrders, periodB.startDay, periodB.endDay);

    // --- Ajuste de Pilatos: ventas/órdenes DEL SITIO (totales − marketplaces excluidos) ---
    const excludedLabels = (store.extraSegments?.marketplaces ?? []).filter((m) => m.excludeFromSiteConversion).map((m) => m.label);
    let pilatosInfo: ResumenPilatosInfo | undefined;
    let siteSalesA = totalSalesA;
    let siteSalesB = totalSalesB;
    let siteOrdersA = totalOrdersA;
    let siteOrdersB = totalOrdersB;

    if (excludedLabels.length > 0) {
      const excludedA = input.marketplaceRowsA.filter((r) => excludedLabels.includes(r.marketplaceName));
      const excludedB = input.marketplaceRowsB.filter((r) => excludedLabels.includes(r.marketplaceName));
      const excludedSalesA = excludedA.reduce((sum, r) => sum + r.revenueSales, 0);
      const excludedSalesB = excludedB.reduce((sum, r) => sum + r.revenueSales, 0);
      const excludedOrdersA = excludedA.reduce((sum, r) => sum + r.revenueOrders, 0);
      const excludedOrdersB = excludedB.reduce((sum, r) => sum + r.revenueOrders, 0);

      siteSalesA = totalSalesA === null ? null : totalSalesA - excludedSalesA;
      siteSalesB = totalSalesB === null ? null : totalSalesB - excludedSalesB;
      siteOrdersA = totalOrdersA === null ? null : totalOrdersA - excludedOrdersA;
      siteOrdersB = totalOrdersB === null ? null : totalOrdersB - excludedOrdersB;

      pilatosInfo = {
        totalSales: totalSalesPair,
        siteSales: buildMetricPair(siteSalesA, siteSalesB),
        siteOrders: buildMetricPair(siteOrdersA, siteOrdersB),
        excludedMarketplaces: excludedLabels,
      };
    }

    // --- Sesiones GA + cobertura/provisional (misma regla que GaQueryService.getOverview) ---
    const allDaysA = enumerateDayBuckets(`${startDayA}T00:00:00-05:00`, `${endDayA}T23:59:59-05:00`);
    const allDaysB = enumerateDayBuckets(`${periodB.startDay}T00:00:00-05:00`, `${periodB.endDay}T23:59:59-05:00`);
    const daysWithRowsA = allDaysA.filter((d) => input.sessionsMapA?.has(d));
    const daysWithRowsB = allDaysB.filter((d) => input.sessionsMapB?.has(d));
    const coverageA = computeGaCoverage(allDaysA, daysWithRowsA);
    const coverageB = computeGaCoverage(allDaysB, daysWithRowsB);
    const sessionsA = daysWithRowsA.length > 0 ? daysWithRowsA.reduce((sum, d) => sum + (input.sessionsMapA?.get(d) ?? 0), 0) : null;
    const sessionsB = daysWithRowsB.length > 0 ? daysWithRowsB.reduce((sum, d) => sum + (input.sessionsMapB?.get(d) ?? 0), 0) : null;
    const provisionalDates = [...coverageA.provisionalDays, ...coverageB.provisionalDays];

    // --- Conversión/ticket — base DEL SITIO para Pilatos, total para las demás tiendas ---
    const conversionA = safeDivide(siteOrdersA, sessionsA);
    const conversionB = safeDivide(siteOrdersB, sessionsB);
    const conversionPercentPair = buildMetricPair(conversionA !== null ? conversionA * 100 : null, conversionB !== null ? conversionB * 100 : null);
    const ticketA = safeDivide(siteSalesA, siteOrdersA);
    const ticketB = safeDivide(siteSalesB, siteOrdersB);

    // --- Semáforo (SOLO ventas totales) ---
    // Ventanas que empiezan ANTES del primer día con datos reales de esta tienda se descartan
    // ENTERAS (no solo cuando quedan en 0) — evita que una ventana con cobertura parcial por el
    // límite del historial (ver nota de `earliestDateInMap`) distorsione el σ o la mediana de
    // órdenes. Importante para rangos largos (ej. 1 mes): 13 ventanas de 1 mes alcanzan ~13 meses
    // atrás, que puede caer antes de julio 2025 (inicio del historial de ventas) — esas ventanas
    // simplemente no se usan, y si sobreviven menos de las requeridas, se cae a valores por
    // defecto (ya probado en `resumen-semaphore.util.test.ts`), nunca a un dato inventado.
    const earliestSalesDate = earliestDateInMap(input.dailySales);
    const usableWindows = filterWindowsFromEarliestDate(windows, earliestSalesDate);
    const thresholdWindowSales = usableWindows.map((w) => sumDailyRange(input.dailySales, w.startDay, w.endDay));
    const thresholds = computeStoreThresholds(thresholdWindowSales, this.semaphoreConfig);
    // El mínimo de volumen se calcula sobre el comportamiento histórico propio de la tienda
    // (misma ventana que el σ de ventas), nunca con un número fijo igual para todas.
    const thresholdWindowOrders = usableWindows.map((w) => sumDailyRange(input.dailyOrders, w.startDay, w.endDay));
    const minOrdersInfo = computeMinOrdersThreshold(thresholdWindowOrders, this.semaphoreConfig);
    const semaphore = classifySemaphore({
      salesChangePercent: totalSalesPair.changePercent,
      salesB: totalSalesB,
      redLimit: thresholds.redLimit,
      greenLimit: thresholds.greenLimit,
      purchasesA: totalOrdersA,
      purchasesB: totalOrdersB,
      volumeIsOrdersFallback: true,
      minPurchases: minOrdersInfo.minOrders,
    });

    // --- Motor del cambio (base del sitio para Pilatos) ---
    let engine: ChangePieceName | null = null;
    let noEngineReason: 'cambio-minimo' | 'sin-pieza-clara' | undefined;
    let engineChangePercent: number | undefined;
    let brakes: ChangePieceName[] = [];
    let brakeChangePercents: Partial<Record<ChangePieceName, number>> | undefined;

    const coverageOkForEngine = coverageA.coverage === 1 && coverageB.coverage === 1;
    const hasEngineInputs =
      coverageOkForEngine && sessionsA !== null && sessionsB !== null && conversionA !== null && conversionB !== null && ticketA !== null && ticketB !== null && totalSalesPair.changePercent !== null;

    if (hasEngineInputs) {
      const components = decomposeChange({ sessionsA: sessionsA!, sessionsB: sessionsB!, conversionA: conversionA!, conversionB: conversionB!, ticketA: ticketA!, ticketB: ticketB! });
      if (components) {
        const picked = pickEngineAndBrakes(components, totalSalesPair.changePercent!, input.pieceThresholdPercent);
        engine = picked.engine;
        noEngineReason = picked.noEngineReason;
        brakes = picked.brakes;
        const valueOf = (name: ChangePieceName): number =>
          name === 'tráfico' ? components.trafficPercent : name === 'conversión' ? components.conversionPercent : components.ticketPercent;
        if (engine) engineChangePercent = valueOf(engine);
        if (brakes.length > 0) brakeChangePercents = Object.fromEntries(brakes.map((b) => [b, valueOf(b)]));
      }
    }

    // --- Mezcla vs. dentro (Parte 4) — solo si la conversión GA cambió >= 5% y cobertura 100% en A y B ---
    let mix: ResumenStoreResult['mix'];
    if (coverageOkForEngine && Math.abs(conversionPercentPair.changePercent ?? 0) >= MIX_TRIGGER_THRESHOLD_PERCENT && input.channelsA.length > 0 && input.channelsB.length > 0) {
      mix = decomposeMixVsWithin(input.channelsA, input.channelsB, MIX_MIN_PURCHASES_PER_CHANNEL);
    }

    const message = buildResumenMessage({
      storeName: store.name,
      color: semaphore.color,
      grayReason: semaphore.grayReason,
      salesChangePercent: totalSalesPair.changePercent,
      engine,
      noEngineReason,
      engineChangePercent,
      brakes,
      brakeChangePercents,
      provisional: provisionalDates.length > 0,
    });

    return {
      storeId: store.id,
      storeName: store.name,
      periodA: { startDate: input.startDateA, endDate: input.endDateA },
      periodB: { startDate: input.startDateB, endDate: input.endDateB },
      periodC: { startDate: periodC.startDay, endDate: periodC.endDay },
      sales: totalSalesPair,
      orders: buildMetricPair(totalOrdersA, totalOrdersB),
      sessions: buildMetricPair(sessionsA, sessionsB),
      conversionPercent: conversionPercentPair,
      ticket: buildMetricPair(ticketA, ticketB),
      salesYearAgo,
      color: semaphore.color,
      grayReason: semaphore.grayReason,
      thresholds,
      minOrdersInfo,
      provisional: provisionalDates.length > 0,
      provisionalDates,
      gaCoverageA: coverageA.coverage,
      gaCoverageB: coverageB.coverage,
      engine,
      noEngineReason,
      engineChangePercent,
      brakes,
      brakeChangePercents,
      mix,
      message,
      rankingPosition: 0,
      pilatos: pilatosInfo,
    };
  }

  /**
   * `date → {ventas, órdenes} contabilizadas de ese día`, por tienda — un
   * solo query cubre A, B y todas las ventanas históricas, y sirve tanto
   * para las ventas del semáforo como para el conteo de órdenes que
   * reemplaza a "compras reales" (`sales_daily.real_revenue_orders`, sin
   * histórico confiable para todo el rango que necesita el semáforo —
   * ver nota en `ResumenStoreResult.orders`). Mismo filtro de estado para
   * ambas columnas, así que suman consistentemente entre sí.
   */
  private async getDailyContabilizadaData(startDay: string, endDay: string): Promise<Map<string, Map<string, { sales: number; orders: number }>>> {
    const rows = await this.dashboardQueryRepository.queryGroupedMulti('sales_daily_by_status', ['date', 'status'], ['sales', 'orders'], startDay, endDay);
    const byStore = new Map<string, Map<string, { sales: number; orders: number }>>();
    for (const row of rows) {
      if (!matchRevenueStatusDefinition({ status: String(row.status) }, this.revenueStatusDefinitions)) continue;
      const storeId = String(row.store_id);
      const date = toDateOnlyString(row.date);
      const dayMap = byStore.get(storeId) ?? new Map<string, { sales: number; orders: number }>();
      const prev = dayMap.get(date) ?? { sales: 0, orders: 0 };
      dayMap.set(date, { sales: prev.sales + Number(row.sales), orders: prev.orders + Number(row.orders) });
      byStore.set(storeId, dayMap);
    }
    return byStore;
  }

  /** `date → sesiones de ese día`, por tienda. */
  private async getGaSessionsByStore(startDay: string, endDay: string): Promise<Map<string, Map<string, number>>> {
    const rows = await this.dashboardQueryRepository.queryGroupedMulti('ga_daily', ['date'], ['sessions'], startDay, endDay);
    const byStore = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const storeId = String(row.store_id);
      const dayMap = byStore.get(storeId) ?? new Map<string, number>();
      dayMap.set(toDateOnlyString(row.date), Number(row.sessions));
      byStore.set(storeId, dayMap);
    }
    return byStore;
  }

  private async getChannelPointsByStore(startDay: string, endDay: string): Promise<Map<string, ChannelPoint[]>> {
    const rows = await this.dashboardQueryRepository.queryGroupedMulti('ga_daily_by_channel', ['channel_group'], ['sessions', 'purchases'], startDay, endDay);
    const byStore = new Map<string, ChannelPoint[]>();
    for (const row of rows) {
      const storeId = String(row.store_id);
      const list = byStore.get(storeId) ?? [];
      list.push({ channel: String(row.channel_group), sessions: Number(row.sessions), purchases: Number(row.purchases) });
      byStore.set(storeId, list);
    }
    return byStore;
  }

  private async getMarketplaceRowsByStore(
    startDay: string,
    endDay: string,
  ): Promise<Map<string, { marketplaceName: string; orders: number; sales: number; revenueOrders: number; revenueSales: number }[]>> {
    const rows = await this.dashboardQueryRepository.queryGroupedMulti(
      'sales_daily_by_marketplace',
      ['marketplace_name'],
      ['orders', 'sales', 'revenue_orders', 'revenue_sales'],
      startDay,
      endDay,
    );
    const byStore = new Map<string, { marketplaceName: string; orders: number; sales: number; revenueOrders: number; revenueSales: number }[]>();
    for (const row of rows) {
      const storeId = String(row.store_id);
      const list = byStore.get(storeId) ?? [];
      list.push({
        marketplaceName: String(row.marketplace_name),
        orders: Number(row.orders),
        sales: Number(row.sales),
        revenueOrders: Number(row.revenue_orders),
        revenueSales: Number(row.revenue_sales),
      });
      byStore.set(storeId, list);
    }
    return byStore;
  }
}
