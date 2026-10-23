import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { CreditNotesClientService } from './credit-notes-client.service';
import { CreditNotesQueryController } from './credit-notes-query.controller';
import { CreditNotesQueryService } from './credit-notes-query.service';
import { CreditNotesSyncService } from './credit-notes-sync.service';

/**
 * Notas crédito (API "Conní" del ERP) — desacoplado de `OrdersModule`/VTEX
 * a propósito, mismo criterio que `AnalyticsGaModule`. `CreditNotesSyncService`
 * se exporta para que `cli/credit-notes-sync.ts` lo use directo — nunca se
 * dispara desde un cron del backend desplegado (no tiene cómo alcanzar la
 * VPN de la compañía, ver `CreditNotesClientService`). `CreditNotesQueryService`
 * se exporta para que `AssistantModule` reutilice `getSummary` (herramienta
 * `get_credit_notes`) en vez de reimplementar la lectura de `credit_notes`.
 */
@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [CreditNotesQueryController],
  providers: [CreditNotesClientService, CreditNotesSyncService, CreditNotesQueryService],
  exports: [CreditNotesClientService, CreditNotesSyncService, CreditNotesQueryService],
})
export class CreditNotesModule {}
