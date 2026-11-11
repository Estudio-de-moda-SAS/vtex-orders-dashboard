import { Injectable } from '@nestjs/common';

import { buildMarginSummary } from '../../../common/utils/erp-margin.util';
import { buildCombinedMonthlyTrend, combinedCategoryKey, mergeCombinedTipos, stripErpCategoryCode } from '../../../common/utils/smartsale-combined.util';
import { getGrowthThresholds } from '../../../config/growth-thresholds.config';
import { getStoresConfig } from '../../../config/stores.config';
import { ErpSalesQueryService } from '../../erp-sales/erp-sales-query.service';
import { PosSalesQueryService } from '../../pos-sales/pos-sales-query.service';
import {
  SmartSaleCombinedCategoryBreakdown,
  SmartSaleCombinedMonthlyTrendPoint,
  SmartSaleCombinedPersonBreakdown,
  SmartSaleCombinedStoreSummary,
  SmartSaleCombinedSummaryResponse,
} from '../interfaces/smartsale-combined.interface';
import { classifyMonthlyGrowth } from './smartsale.service';

function emptyPerson(name: string): SmartSaleCombinedPersonBreakdown {
  return {
    name,
    erpOrders: 0,
    erpSales: 0,
    posOrders: 0,
    posSales: 0,
    erpUnits: 0,
    posUnits: 0,
    totalSales: 0,
    totalOrders: 0,
    totalUnits: 0,
  };
}

/** Rellena `totalSales`/`totalOrders`/`totalUnits` — se llama SIEMPRE justo antes de devolver un `SmartSaleCombinedPersonBreakdown`, nunca a mitad de una acumulación (ver comentario del campo en la interfaz). */
function finalizePerson(p: SmartSaleCombinedPersonBreakdown): SmartSaleCombinedPersonBreakdown {
  return {
    ...p,
    totalSales: p.erpSales + p.posSales,
    totalOrders: p.erpOrders + p.posOrders,
    totalUnits: p.erpUnits + p.posUnits,
  };
}

function bySalesDesc(a: SmartSaleCombinedPersonBreakdown, b: SmartSaleCombinedPersonBreakdown): number {
  return b.erpSales + b.posSales - (a.erpSales + a.posSales);
}

/**
 * "Resumen" de `/smartsale`: combina POS (`PosSalesQueryService`,
 * vendedor por `nit_vendedor`) con ERP (`ErpSalesQueryService`, facturas
 * de los vendedores SmartSale por `codigo_vendedor`). Antes combinaba
 * VTEX + POS — VTEX era un acercamiento hasta tener ERP (cambio pedido por
 * el usuario en nov-2026; la pestaña "Ventas VTEX" sigue existiendo aparte).
 *
 * Reusa TAL CUAL los cálculos de cada servicio; solo suma y empareja por
 * NOMBRE amigable ("Juana Pinilla", "Felipe Rengifo" — idénticos en
 * `pos-sales.util.ts` y `erp-sales.util.ts`). La venta ERP es la TOTAL
 * (incluye fletes y empaque, sin desglose aquí — decisión del usuario).
 * Lo usan también la pestaña Presupuesto de `/smartsale` y Vico
 * (`get_smartsale_sales`, `get_smartsale_budget_vs_actual`).
 */
@Injectable()
export class SmartSaleCombinedService {
  private readonly storeIds = getStoresConfig().map((s) => s.id);

  constructor(
    private readonly posSalesQueryService: PosSalesQueryService,
    private readonly erpSalesQueryService: ErpSalesQueryService,
  ) {}

  async getCombinedSummary(startDate: string, endDate: string): Promise<SmartSaleCombinedSummaryResponse> {
    const [erpSummary, posSummary, erpCoverageStartDay, marginInput, posCreditNotesByStore] = await Promise.all([
      // NETO de notas crédito (decisión del usuario): POS ya llega neto, ERP se pide neto para que el total cuadre.
      this.erpSalesQueryService.getSmartSaleSummary(startDate, endDate, { net: true }),
      this.posSalesQueryService.getSummary(startDate, endDate),
      this.erpSalesQueryService.getCoverageStartDay(),
      this.erpSalesQueryService.getSmartSaleMarginInput(startDate, endDate),
      this.posSalesQueryService.getCreditNotesByStore(startDate, endDate),
    ]);
    const posByStoreId = new Map(posSummary.byStore.map((s) => [s.storeId, s]));
    const erpByStoreId = new Map(erpSummary.byStore.map((s) => [s.storeId, s]));

    let totalErpOrders = 0;
    let totalErpSales = 0;
    let totalPosOrders = 0;
    let totalPosSales = 0;
    let totalErpUnits = 0;
    let totalPosUnits = 0;
    const sellerTotals = new Map<string, SmartSaleCombinedPersonBreakdown>();

    const byStore: SmartSaleCombinedStoreSummary[] = this.storeIds.map((storeId) => {
      const erp = erpByStoreId.get(storeId);
      const pos = posByStoreId.get(storeId);
      const erpOrders = erp?.invoices ?? 0;
      const erpSales = erp?.total ?? 0;
      const posOrders = pos?.orders ?? 0;
      const posSales = pos?.sales ?? 0;
      const erpUnits = erp?.units ?? 0;
      const posUnits = pos?.units ?? 0;
      totalErpOrders += erpOrders;
      totalErpSales += erpSales;
      totalPosOrders += posOrders;
      totalPosSales += posSales;
      totalErpUnits += erpUnits;
      totalPosUnits += posUnits;

      const byPersonMap = new Map<string, SmartSaleCombinedPersonBreakdown>();
      for (const person of erp?.bySeller ?? []) {
        byPersonMap.set(person.name, {
          ...emptyPerson(person.name),
          erpOrders: person.invoices,
          erpSales: person.total,
          erpUnits: person.units,
        });
      }
      for (const person of pos?.bySeller ?? []) {
        const entry = byPersonMap.get(person.name) ?? emptyPerson(person.name);
        entry.posOrders = person.orders;
        entry.posSales = person.sales;
        entry.posUnits = person.units;
        byPersonMap.set(person.name, entry);
      }
      const byPerson = Array.from(byPersonMap.values()).sort(bySalesDesc).map(finalizePerson);

      for (const person of byPerson) {
        const total = sellerTotals.get(person.name) ?? emptyPerson(person.name);
        total.erpOrders += person.erpOrders;
        total.erpSales += person.erpSales;
        total.posOrders += person.posOrders;
        total.posSales += person.posSales;
        total.erpUnits += person.erpUnits;
        total.posUnits += person.posUnits;
        sellerTotals.set(person.name, total);
      }

      return {
        storeId,
        erpOrders,
        erpSales,
        posOrders,
        posSales,
        erpUnits,
        posUnits,
        totalSales: erpSales + posSales,
        totalOrders: erpOrders + posOrders,
        totalUnits: erpUnits + posUnits,
        byPerson,
      };
    });

    const bySeller = Array.from(sellerTotals.values()).sort(bySalesDesc).map(finalizePerson);
    const byCategory = this.buildCombinedCategories(erpSummary.byCategory, posSummary.byCategory);

    return {
      filters: { startDate, endDate },
      totalErpOrders,
      totalErpSales,
      totalPosOrders,
      totalPosSales,
      totalErpUnits,
      totalPosUnits,
      totalSales: totalErpSales + totalPosSales,
      totalOrders: totalErpOrders + totalPosOrders,
      totalUnits: totalErpUnits + totalPosUnits,
      byStore,
      bySeller,
      byCategory,
      erpCoverageStartDay,
      margin: buildMarginSummary(marginInput.rows, this.storeIds),
      posMarginCoverage: { posDocuments: totalPosOrders, posDocumentsWithMargin: marginInput.posDocumentsWithMargin },
      byTipo: mergeCombinedTipos(posSummary.byTipo, erpSummary.byTipo),
      creditNotes: this.buildCreditNotes(erpSummary, posCreditNotesByStore),
      byStoreTipo: this.storeIds.map((storeId) => ({
        storeId,
        byTipo: mergeCombinedTipos(
          posSummary.byStoreTipo.find((s) => s.storeId === storeId)?.byTipo ?? [],
          erpSummary.byStoreTipo.find((s) => s.storeId === storeId)?.byTipo ?? [],
        ),
      })),
    };
  }

  /**
   * Cuadro "Notas crédito" del Resumen: POS (NPE, ya restadas en la venta
   * POS) + ERP (NVF de SmartSale, restadas en la venta ERP neta), por
   * tienda y total. Valores negativos, tal cual el ERP.
   */
  private buildCreditNotes(
    erpSummary: { byStore: { storeId: string; creditNotes: { count: number; value: number } }[] },
    posByStore: { storeId: string; count: number; value: number }[],
  ): SmartSaleCombinedSummaryResponse['creditNotes'] {
    const byStore = this.storeIds.map((storeId) => {
      const erp = erpSummary.byStore.find((s) => s.storeId === storeId)?.creditNotes ?? { count: 0, value: 0 };
      const pos = posByStore.find((s) => s.storeId === storeId) ?? { count: 0, value: 0 };
      return { storeId, posCount: pos.count, posValue: pos.value, erpCount: erp.count, erpValue: erp.value, totalCount: pos.count + erp.count, totalValue: pos.value + erp.value };
    });
    const sum = (k: keyof (typeof byStore)[number]) => byStore.reduce((a, s) => a + (s[k] as number), 0);
    return {
      byStore,
      total: {
        posCount: sum('posCount'),
        posValue: sum('posValue'),
        erpCount: sum('erpCount'),
        erpValue: sum('erpValue'),
        totalCount: sum('totalCount'),
        totalValue: sum('totalValue'),
      },
    };
  }

  /**
   * Categorías POS + ERP — ambas vienen del mismo ERP; las de facturas
   * solo anteponen el código ("101B - CAMISETA M/C"), así que se agrupan
   * por `combinedCategoryKey` y se muestran con el nombre sin código.
   * Solo líneas de producto (POS ya excluye fletes; ERP también empaque).
   */
  private buildCombinedCategories(
    erpByCategory: { categoria: string; units: number; total: number }[],
    posByCategory: { categoria: string; units: number; sales: number }[],
  ): SmartSaleCombinedCategoryBreakdown[] {
    const byKey = new Map<string, SmartSaleCombinedCategoryBreakdown>();
    const entryFor = (rawName: string): SmartSaleCombinedCategoryBreakdown => {
      const key = combinedCategoryKey(rawName);
      const existing = byKey.get(key);
      if (existing) return existing;
      const created = { category: stripErpCategoryCode(rawName), erpUnits: 0, erpSales: 0, posUnits: 0, posSales: 0, totalSales: 0, totalUnits: 0 };
      byKey.set(key, created);
      return created;
    };

    for (const pos of posByCategory) {
      const entry = entryFor(pos.categoria);
      entry.posUnits += pos.units;
      entry.posSales += pos.sales;
    }
    for (const erp of erpByCategory) {
      const entry = entryFor(erp.categoria);
      entry.erpUnits += erp.units;
      entry.erpSales += erp.total;
    }

    return Array.from(byKey.values())
      .map((entry) => ({ ...entry, totalSales: entry.erpSales + entry.posSales, totalUnits: entry.erpUnits + entry.posUnits }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  /**
   * Un punto por mes del año en curso, POS + ERP. Los meses anteriores al
   * primer mes con ERP sincronizado salen solo con POS y SIN % de
   * crecimiento (`erpAvailable: false`) — comparar contra ellos inflaría
   * el crecimiento (opción A elegida por el usuario: se completan cuando
   * llegue el histórico ERP por Excel). Ver `buildCombinedMonthlyTrend`.
   */
  async getCombinedMonthlyTrend(): Promise<SmartSaleCombinedMonthlyTrendPoint[]> {
    const [posMonths, erpTrend] = await Promise.all([
      this.posSalesQueryService.getMonthlyTrend(),
      this.erpSalesQueryService.getSmartSaleMonthlyTrend(),
    ]);
    const thresholds = getGrowthThresholds();
    return buildCombinedMonthlyTrend(posMonths, erpTrend.months, erpTrend.coverageStartMonth, (current, prior) =>
      classifyMonthlyGrowth(current, prior, thresholds),
    );
  }
}
