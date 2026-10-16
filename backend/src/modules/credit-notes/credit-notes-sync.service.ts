import { Injectable, Logger } from '@nestjs/common';

import { resolveStoreIdFromMarca } from '../../common/utils/credit-notes.util';
import { getStoresConfig } from '../../config/stores.config';
import { CreditNoteDbRow, CreditNotesRepository } from '../database/repositories/credit-notes.repository';
import { CreditNotesClientService } from './credit-notes-client.service';
import { CreditNoteApiRow } from './credit-notes.interface';

/** "2026-09-25T00:00:00" (o completo) → "2026-09-25". `null` si viene vacío/indefinido. */
function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function toApiRowDbRow(row: CreditNoteApiRow, storeId: string | null): CreditNoteDbRow {
  return {
    rowidNc: row.rowid_nc,
    notaCredito: row.nota_credito,
    fechaNc: toDateOnly(row.fecha_nc)!,
    fechaCreacionNc: row.fecha_creacion_nc ?? null,
    idCia: row.id_cia ?? null,
    idCo: row.id_co ?? null,
    tienda: row.tienda ?? null,
    marca: row.marca,
    storeId,
    facturaErp: row.factura_erp ?? null,
    fechaFactura: toDateOnly(row.fecha_factura),
    vlrNetoFactura: row.vlr_neto_factura ?? null,
    pedidoErp: row.pedido_erp ?? null,
    ordenVtex: row.orden_vtex ?? null,
    razonNc: row.razon_nc ?? null,
    vlrBruto: row.vlr_bruto ?? null,
    vlrDscto: row.vlr_dscto ?? null,
    vlrImpuestos: row.vlr_impuestos ?? null,
    vlrNeto: row.vlr_neto ?? 0,
    totalNcFactura: row.total_nc_factura ?? null,
  };
}

/**
 * Orquesta UNA sincronización de notas crédito: consulta la API del ERP
 * (requiere VPN, ver `CreditNotesClientService`) y guarda/actualiza en
 * `credit_notes`. Pensado para correr desde `cli/credit-notes-sync.ts`
 * (manual o programado en una máquina conectada a la VPN) — nunca desde
 * el cron normal del backend desplegado.
 */
@Injectable()
export class CreditNotesSyncService {
  private readonly logger = new Logger(CreditNotesSyncService.name);

  constructor(
    private readonly client: CreditNotesClientService,
    private readonly repository: CreditNotesRepository,
  ) {}

  /** `fromDay`/`toDay` en "YYYY-MM-DD". Devuelve cuántas notas crédito se guardaron/actualizaron. */
  async syncRange(fromDay: string, toDay: string): Promise<number> {
    const storeNames = getStoresConfig().map((s) => ({ id: s.id, name: s.name }));
    const apiRows = await this.client.fetchRange(fromDay, toDay);

    const dbRows = apiRows.map((row) => toApiRowDbRow(row, resolveStoreIdFromMarca(row.marca, storeNames)));
    await this.repository.upsertMany(dbRows);

    this.logger.log(`Notas crédito ${fromDay} → ${toDay}: ${dbRows.length} fila(s) guardada(s)/actualizada(s).`);
    return dbRows.length;
  }
}
