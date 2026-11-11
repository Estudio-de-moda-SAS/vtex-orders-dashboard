import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { classifyErpLine, erpExclusionReason, resolveErpStoreIdFromCo, splitIntoDayChunks } from '../../common/utils/erp-sales.util';
import { AppConfig } from '../../config/configuration';
import { ErpSaleDbRow, ErpSalesRepository } from '../database/repositories/erp-sales.repository';
import { ErpSalesClientService, ErpSalesTimeoutError } from './erp-sales-client.service';
import { ErpSaleApiRow, ErpSalesSyncResult } from './erp-sales.interface';

/** Reintentos por tramo cuando el ERP no responde a tiempo (la consulta es pesada). */
const TIMEOUT_RETRIES = 1;

function toDbRow(row: ErpSaleApiRow, storeId: string): ErpSaleDbRow {
  return {
    fecha: row.fecha.slice(0, 10),
    co: (row.co ?? '').trim(),
    descCo: row.desc_co ?? null,
    storeId,
    nroDocumento: row.nro_documento,
    doctoReferencia: row.docto_referencia ?? null,
    doctoRemision: row.docto_remision ?? null,
    codigoVendedor: row.codigo_vendedor ?? null,
    estadoDocto: row.estado_docto ?? null,
    clienteFactura: row.cliente_factura ?? null,
    bodega: row.bodega ?? null,
    item: row.item ?? null,
    referencia: row.referencia ?? null,
    descItem: row.desc_item ?? null,
    cantidad: row.cantidad ?? null,
    valorNeto: row.valor_neto ?? 0,
    valorBruto: row.valor_bruto ?? null,
    valorDescuentos: row.valor_descuentos ?? null,
    valorImpuestos: row.valor_impuestos ?? null,
    valorSubtotal: row.valor_subtotal ?? null,
    marca: row.marca ?? null,
    categoria: row.categoria ?? null,
    tipo: row.tipo ?? null,
    costoPromedioTotal: row.costo_promedio_total ?? null,
    utilidadPromedio: row.utilidad_promedio ?? null,
    pedidoVtex: row.pedido_vtex ?? null,
    lineKind: classifyErpLine(row.desc_item, row.tipo),
  };
}

/**
 * Sincroniza facturas e-commerce del ERP (requiere VPN) → `erp_sales`.
 * Cualquier rango se pide en tramos de `chunkDays` días (3 por defecto) y
 * cada tramo se guarda apenas llega, así un fallo a mitad de camino no
 * pierde lo ya sincronizado. Solo se guardan las líneas que cuentan como
 * venta de la tienda virtual (`erpExclusionReason`); lo descartado se
 * reporta contado por motivo.
 */
@Injectable()
export class ErpSalesSyncService {
  private readonly logger = new Logger(ErpSalesSyncService.name);

  constructor(
    private readonly client: ErpSalesClientService,
    private readonly repository: ErpSalesRepository,
    private readonly configService: ConfigService,
  ) {}

  async syncRange(fromDay: string, toDay: string, onChunk?: (msg: string) => void): Promise<ErpSalesSyncResult> {
    const { chunkDays } = this.configService.get<AppConfig['erpSales']>('app.erpSales')!;
    const result: ErpSalesSyncResult = { saved: 0, excluded: {} };

    for (const chunk of splitIntoDayChunks(fromDay, toDay, chunkDays)) {
      const apiRows = await this.fetchWithRetry(chunk.start, chunk.end);
      const dbRows: ErpSaleDbRow[] = [];
      for (const row of apiRows) {
        const reason = erpExclusionReason(row);
        if (reason) {
          result.excluded[reason] = (result.excluded[reason] ?? 0) + 1;
          continue;
        }
        dbRows.push(toDbRow(row, resolveErpStoreIdFromCo(row.co)!));
      }
      await this.repository.replaceRange(chunk.start, chunk.end, dbRows);
      result.saved += dbRows.length;
      const msg = `Facturas ERP ${chunk.start} → ${chunk.end}: ${apiRows.length} recibida(s), ${dbRows.length} guardada(s).`;
      this.logger.log(msg);
      onChunk?.(msg);
    }
    return result;
  }

  private async fetchWithRetry(fromDay: string, toDay: string): Promise<ErpSaleApiRow[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.fetchRange(fromDay, toDay);
      } catch (error) {
        if (error instanceof ErpSalesTimeoutError && attempt < TIMEOUT_RETRIES) {
          this.logger.warn(`Timeout en ${fromDay} → ${toDay}, reintentando...`);
          continue;
        }
        throw error;
      }
    }
  }
}
