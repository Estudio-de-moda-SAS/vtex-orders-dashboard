import { Body, Controller, Get, HttpCode, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';

import { BudgetRangeQueryDto } from '../dto/budget-range-query.dto';
import { BudgetsQueryDto } from '../dto/budgets-query.dto';
import { BulkBudgetsDto } from '../dto/bulk-budgets.dto';
import { MultiplierQueryDto } from '../dto/multiplier-query.dto';
import { SetMultiplierDto } from '../dto/set-multiplier.dto';
import { VerifyCodeDto } from '../dto/verify-code.dto';
import { BudgetCodeGuard } from '../guards/budget-code.guard';
import { BudgetsService } from '../services/budgets.service';

/**
 * Presupuesto manual (canal VTEX) — herramienta de captura aparte del
 * pipeline de sincronización, protegida por un código compartido en las
 * rutas de escritura (`BudgetCodeGuard`, ver ahí el porqué se aplica en
 * las 3 rutas que reciben `code`, no solo en `verify-code`).
 */
@Controller('api/budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  /** POST /api/budgets/verify-code — el guard ya validó el código y el límite de intentos; si llegó hasta acá, es válido. */
  @UseGuards(BudgetCodeGuard)
  @HttpCode(200)
  @Post('verify-code')
  verifyCode(@Body(new ValidationPipe({ transform: true, whitelist: true })) _body: VerifyCodeDto) {
    return { ok: true };
  }

  @Get('multiplier')
  getMultiplier(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: MultiplierQueryDto) {
    return this.budgetsService.getMultiplier(query.year, query.month);
  }

  /** GET /api/budgets/summary — PÚBLICO (sin código): totales por marca + total de canal, para las cards de resumen. */
  @Get('summary')
  getMonthSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: MultiplierQueryDto) {
    return this.budgetsService.getMonthSummary(query.year, query.month);
  }

  /** GET /api/budgets/range-summary — PÚBLICO (sin código): presupuesto de un rango arbitrario de fechas, para "venta real vs. presupuesto". */
  @Get('range-summary')
  getRangeSummary(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: BudgetRangeQueryDto) {
    return this.budgetsService.getRangeSummary(query.startDate, query.endDate);
  }

  @UseGuards(BudgetCodeGuard)
  @Post('multiplier')
  setMultiplier(@Body(new ValidationPipe({ transform: true, whitelist: true })) body: SetMultiplierDto) {
    return this.budgetsService.setMultiplier(body.year, body.month, body.multiplier, Boolean(body.confirmOverwrite));
  }

  @Get()
  getBudgets(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: BudgetsQueryDto) {
    return this.budgetsService.getBudgets(query.storeId, query.year, query.month);
  }

  @UseGuards(BudgetCodeGuard)
  @Post('bulk')
  saveBulk(@Body(new ValidationPipe({ transform: true, whitelist: true })) body: BulkBudgetsDto) {
    return this.budgetsService.saveBulk(body.storeId, body.year, body.month, body.rawValues, Boolean(body.confirmOverwrite));
  }
}
