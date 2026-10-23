import { Module } from '@nestjs/common';

import { BudgetsModule } from '../budgets/budgets.module';
import { CreditNotesModule } from '../credit-notes/credit-notes.module';
import { DatabaseModule } from '../database/database.module';
import { OrdersModule } from '../orders/orders.module';
import { AssistantChatService } from './assistant-chat.service';
import { AssistantController } from './assistant.controller';
import { AssistantToolsRegistry } from './assistant-tools.registry';
import { AssistantRateLimitGuard } from './guards/assistant-rate-limit.guard';
import { assistantLlmProviderFactory } from './providers/assistant-llm-provider.factory';
import { AssistantBudgetService } from './tools/assistant-budget.service';
import { AssistantCompareService } from './tools/assistant-compare.service';
import { AssistantCreditNotesService } from './tools/assistant-credit-notes.service';
import { AssistantSalesService } from './tools/assistant-sales.service';
import { AssistantSmartSaleService } from './tools/assistant-smartsale.service';
import { AssistantSyncStatusService } from './tools/assistant-sync-status.service';

/**
 * Asistente conversacional de ventas (`/asistente`) — desacoplado,
 * mismo criterio que `ResumenModule`/`AnalyticsGaModule`: importa
 * `DatabaseModule` para leer `sales_daily*`/`credit_notes` directo, y
 * reutiliza `BudgetsModule`/`CreditNotesModule`/`OrdersModule` en vez de
 * reimplementar sus consultas (ver `BudgetsService`/`CreditNotesQueryService`/
 * `SmartSaleService` exportados desde ahí). Nunca llama a VTEX/Google en
 * vivo — los únicos clientes HTTP de este módulo son los SDK de
 * Anthropic/OpenAI (ver `providers/assistant-llm-provider.factory.ts`
 * para cómo se elige cuál).
 */
@Module({
  imports: [DatabaseModule, BudgetsModule, CreditNotesModule, OrdersModule],
  controllers: [AssistantController],
  providers: [
    AssistantSalesService,
    AssistantCompareService,
    AssistantBudgetService,
    AssistantCreditNotesService,
    AssistantSyncStatusService,
    AssistantSmartSaleService,
    AssistantToolsRegistry,
    AssistantChatService,
    AssistantRateLimitGuard,
    assistantLlmProviderFactory,
  ],
})
export class AssistantModule {}
