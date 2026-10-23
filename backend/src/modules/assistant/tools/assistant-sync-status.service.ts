import { Injectable } from '@nestjs/common';

import { CreditNotesRepository } from '../../database/repositories/credit-notes.repository';
import { SyncLogsRepository } from '../../database/repositories/sync-logs.repository';

export interface StoreSyncStatus {
  storeId: string;
  vtexLastSyncedAt: string | null;
  vtexLastSyncStatus: 'success' | 'error' | 'partial' | null;
  ga4LastSyncedAt: string | null;
  ga4LastSyncStatus: 'success' | 'error' | 'partial' | null;
}

export interface SyncStatusResult {
  byStore: StoreSyncStatus[];
  /** Última sincronización manual de notas crédito (todas las marcas a la vez — no se rastrea por tienda en `sync_logs`). */
  creditNotesLastSyncedAt: string | null;
}

/**
 * Herramienta `get_sync_status` — combina el estado de las dos fuentes que
 * SÍ tienen fila en `sync_logs` (VTEX/GA4) más el único indicador que tiene
 * notas crédito (`MAX(synced_at)`, ver `CreditNotesRepository.getLastSyncedAt`).
 * El presupuesto no aparece acá: es 100% manual, sin ningún concepto de
 * "sincronización".
 */
@Injectable()
export class AssistantSyncStatusService {
  constructor(
    private readonly syncLogsRepository: SyncLogsRepository,
    private readonly creditNotesRepository: CreditNotesRepository,
  ) {}

  async getSyncStatus(): Promise<SyncStatusResult> {
    const [vtexStatus, ga4Status, creditNotesLastSyncedAt] = await Promise.all([
      this.syncLogsRepository.getLatestStatusByStore('vtex_api'),
      this.syncLogsRepository.getLatestStatusByStore('ga4_api'),
      this.creditNotesRepository.getLastSyncedAt(),
    ]);

    const storeIds = new Set([...Object.keys(vtexStatus), ...Object.keys(ga4Status)]);
    const byStore: StoreSyncStatus[] = Array.from(storeIds)
      .sort()
      .map((storeId) => ({
        storeId,
        vtexLastSyncedAt: vtexStatus[storeId]?.lastSyncedAt ?? null,
        vtexLastSyncStatus: vtexStatus[storeId]?.lastSyncStatus ?? null,
        ga4LastSyncedAt: ga4Status[storeId]?.lastSyncedAt ?? null,
        ga4LastSyncStatus: ga4Status[storeId]?.lastSyncStatus ?? null,
      }));

    return { byStore, creditNotesLastSyncedAt };
  }
}
