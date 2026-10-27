import { Injectable } from '@nestjs/common';

import { getGrowthThresholds } from '../../../config/growth-thresholds.config';
import { getStoresConfig } from '../../../config/stores.config';
import { PosSalesQueryService } from '../../pos-sales/pos-sales-query.service';
import {
  SmartSaleCombinedMonthlyTrendPoint,
  SmartSaleCombinedPersonBreakdown,
  SmartSaleCombinedStoreSummary,
  SmartSaleCombinedSummaryResponse,
} from '../interfaces/smartsale-combined.interface';
import { classifyMonthlyGrowth, SmartSaleService } from './smartsale.service';

function emptyPerson(name: string): SmartSaleCombinedPersonBreakdown {
  return { name, vtexOrders: 0, vtexSales: 0, posOrders: 0, posSales: 0 };
}

function combinedSales(p: SmartSaleCombinedPersonBreakdown): number {
  return p.vtexSales + p.posSales;
}

/**
 * Combina el canal SmartSale de VTEX (`SmartSaleService`, atribución por
 * `utmiCampaign`) con el de POS (`PosSalesQueryService`, atribución por
 * `nit_vendedor`) — para la pestaña "Resumen" de `/smartsale`. Reusa
 * TAL CUAL los cálculos ya hechos por cada servicio (nunca reimplementa
 * la lectura de `smartsale_daily_by_person`/`pos_sales`); solo suma y
 * empareja por nombre. El emparejamiento por NOMBRE (no por id, que son
 * distintos en cada sistema: `utmiCampaign` vs. `nit_vendedor`) funciona
 * porque los nombres "amigables" de ambos lados coinciden exactamente
 * para los vendedores que venden por los dos canales (confirmado:
 * "Felipe Rengifo", "Juana Pinilla") — un vendedor nuevo en un solo canal
 * simplemente aparece con `0` del lado que no le aplica.
 */
@Injectable()
export class SmartSaleCombinedService {
  private readonly storeIds = getStoresConfig().map((s) => s.id);

  constructor(
    private readonly smartSaleService: SmartSaleService,
    private readonly posSalesQueryService: PosSalesQueryService,
  ) {}

  async getCombinedSummary(startDate: string, endDate: string): Promise<SmartSaleCombinedSummaryResponse> {
    const [vtexByStore, posSummary] = await Promise.all([
      this.smartSaleService.getSummary(startDate, endDate),
      this.posSalesQueryService.getSummary(startDate, endDate),
    ]);
    const posByStoreId = new Map(posSummary.byStore.map((s) => [s.storeId, s]));

    let totalVtexOrders = 0;
    let totalVtexSales = 0;
    let totalPosOrders = 0;
    let totalPosSales = 0;
    const sellerTotals = new Map<string, SmartSaleCombinedPersonBreakdown>();

    const byStore: SmartSaleCombinedStoreSummary[] = this.storeIds.map((storeId) => {
      const vtex = vtexByStore[storeId];
      const pos = posByStoreId.get(storeId);
      const vtexOrders = vtex?.smartSaleOrders ?? 0;
      const vtexSales = vtex?.smartSaleSales ?? 0;
      const posOrders = pos?.orders ?? 0;
      const posSales = pos?.sales ?? 0;
      totalVtexOrders += vtexOrders;
      totalVtexSales += vtexSales;
      totalPosOrders += posOrders;
      totalPosSales += posSales;

      const byPersonMap = new Map<string, SmartSaleCombinedPersonBreakdown>();
      for (const person of vtex?.byPerson ?? []) {
        byPersonMap.set(person.name, { ...emptyPerson(person.name), vtexOrders: person.orders, vtexSales: person.sales });
      }
      for (const person of pos?.bySeller ?? []) {
        const entry = byPersonMap.get(person.name) ?? emptyPerson(person.name);
        entry.posOrders = person.orders;
        entry.posSales = person.sales;
        byPersonMap.set(person.name, entry);
      }
      const byPerson = Array.from(byPersonMap.values()).sort((a, b) => combinedSales(b) - combinedSales(a));

      for (const person of byPerson) {
        const total = sellerTotals.get(person.name) ?? emptyPerson(person.name);
        total.vtexOrders += person.vtexOrders;
        total.vtexSales += person.vtexSales;
        total.posOrders += person.posOrders;
        total.posSales += person.posSales;
        sellerTotals.set(person.name, total);
      }

      return { storeId, vtexOrders, vtexSales, posOrders, posSales, byPerson };
    });

    const bySeller = Array.from(sellerTotals.values()).sort((a, b) => combinedSales(b) - combinedSales(a));

    return {
      filters: { startDate, endDate },
      totalVtexOrders,
      totalVtexSales,
      totalPosOrders,
      totalPosSales,
      byStore,
      bySeller,
    };
  }

  /**
   * Un punto por mes, año en curso — eje de meses tomado de VTEX (el canal
   * con más historia; POS arrancó el mismo mes de lanzamiento, así que en
   * la práctica coinciden). El % de crecimiento se recalcula sobre el
   * total COMBINADO de cada mes (nunca reusa el `growthPercent` ya
   * calculado por `SmartSaleService`, que es solo del lado VTEX).
   */
  async getCombinedMonthlyTrend(): Promise<SmartSaleCombinedMonthlyTrendPoint[]> {
    const [vtexMonths, posMonths] = await Promise.all([
      this.smartSaleService.getMonthlyTrend(),
      this.posSalesQueryService.getMonthlyTrend(),
    ]);
    const posByMonth = new Map(posMonths.map((m) => [m.month, m]));
    const thresholds = getGrowthThresholds();
    let priorSales: number | null = null;

    return vtexMonths.map((vtex, index) => {
      const pos = posByMonth.get(vtex.month);
      const vtexSales = vtex.sales;
      const posSales = pos?.sales ?? 0;
      const sales = vtexSales + posSales;
      const orders = vtex.orders + (pos?.orders ?? 0);
      const { growthPercent, status } = classifyMonthlyGrowth(sales, index === 0 ? null : priorSales, thresholds);
      priorSales = sales;
      return { month: vtex.month, vtexSales, posSales, sales, orders, growthPercent, status };
    });
  }
}
