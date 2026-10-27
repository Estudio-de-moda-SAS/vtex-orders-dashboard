import { Injectable, Logger } from '@nestjs/common';

import { isPosCreditNoteDoc, isPosFreightLine, resolvePosStoreIdFromMarca } from '../../common/utils/pos-sales.util';
import { PosSaleDbRow, PosSalesRepository } from '../database/repositories/pos-sales.repository';
import { PosSalesClientService } from './pos-sales-client.service';
import { PosSaleApiRow } from './pos-sales.interface';

/** "2026-10-04T00:00:00" (o completo) → "2026-10-04". */
function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

function toDbRow(row: PosSaleApiRow): PosSaleDbRow {
  const referencia = (row.referencia ?? '').trim();
  return {
    fecha: toDateOnly(row.fecha),
    co: row.co ?? null,
    nroDocumento: row.nro_documento,
    tipoDocto: row.tipo_docto,
    idTipo: row.id_tipo ?? null,
    tipo: row.tipo ?? null,
    idCategoria: row.id_categoria ?? null,
    categoria: row.categoria ?? null,
    idMarca: row.id_marca ?? null,
    marca: row.marca,
    storeId: resolvePosStoreIdFromMarca(row.marca),
    idItem: row.id_item ?? null,
    referencia: row.referencia ?? null,
    descripcionItem: row.descripcion_item ?? null,
    nitVendedor: row.nit_vendedor ?? null,
    nombreVendedor: row.nombre_vendedor ?? null,
    cantidadInv: row.cantidad_inv ?? null,
    valorBruto: row.valor_bruto ?? null,
    valorDescuento: row.valor_descuento ?? null,
    valorNeto: row.valor_neto ?? 0,
    isFreight: isPosFreightLine(referencia),
    isCreditNote: isPosCreditNoteDoc(row.tipo_docto),
  };
}

/**
 * Orquesta UNA sincronización de ventas POS: consulta la API del ERP
 * (requiere VPN, ver `PosSalesClientService`) y REEMPLAZA el rango de
 * fechas en `pos_sales` (ver `PosSalesRepository.replaceRange` — esta API
 * no trae un id de fila estable como notas crédito, así que no hay upsert
 * por llave). Pensado para correr desde `cli/pos-sales-sync.ts` (manual o
 * programado en una máquina conectada a la VPN), nunca desde el cron del
 * backend desplegado.
 */
@Injectable()
export class PosSalesSyncService {
  private readonly logger = new Logger(PosSalesSyncService.name);

  constructor(
    private readonly client: PosSalesClientService,
    private readonly repository: PosSalesRepository,
  ) {}

  /** `fromDay`/`toDay` en "YYYY-MM-DD". Devuelve cuántas líneas se guardaron. */
  async syncRange(fromDay: string, toDay: string): Promise<number> {
    const apiRows = await this.client.fetchRange(fromDay, toDay);
    const dbRows = apiRows.map(toDbRow);
    await this.repository.replaceRange(fromDay, toDay, dbRows);
    this.logger.log(`Ventas POS ${fromDay} → ${toDay}: ${dbRows.length} línea(s) guardada(s).`);
    return dbRows.length;
  }
}
