import { Injectable } from '@nestjs/common';

import { SmartSaleService } from '../../orders/services/smartsale.service';

export interface SmartSalePersonRow {
  name: string;
  sales: number;
  orders: number;
  percentageOfSmartSale: number;
}

export interface SmartSaleSalesResult {
  startDay: string;
  endDay: string;
  /** `null` = combinado de las 6 tiendas. */
  storeId: string | null;
  totalSmartSaleSales: number;
  totalSmartSaleOrders: number;
  byPerson: SmartSalePersonRow[];
  /** Venta total de la tienda (referencia, sin filtrar a SmartSale) — solo cuando `storeId` viene dado. */
  storeTotalSales: number | null;
}

/**
 * Herramienta `get_smartsale_sales` — reusa `SmartSaleService.getSummary`
 * (ya calcula total del canal + desglose por persona con `matchRevenueStatusDefinition`
 * aplicado) en vez de reconsultar las tablas `smartsale_daily_by_*` directo.
 * Sin `storeId`, combina las 6 tiendas sumando por persona (un vendedor
 * puede vender en varias tiendas a la vez).
 */
@Injectable()
export class AssistantSmartSaleService {
  constructor(private readonly smartSaleService: SmartSaleService) {}

  async getSmartSaleSales(startDay: string, endDay: string, storeId?: string): Promise<SmartSaleSalesResult> {
    const summaryByStore = await this.smartSaleService.getSummary(startDay, endDay);

    if (storeId) {
      const store = summaryByStore[storeId];
      return {
        startDay,
        endDay,
        storeId,
        totalSmartSaleSales: store?.smartSaleSales ?? 0,
        totalSmartSaleOrders: store?.smartSaleOrders ?? 0,
        byPerson: (store?.byPerson ?? []).map((p) => ({
          name: p.name,
          sales: p.sales,
          orders: p.orders,
          percentageOfSmartSale: p.percentage,
        })),
        storeTotalSales: store?.storeTotalSales ?? 0,
      };
    }

    const byPersonTotals = new Map<string, { sales: number; orders: number }>();
    let totalSmartSaleSales = 0;
    let totalSmartSaleOrders = 0;
    for (const store of Object.values(summaryByStore)) {
      totalSmartSaleSales += store.smartSaleSales;
      totalSmartSaleOrders += store.smartSaleOrders;
      for (const person of store.byPerson) {
        const entry = byPersonTotals.get(person.name) ?? { sales: 0, orders: 0 };
        entry.sales += person.sales;
        entry.orders += person.orders;
        byPersonTotals.set(person.name, entry);
      }
    }

    const byPerson: SmartSalePersonRow[] = Array.from(byPersonTotals.entries())
      .map(([name, v]) => ({
        name,
        sales: v.sales,
        orders: v.orders,
        percentageOfSmartSale: totalSmartSaleSales > 0 ? Number(((v.sales / totalSmartSaleSales) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.sales - a.sales);

    return { startDay, endDay, storeId: null, totalSmartSaleSales, totalSmartSaleOrders, byPerson, storeTotalSales: null };
  }
}
