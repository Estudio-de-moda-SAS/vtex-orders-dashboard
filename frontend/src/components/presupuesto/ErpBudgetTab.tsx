'use client';

import { ordersService } from '@/services/orders.service';

import { ChannelBudgetConfig, ChannelBudgetTab } from './VtexBudgetTab';

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Venta ERP = facturas e-commerce del ERP ("Conní"), ya sincronizadas en
 * Supabase por `npm run daily-sync` (requiere VPN). El backend ya descarta
 * notas crédito (NVF), el CO 810 y los vendedores SmartSale (082P/168A).
 * El presupuesto se mide contra el TOTAL (incluye fletes y empaque).
 */
const ERP_CONFIG: ChannelBudgetConfig = {
  channel: 'erp',
  label: 'ERP',
  intro: 'Presupuesto mensual por marca, ERP (facturas de las tiendas virtuales)',
  comparisonDescription:
    'Venta facturada en el ERP (valor neto con IVA, sin notas crédito ni SmartSale) contra el presupuesto del rango elegido — y, si el rango cae dentro de un solo mes, también contra la meta del mes completo. El cumplimiento se mide contra la venta total, que incluye fletes y material de empaque.',
  dateStorageKey: 'vica-presupuesto-erp-comparison-range',
  cacheKeyPrefix: 'presupuesto-erp-comparison:v1',
  fetchSales: async (startDate, endDate) => {
    const res = await ordersService.getErpSalesSummary(startDate, endDate);
    const notice =
      res.lastDataDay === null
        ? 'Todavía no hay facturas ERP sincronizadas — corre el sync diario desde un equipo con VPN.'
        : res.lastDataDay < res.filters.endDate
          ? `Facturas ERP sincronizadas hasta el ${dayLabel(res.lastDataDay)} — los días posteriores del rango aún no tienen datos.`
          : null;
    return {
      channelTotal: res.channel.total,
      storeTotals: Object.fromEntries(res.byStore.map((s) => [s.storeId, s.total])),
      breakdown: {
        channel: res.channel,
        stores: Object.fromEntries(res.byStore.map((s) => [s.storeId, s])),
      },
      notice,
    };
  },
};

export function ErpBudgetTab() {
  return <ChannelBudgetTab config={ERP_CONFIG} />;
}
