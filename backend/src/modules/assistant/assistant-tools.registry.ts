import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { todayColombia } from '../../common/utils/date-range.util';
import { resolvePeriodPhrase } from '../../common/utils/period-resolver.util';
import { AssistantToolError } from './assistant-tool.error';
import { AssistantToolDefinition } from './providers/assistant-llm-provider.interface';
import {
  BREAKDOWN_TYPES,
  ComparePeriodsDto,
  GetBudgetVsActualDto,
  GetCreditNotesDto,
  GetSalesDto,
  GetSmartSaleSalesDto,
  ResolvePeriodDto,
} from './dto/assistant-tools.dto';
import { AssistantBudgetService } from './tools/assistant-budget.service';
import { AssistantCompareService } from './tools/assistant-compare.service';
import { AssistantCreditNotesService } from './tools/assistant-credit-notes.service';
import { AssistantSalesService, SalesBreakdownType } from './tools/assistant-sales.service';
import { AssistantSmartSaleService } from './tools/assistant-smartsale.service';
import { AssistantSyncStatusService } from './tools/assistant-sync-status.service';

const DAY_PROPERTY = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Fecha YYYY-MM-DD, ya resuelta por resolve_period.' };
const STORE_PROPERTY = { type: 'string', enum: ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'] };
const BREAKDOWN_PROPERTY = { type: 'string', enum: BREAKDOWN_TYPES };

const TOOL_DEFINITIONS: AssistantToolDefinition[] = [
  {
    name: 'resolve_period',
    description:
      'Convierte una frase de fecha en español (hoy, ayer, esta semana, semana pasada, este mes, mes pasado, este año, año pasado, o un rango explícito "YYYY-MM-DD..YYYY-MM-DD") en un rango exacto {startDay, endDay}. SIEMPRE usa esta herramienta antes de pedir datos de cualquier otra — nunca calcules una fecha tú mismo.',
    parameters: {
      type: 'object',
      properties: { phrase: { type: 'string', description: 'La frase de fecha tal cual la dijo o implicó el usuario.' } },
      required: ['phrase'],
    },
  },
  {
    name: 'get_sales',
    description:
      'Ventas de una tienda en un rango, desglosadas por uno de 9 cortes: status, payment (método de pago), city, category, brand, collection, discount_bucket (rango de descuento), seller o marketplace (estos dos últimos SOLO existen para Pilatos). Devuelve filas ya sumadas — nunca sumes ni dividas los resultados tú mismo.',
    parameters: {
      type: 'object',
      properties: {
        storeId: STORE_PROPERTY,
        startDay: DAY_PROPERTY,
        endDay: DAY_PROPERTY,
        breakdown: BREAKDOWN_PROPERTY,
      },
      required: ['storeId', 'startDay', 'endDay', 'breakdown'],
    },
  },
  {
    name: 'compare_periods',
    description:
      'Compara las ventas de una tienda entre dos períodos (A y B) y devuelve el % de cambio YA CALCULADO — nunca restes ni dividas tú mismo los totales de get_sales para esto, usa siempre esta herramienta.',
    parameters: {
      type: 'object',
      properties: {
        storeId: STORE_PROPERTY,
        periodA: {
          type: 'object',
          properties: { startDay: DAY_PROPERTY, endDay: DAY_PROPERTY },
          required: ['startDay', 'endDay'],
        },
        periodB: {
          type: 'object',
          properties: { startDay: DAY_PROPERTY, endDay: DAY_PROPERTY },
          required: ['startDay', 'endDay'],
        },
        breakdown: { ...BREAKDOWN_PROPERTY, description: 'Opcional — sin esto, compara el total de ventas contabilizadas.' },
      },
      required: ['storeId', 'periodA', 'periodB'],
    },
  },
  {
    name: 'get_budget_vs_actual',
    description:
      'Presupuesto vs. venta real de una tienda en un rango, con el % ya calculado. Para Pilatos, el presupuesto se compara contra la venta TOTAL (incluye sellers/marketplaces, sin ajustar). Si el rango cruza más de un mes calendario, "mes completo" no está disponible (fullMonthAvailable será false) — dilo, no lo inventes.',
    parameters: {
      type: 'object',
      properties: { storeId: STORE_PROPERTY, startDay: DAY_PROPERTY, endDay: DAY_PROPERTY },
      required: ['storeId', 'startDay', 'endDay'],
    },
  },
  {
    name: 'get_credit_notes',
    description:
      'Notas crédito de un rango (opcionalmente filtradas por tienda): cantidad, valor neto total, % que representa de las ventas, desglose por día y por marca. OJO: se sincronizan manualmente (no en tiempo real) — revisa siempre "warnings" y "meta.lastSyncedAt" antes de afirmar que no hubo notas crédito en una fecha reciente.',
    parameters: {
      type: 'object',
      properties: { startDay: DAY_PROPERTY, endDay: DAY_PROPERTY, storeId: { ...STORE_PROPERTY, description: 'Opcional — sin esto, todas las marcas.' } },
      required: ['startDay', 'endDay'],
    },
  },
  {
    name: 'get_sync_status',
    description:
      'Estado de sincronización de cada fuente de datos (VTEX, GA4, notas crédito) por tienda — última vez que se actualizó cada una. Úsala si el usuario pregunta "qué tan actualizado está esto" o si una cifra reciente parece sospechosamente baja.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_smartsale_sales',
    description:
      'Ventas del canal SmartSale (ventas asistidas por un vendedor específico a través de su link personalizado) en un rango: total del canal y desglose por persona (nombre, ventas, órdenes, % del canal). Úsala para preguntas como "cuánto vendió [nombre de una persona]" o "cuánto vendió SmartSale". Si se omite storeId, combina las 6 tiendas.',
    parameters: {
      type: 'object',
      properties: { startDay: DAY_PROPERTY, endDay: DAY_PROPERTY, storeId: { ...STORE_PROPERTY, description: 'Opcional — sin esto, combina las 6 tiendas.' } },
      required: ['startDay', 'endDay'],
    },
  },
];

/**
 * Registro + dispatcher de las 7 herramientas del asistente. Valida cada
 * input con la MISMA pareja `class-transformer`/`class-validator` que usan
 * los controllers HTTP (`ValidationPipe`) — sin introducir `zod`. Un error
 * de validación o un `AssistantToolError` se propaga tal cual (mensaje
 * seguro de mostrar al modelo); cualquier otro error se relanza para que
 * `AssistantChatService` lo registre como falla real.
 */
@Injectable()
export class AssistantToolsRegistry {
  constructor(
    private readonly salesService: AssistantSalesService,
    private readonly compareService: AssistantCompareService,
    private readonly budgetService: AssistantBudgetService,
    private readonly creditNotesService: AssistantCreditNotesService,
    private readonly syncStatusService: AssistantSyncStatusService,
    private readonly smartSaleService: AssistantSmartSaleService,
  ) {}

  getToolDefinitions(): AssistantToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  async execute(toolName: string, rawInput: unknown): Promise<unknown> {
    switch (toolName) {
      case 'resolve_period': {
        const input = this.validate(ResolvePeriodDto, rawInput);
        const resolved = resolvePeriodPhrase(input.phrase, todayColombia());
        if (!resolved) {
          throw new AssistantToolError(
            `No reconozco la expresión de fecha "${input.phrase}". Usa una de: hoy, ayer, esta semana, semana pasada, este mes, mes pasado, este año, año pasado, o pregúntale al usuario por fechas exactas y pásalas como "YYYY-MM-DD..YYYY-MM-DD".`,
          );
        }
        return resolved;
      }
      case 'get_sales': {
        const input = this.validate(GetSalesDto, rawInput);
        return this.salesService.getSalesBreakdown(input.storeId, input.startDay, input.endDay, input.breakdown as SalesBreakdownType);
      }
      case 'compare_periods': {
        const input = this.validate(ComparePeriodsDto, rawInput);
        return this.compareService.comparePeriods(
          input.storeId,
          input.periodA,
          input.periodB,
          input.breakdown as SalesBreakdownType | undefined,
        );
      }
      case 'get_budget_vs_actual': {
        const input = this.validate(GetBudgetVsActualDto, rawInput);
        return this.budgetService.getBudgetVsActual(input.storeId, input.startDay, input.endDay);
      }
      case 'get_credit_notes': {
        const input = this.validate(GetCreditNotesDto, rawInput);
        return this.creditNotesService.getCreditNotes(input.startDay, input.endDay, input.storeId);
      }
      case 'get_sync_status':
        // Sin input que validar — `GetSyncStatusDto` no tiene propiedades, y
        // `validateSync` lanza sobre una clase sin decoradores (lo trata como
        // "no sé qué validar"), así que no tiene sentido invocarlo acá.
        return this.syncStatusService.getSyncStatus();
      case 'get_smartsale_sales': {
        const input = this.validate(GetSmartSaleSalesDto, rawInput);
        return this.smartSaleService.getSmartSaleSales(input.startDay, input.endDay, input.storeId);
      }
      default:
        throw new AssistantToolError(`Herramienta desconocida: "${toolName}".`);
    }
  }

  private validate<T extends object>(DtoClass: new () => T, rawInput: unknown): T {
    const instance = plainToInstance(DtoClass, rawInput ?? {});
    const errors = validateSync(instance as object, { whitelist: true, forbidNonWhitelisted: false });
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new AssistantToolError(`Input inválido: ${messages.join('; ')}`);
    }
    return instance;
  }
}
