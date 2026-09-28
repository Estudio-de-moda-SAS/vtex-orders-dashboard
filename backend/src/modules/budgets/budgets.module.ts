import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { BudgetsController } from './controllers/budgets.controller';
import { BudgetCodeGuard } from './guards/budget-code.guard';
import { BudgetsRepository } from './repositories/budgets.repository';
import { BudgetsService } from './services/budgets.service';

/**
 * Presupuesto manual (canal VTEX) — módulo autocontenido, sin ninguna
 * dependencia del pipeline de sincronización (`SyncModule`/`VtexModule`).
 * Solo usa `DatabaseModule` para el pool de Postgres.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetsRepository, BudgetCodeGuard],
})
export class BudgetsModule {}
