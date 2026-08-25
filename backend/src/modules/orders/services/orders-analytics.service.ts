import { Injectable, Logger } from '@nestjs/common';

import { getRevenueStatusDefinitions } from '../../../config/revenue-status.config';
import { matchRevenueStatusDefinition } from '../../../common/utils/revenue-status.util';
import { VtexOrder } from '../interfaces/vtex-order.interface';
import {
  CityBreakdown,
  PaymentMethodBreakdown,
  RevenueStatusBreakdown,
  StoreDashboardData,
} from '../interfaces/dashboard.interface';

const UNKNOWN_PAYMENT_LABEL = 'Otro';
const UNKNOWN_CITY_LABEL = 'Sin ciudad';

export interface StoreDataMeta {
  isComplete: boolean;
  syncInProgress: boolean;
  syncJobId?: string;
  pendingClosedDays: number;
  responseTimeMs: number;
}

/**
 * Convierte una lista de órdenes crudas de VTEX en los indicadores
 * agregados que necesita el dashboard. No conoce nada sobre HTTP ni
 * sobre VTEX: solo recibe órdenes ya obtenidas y las resume.
 *
 * Se usa tanto para tiendas completas como para segmentos (vendedores o
 * canales de marketplace dentro de una tienda), ya que ambos comparten la
 * misma forma de indicadores (`StoreDashboardData`).
 */
@Injectable()
export class OrdersAnalyticsService {
  private readonly logger = new Logger(OrdersAnalyticsService.name);
  private readonly revenueStatusDefinitions = getRevenueStatusDefinitions();

  buildStoreData(contextId: string, orders: VtexOrder[], meta: StoreDataMeta): StoreDashboardData {
    const totalOrders = orders.length;
    const statusCounts = this.countByStatus(orders);
    const { revenueOrders, revenueTotalValue, revenueBreakdown, countedOrders } =
      this.computeRevenueTotals(orders);
    const paymentMethods = this.groupByPaymentMethod(orders);
    // Sobre TODAS las órdenes (como `groupByPaymentMethod`), no solo las
    // "contabilizadas": limitarlo a esas dejaba prácticamente sin ciudad
    // cualquier rango con muchas órdenes recientes que todavía no llegan a
    // un status contabilizado (ej. el mes en curso). El costo es que la
    // suma de `cityBreakdown[...].totalValue` ya NO coincide exactamente
    // con `revenueTotalValue` — se prioriza cobertura completa sobre esa
    // coincidencia exacta. Ver `cityRevenueBreakdown` para la versión que
    // SÍ coincide (usada donde se necesita comparar contra "lo que
    // realmente se vendió").
    const cityBreakdown = this.groupByCity(orders);
    // Mismo agrupamiento, pero solo con las órdenes "contabilizadas" (las
    // mismas que `revenueTotalValue`) — para comparativos que necesitan
    // coincidir exactamente con "valor contabilizado" (ej. el recuadro de
    // aporte general por ciudad del frontend).
    const cityRevenueBreakdown = this.groupByCity(countedOrders);
    const currencyCode = orders.find((o) => o.currencyCode)?.currencyCode ?? 'COP';

    const sumOfStatuses = Object.values(statusCounts).reduce((acc, n) => acc + n, 0);
    const isConsistent = sumOfStatuses === totalOrders;

    if (!isConsistent) {
      this.logger.warn(
        `[${contextId}] Inconsistencia de datos: suma de status (${sumOfStatuses}) !== totalOrders (${totalOrders})`,
      );
    }

    return {
      totalOrders,
      revenueOrders,
      revenueTotalValue,
      revenueBreakdown,
      currencyCode,
      statusCounts,
      paymentMethods,
      cityBreakdown,
      cityRevenueBreakdown,
      responseTimeMs: meta.responseTimeMs,
      isConsistent,
      isComplete: meta.isComplete,
      syncInProgress: meta.syncInProgress,
      syncJobId: meta.syncJobId,
      pendingClosedDays: meta.pendingClosedDays,
    };
  }

  private countByStatus(orders: VtexOrder[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const order of orders) {
      const status = order.status ?? 'unknown';
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Suma órdenes y valor de las órdenes cuyo status (o statusDescription)
   * corresponde a alguno de los estados "contabilizados": invoiced,
   * payment-approved, handling o checking-invoice; y además desglosa ese
   * mismo total por cada uno de esos estados individualmente. Ver
   * `config/revenue-status.config.ts` para la lista exacta y cómo
   * ajustarla si el código real de VTEX difiere.
   */
  private computeRevenueTotals(orders: VtexOrder[]): {
    revenueOrders: number;
    revenueTotalValue: number;
    revenueBreakdown: Record<string, RevenueStatusBreakdown>;
    /** Las mismas órdenes que componen `revenueOrders`/`revenueTotalValue` — ver `cityRevenueBreakdown`. */
    countedOrders: VtexOrder[];
  } {
    const revenueBreakdown: Record<string, RevenueStatusBreakdown> = {};
    for (const definition of this.revenueStatusDefinitions) {
      revenueBreakdown[definition.key] = { orders: 0, value: 0 };
    }

    const countedOrders: VtexOrder[] = [];
    let revenueTotalValue = 0;

    for (const order of orders) {
      const definition = matchRevenueStatusDefinition(order, this.revenueStatusDefinitions);
      if (!definition) continue;
      const value = order.totalValue ?? 0;
      countedOrders.push(order);
      revenueTotalValue += value;
      revenueBreakdown[definition.key].orders += 1;
      revenueBreakdown[definition.key].value += value;
    }

    return { revenueOrders: countedOrders.length, revenueTotalValue, revenueBreakdown, countedOrders };
  }

  /**
   * Agrupa órdenes por medio de pago. VTEX puede reportar múltiples medios
   * de pago separados por coma en `paymentNames` (ej. "Visa, Voucher");
   * en ese caso la orden se cuenta en cada medio de pago involucrado, sin
   * inflar el conteo total de órdenes reportado en otros indicadores.
   */
  private groupByPaymentMethod(orders: VtexOrder[]): Record<string, PaymentMethodBreakdown> {
    const rawCounts: Record<string, number> = {};
    let totalMentions = 0;

    for (const order of orders) {
      const paymentNames = (order.paymentNames ?? '').trim();
      const methods = paymentNames
        ? paymentNames
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean)
        : [UNKNOWN_PAYMENT_LABEL];

      for (const method of methods) {
        rawCounts[method] = (rawCounts[method] ?? 0) + 1;
        totalMentions += 1;
      }
    }

    const result: Record<string, PaymentMethodBreakdown> = {};
    for (const [method, count] of Object.entries(rawCounts)) {
      result[method] = {
        count,
        percentage: totalMentions > 0 ? Number(((count / totalMentions) * 100).toFixed(2)) : 0,
      };
    }
    return result;
  }

  /**
   * Agrupa por ciudad de envío (`order.city`, poblada por
   * `OrderCityEnrichmentService` — ver su comentario de clase). Opera
   * sobre las MISMAS órdenes que `groupByPaymentMethod` (todas las
   * obtenidas, sin filtrar por status de revenue) — a propósito, para no
   * dejar sin ciudad rangos con muchas órdenes recientes que todavía no
   * llegan a un status "contabilizado" (ej. el mes en curso). Por eso la
   * suma de `totalValue` de todas las ciudades NO tiene por qué coincidir
   * con `revenueTotalValue` — se prioriza cobertura completa sobre esa
   * coincidencia exacta. `percentage` es sobre el VALOR total (no sobre
   * el conteo): el objetivo es "cuánto genera a la venta esa ciudad", no
   * cuántas órdenes tuvo.
   */
  private groupByCity(orders: VtexOrder[]): Record<string, CityBreakdown> {
    const totalsByCity = new Map<string, { count: number; totalValue: number }>();
    let totalValue = 0;

    for (const order of orders) {
      const city = order.city && order.city.trim() ? order.city : UNKNOWN_CITY_LABEL;
      const value = order.totalValue ?? 0;

      const current = totalsByCity.get(city) ?? { count: 0, totalValue: 0 };
      current.count += 1;
      current.totalValue += value;
      totalsByCity.set(city, current);

      totalValue += value;
    }

    const result: Record<string, CityBreakdown> = {};
    for (const [city, totals] of totalsByCity.entries()) {
      result[city] = {
        count: totals.count,
        totalValue: totals.totalValue,
        percentage: totalValue > 0 ? Number(((totals.totalValue / totalValue) * 100).toFixed(2)) : 0,
      };
    }
    return result;
  }
}
