import { Injectable } from '@nestjs/common';

import { CreditNotesRepository } from '../../database/repositories/credit-notes.repository';
import { CreditNotesQueryService } from '../../credit-notes/credit-notes-query.service';
import { CreditNotesSummaryResponse } from '../../credit-notes/credit-notes.interface';

export interface AssistantCreditNotesResult extends CreditNotesSummaryResponse {
  meta: {
    /** Última vez que se corrió el sync manual (`cli/credit-notes-sync.ts`) para esta marca — `null` si nunca. */
    lastSyncedAt: string | null;
  };
  warnings: string[];
}

/**
 * Herramienta `get_credit_notes` — delgada a propósito: reusa
 * `CreditNotesQueryService.getSummary` tal cual (ya filtra por tienda, ya
 * trae `totalSalesValue`) y solo agrega `meta.lastSyncedAt` +
 * `warnings` cuando el dato puede estar desactualizado (notas crédito se
 * sincronizan a mano desde una máquina con VPN, no en vivo — ver README).
 */
@Injectable()
export class AssistantCreditNotesService {
  constructor(
    private readonly queryService: CreditNotesQueryService,
    private readonly repository: CreditNotesRepository,
  ) {}

  async getCreditNotes(startDay: string, endDay: string, storeId?: string): Promise<AssistantCreditNotesResult> {
    const [summary, lastSyncedAt] = await Promise.all([
      this.queryService.getSummary(startDay, endDay, storeId),
      this.repository.getLastSyncedAt(storeId),
    ]);

    const warnings: string[] = [];
    // `pg` devuelve TIMESTAMPTZ como `Date` (no hay type parser custom registrado,
    // ver `pg-pool.provider.ts`) aunque el tipo declarado diga `string` — `new Date(...)`
    // normaliza ambos casos (Date o string ISO) antes de recortar al día.
    const lastSyncedDay = lastSyncedAt ? new Date(lastSyncedAt).toISOString().slice(0, 10) : null;
    if (!lastSyncedDay) {
      warnings.push('Nunca se ha sincronizado notas crédito para este filtro — estos totales son 0 porque no hay dato, no porque no haya habido notas crédito.');
    } else if (lastSyncedDay < endDay) {
      warnings.push(
        `Las notas crédito solo están sincronizadas hasta el ${lastSyncedDay} — el resto del rango pedido (hasta ${endDay}) puede estar incompleto.`,
      );
    }

    return { ...summary, meta: { lastSyncedAt }, warnings };
  }
}
