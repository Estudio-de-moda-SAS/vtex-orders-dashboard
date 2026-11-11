import { Injectable } from '@nestjs/common';

import { normalizeEndDate, normalizeStartDate, toDayBucketColombia } from '../../common/utils/date-range.util';
import { getStoresConfig } from '../../config/stores.config';
import { ErpSalesRepository } from '../database/repositories/erp-sales.repository';
import { ErpSalesBreakdown, ErpSalesSummaryResponse } from './erp-sales.interface';

function emptyBreakdown(): ErpSalesBreakdown {
  return { total: 0, freight: 0, packaging: 0, product: 0, invoices: 0, units: 0 };
}

/** Lectura SQL pura sobre `erp_sales` — nunca llama a la API del ERP en vivo (eso es solo del sync por VPN). */
@Injectable()
export class ErpSalesQueryService {
  constructor(private readonly repository: ErpSalesRepository) {}

  async getSummary(rawStartDate: string, rawEndDate: string): Promise<ErpSalesSummaryResponse> {
    const startDay = toDayBucketColombia(normalizeStartDate(rawStartDate));
    const endDay = toDayBucketColombia(normalizeEndDate(rawEndDate));

    const [rows, syncInfo] = await Promise.all([this.repository.getTotalsByStore(startDay, endDay), this.repository.getSyncInfo()]);

    const byStore = getStoresConfig().map((store) => {
      const row = rows.find((r) => r.storeId === store.id);
      return { storeId: store.id, ...(row ? { ...row, storeId: store.id } : emptyBreakdown()) };
    });

    const channel = byStore.reduce<ErpSalesBreakdown>((acc, s) => {
      acc.total += s.total;
      acc.freight += s.freight;
      acc.packaging += s.packaging;
      acc.product += s.product;
      acc.invoices += s.invoices;
      acc.units += s.units;
      return acc;
    }, emptyBreakdown());

    return { filters: { startDate: startDay, endDate: endDay }, channel, byStore, ...syncInfo };
  }
}
