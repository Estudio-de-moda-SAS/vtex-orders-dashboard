import { Injectable } from '@nestjs/common';

import { buildTeamRecommendations, TeamRecommendation } from '../../../common/utils/team-recommendation.util';
import { ResumenService } from '../../resumen/resumen.service';
import { ResumenStoreResult } from '../../resumen/resumen.interface';
import { AssistantToolError } from '../assistant-tool.error';
import { AssistantSalesService } from './assistant-sales.service';

export interface AssistantPeriodInput {
  startDay: string;
  endDay: string;
}

export interface AssistantDiagnosisResult extends ResumenStoreResult {
  /**
   * A qué equipo(s) avisar, YA DECIDIDO en código — ver
   * `team-recommendation.util.ts` para el porqué: decidir esto es un
   * cálculo de signos (misma dirección que el total vs. contraria), y
   * confirmado en producción que dejárselo al modelo da una respuesta
   * distinta cada vez. Lista vacía = ninguna pieza empeoró, no hay equipo
   * que avisar (buena noticia). El modelo SOLO debe leer y narrar esto,
   * nunca decidirlo de nuevo por su cuenta.
   */
  teamRecommendations: TeamRecommendation[];
  /** SIEMPRE presente (nunca vacío) — nota discreta de cuándo sincronizó VTEX por última vez, ver `sync-freshness.util.ts`. */
  syncNote: string;
}

/**
 * Herramienta `get_diagnosis` — delgada a propósito: reusa
 * `ResumenService.getSummary` TAL CUAL (mismo semáforo, mismos umbrales
 * adaptativos de `resumen-semaphore.config.ts`, mismo motor del cambio)
 * en vez de reimplementar nada de esa lógica. Esa función ya calcula las
 * 6 tiendas para los dos períodos pedidos; acá solo se extrae la tienda
 * que preguntó el usuario y se le agrega la recomendación de equipo.
 */
@Injectable()
export class AssistantDiagnosisService {
  constructor(
    private readonly resumenService: ResumenService,
    private readonly salesService: AssistantSalesService,
  ) {}

  async getDiagnosis(storeId: string, periodA: AssistantPeriodInput, periodB: AssistantPeriodInput): Promise<AssistantDiagnosisResult> {
    const response = await this.resumenService.getSummary(periodA.startDay, periodA.endDay, periodB.startDay, periodB.endDay);
    const store = response.stores.find((s) => s.storeId === storeId);
    if (!store) {
      throw new AssistantToolError(`No se encontró diagnóstico para la tienda "${storeId}".`);
    }
    const teamRecommendations = buildTeamRecommendations(
      store.sales.changePercent,
      store.engine,
      store.engineChangePercent,
      store.brakes,
      store.brakeChangePercents,
      store.ticket.changePercent,
      store.mix?.reading,
    );
    const syncNote = await this.salesService.getSyncNote(storeId);
    return { ...store, teamRecommendations, syncNote };
  }
}
