import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { todayColombia } from '../../common/utils/date-range.util';
import { resolvePeriodPhrase } from '../../common/utils/period-resolver.util';
import { AssistantToolError } from './assistant-tool.error';
import { AssistantToolDefinition } from './providers/assistant-llm-provider.interface';
import {
  ANALYTICS_BREAKDOWN_TYPES,
  BREAKDOWN_TYPES,
  ComparePeriodsDto,
  GetAnalyticsDto,
  GetBudgetVsActualDto,
  GetCreditNotesDto,
  GetDiagnosisDto,
  GetSalesDto,
  GetSmartSaleBudgetVsActualDto,
  GetSmartSaleSalesDto,
  ResolvePeriodDto,
  SearchCampaignDto,
} from './dto/assistant-tools.dto';
import { AnalyticsBreakdownType, AssistantAnalyticsService } from './tools/assistant-analytics.service';
import { AssistantBudgetService } from './tools/assistant-budget.service';
import { AssistantCampaignSearchService } from './tools/assistant-campaign-search.service';
import { AssistantCompareService } from './tools/assistant-compare.service';
import { AssistantCreditNotesService } from './tools/assistant-credit-notes.service';
import { AssistantDiagnosisService } from './tools/assistant-diagnosis.service';
import { AssistantSalesService, SalesBreakdownType } from './tools/assistant-sales.service';
import { AssistantSmartSaleBudgetService } from './tools/assistant-smartsale-budget.service';
import { AssistantSmartSaleService } from './tools/assistant-smartsale.service';
import { AssistantSyncStatusService } from './tools/assistant-sync-status.service';

const DAY_PROPERTY = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Fecha YYYY-MM-DD, ya resuelta por resolve_period.' };
const STORE_PROPERTY = { type: 'string', enum: ['pilatos', 'kipling', 'diesel', 'superdry', 'girbaud', 'replay'] };
const BREAKDOWN_PROPERTY = { type: 'string', enum: BREAKDOWN_TYPES };
const ANALYTICS_BREAKDOWN_PROPERTY = { type: 'string', enum: ANALYTICS_BREAKDOWN_TYPES };
const PERIOD_PROPERTY = {
  type: 'object',
  properties: { startDay: DAY_PROPERTY, endDay: DAY_PROPERTY },
  required: ['startDay', 'endDay'],
};

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
      'Ventas de una tienda en un rango, desglosadas por uno de 9 cortes: status, payment (método de pago), city, category, brand, collection, discount_bucket (rango de descuento), seller o marketplace (estos dos últimos SOLO existen para Pilatos). Devuelve filas ya sumadas — nunca sumes ni dividas los resultados tú mismo. Con breakdown="status" (el total general de la tienda), la respuesta TAMBIÉN trae "totalUnits" (unidades contabilizadas de TODA la tienda en el rango) y "upt" (unidades por pedido, YA CALCULADO) — con los demás cortes, usa el campo "units" de cada fila (category/collection/discount_bucket/brand ya lo traen), nunca inventes un UPT para un corte parcial (ej. una sola ciudad). Incluye "syncNote": SIEMPRE presente (nunca null) — di cuándo sincronizó VTEX por última vez, como nota discreta; el propio texto escala a una recomendación de resincronizar si pasaron más de 12h.',
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
      'Compara las ventas de una tienda entre dos períodos (A y B) y devuelve el % de cambio YA CALCULADO — nunca restes ni dividas tú mismo los totales de get_sales para esto, usa siempre esta herramienta. Incluye "syncNote" (ver get_sales) — SIEMPRE preséntalo, aunque sea breve.',
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
    name: 'get_smartsale_budget_vs_actual',
    description:
      'Presupuesto vs. venta real del CANAL SmartSale completo (las 6 tiendas combinadas, NO por marca — es un único presupuesto de canal, distinto del presupuesto VTEX por tienda de get_budget_vs_actual) en un rango, con el % ya calculado. La venta real es VTEX + POS (mismo criterio que get_smartsale_sales) — VTEX es un acercamiento hasta que haya ERP, dilo si el usuario pregunta por la exactitud. Incluye "bySeller": el presupuesto del canal repartido en PARTES IGUALES entre los vendedores activos (no es un presupuesto propio por vendedor), cruzado contra la venta real de cada uno — nunca calcules tú mismo ese reparto. Si el rango cruza más de un mes calendario, "mes completo" no está disponible (fullMonthAvailable será false) — dilo, no lo inventes.',
    parameters: {
      type: 'object',
      properties: { startDay: DAY_PROPERTY, endDay: DAY_PROPERTY },
      required: ['startDay', 'endDay'],
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
      'Ventas del canal SmartSale (ventas asistidas por un vendedor a través de su link personalizado) — FUENTE ÚNICA para cualquier pregunta de SmartSale: SIEMPRE combina VTEX + POS ("Resumen"), nunca un canal por separado salvo que el usuario pida explícitamente solo VTEX o solo POS (para eso ya vienen desglosados "vtexSales"/"posSales" en la misma respuesta — nunca los calcules sumando otra herramienta). "periodA"/"periodB" ya traen "totalUnits"/"vtexUnits"/"posUnits" y "upt" (unidades por pedido/documento, YA CALCULADO) — nunca dividas tú mismo units entre orders. Incluye desglose por persona ("bySeller"), por tienda ("byStore", null si se filtró por storeId), y por categoría ("byCategory" — SIEMPRE combinada de las 6 tiendas, úsala para "¿cuál ha sido la categoría más vendida?"). "periodB" es OPCIONAL: solo si el usuario pide comparar contra otro período (ej. "¿cómo va vs. el mes pasado?") — ahí la respuesta trae también el total de ese período y el % de cambio YA CALCULADO ("totalSalesChangePercent"/"vtexSalesChangePercent"/"posSalesChangePercent"), nunca lo calcules tú mismo. Si se omite storeId, combina las 6 tiendas.',
    parameters: {
      type: 'object',
      properties: {
        periodA: PERIOD_PROPERTY,
        periodB: { ...PERIOD_PROPERTY, description: 'Opcional — solo si el usuario pide comparar contra otro período.' },
        storeId: { ...STORE_PROPERTY, description: 'Opcional — sin esto, combina las 6 tiendas.' },
      },
      required: ['periodA'],
    },
  },
  {
    name: 'get_diagnosis',
    description:
      'El "motor del cambio" de /resumen para UNA tienda entre dos períodos: no solo cuánto cambiaron las ventas, sino POR QUÉ (tráfico, conversión o ticket promedio — campo "engine", con "brakes" para lo que fue en contra), más el semáforo (color/grayReason), umbrales adaptativos de esa tienda, un mensaje en español ya redactado ("message"), "teamRecommendations" (a qué equipo(s) avisar, YA DECIDIDO — nunca lo decidas tú, es un cálculo de signos que este proyecto saca del modelo a propósito; lista vacía = ninguna pieza empeoró, no hay equipo que avisar), y "syncNote" (ver get_sales — SIEMPRE preséntalo, aunque sea breve). Úsala cuando el usuario pregunte "por qué" cambiaron las ventas, no solo "cuánto". Nunca inventes una causa ni un equipo que esta herramienta no sustente.',
    parameters: {
      type: 'object',
      properties: { storeId: STORE_PROPERTY, periodA: PERIOD_PROPERTY, periodB: PERIOD_PROPERTY },
      required: ['storeId', 'periodA', 'periodB'],
    },
  },
  {
    name: 'get_analytics',
    description:
      'Datos de TRÁFICO de Google Analytics 4 (sesiones, conversión según Analytics, tasa de rebote) de una tienda, desglosados por uno de 7 cortes: channel (canal de adquisición), device (dispositivo), landing_page (página de entrada), user_type (nuevo/recurrente), city (ciudad), product (vistas/agregados/compras por producto), campaign (campaña UTM). Dominio DISTINTO de get_sales: esto es tráfico/comportamiento, no venta confirmada de VTEX. storeId es obligatorio.',
    parameters: {
      type: 'object',
      properties: { storeId: STORE_PROPERTY, startDay: DAY_PROPERTY, endDay: DAY_PROPERTY, breakdown: ANALYTICS_BREAKDOWN_PROPERTY },
      required: ['storeId', 'startDay', 'endDay', 'breakdown'],
    },
  },
  {
    name: 'search_campaign',
    description:
      'Busca una campaña por coincidencia de texto (ej. "bazar") en LOS DOS sistemas de campaña que existen, que miden cosas distintas: campañas de descuento de VTEX (lado venta, en "vtexCampaigns.totalsByStore", YA son ventas contabilizadas — no hay un campo bruto que incluya canceladas, cita "orders"/"sales" tal cual) y campañas UTM de Analytics (lado tráfico, en sesiones). Devuelve ambos resultados por separado — preséntalos los dos si ambos tienen coincidencias, nunca asumas cuál quiso decir el usuario. Sin coincidencias en alguno de los dos no es un error, solo significa que no hay campañas con ese nombre ahí.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar dentro del nombre de la campaña.' },
        startDay: DAY_PROPERTY,
        endDay: DAY_PROPERTY,
        storeId: { ...STORE_PROPERTY, description: 'Opcional — sin esto, todas las tiendas.' },
      },
      required: ['query', 'startDay', 'endDay'],
    },
  },
];

/**
 * Registro + dispatcher de las 11 herramientas del asistente. Valida cada
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
    private readonly smartSaleBudgetService: AssistantSmartSaleBudgetService,
    private readonly creditNotesService: AssistantCreditNotesService,
    private readonly syncStatusService: AssistantSyncStatusService,
    private readonly smartSaleService: AssistantSmartSaleService,
    private readonly diagnosisService: AssistantDiagnosisService,
    private readonly analyticsService: AssistantAnalyticsService,
    private readonly campaignSearchService: AssistantCampaignSearchService,
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
      case 'get_smartsale_budget_vs_actual': {
        const input = this.validate(GetSmartSaleBudgetVsActualDto, rawInput);
        return this.smartSaleBudgetService.getSmartSaleBudgetVsActual(input.startDay, input.endDay);
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
        return this.smartSaleService.getSmartSaleSales(input.periodA, input.periodB, input.storeId);
      }
      case 'get_diagnosis': {
        const input = this.validate(GetDiagnosisDto, rawInput);
        return this.diagnosisService.getDiagnosis(input.storeId, input.periodA, input.periodB);
      }
      case 'get_analytics': {
        const input = this.validate(GetAnalyticsDto, rawInput);
        return this.analyticsService.getAnalyticsBreakdown(input.storeId, input.startDay, input.endDay, input.breakdown as AnalyticsBreakdownType);
      }
      case 'search_campaign': {
        const input = this.validate(SearchCampaignDto, rawInput);
        return this.campaignSearchService.searchCampaigns(input.query, input.startDay, input.endDay, input.storeId);
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
