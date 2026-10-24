import { ChangePieceName } from './change-engine.util';
import { MixDecompositionResult } from './channel-mix.util';

/**
 * Equipos reales de Estudio de Moda (ver `equipos.md` del usuario) a los
 * que el asistente puede recomendar avisar — ningún otro nombre es
 * válido. Marketplace/SmartSale no salen de acá (no son piezas del motor
 * del cambio): el manual del asistente los maneja aparte, por prompt.
 */
export type RecommendedTeam = 'Producto' | 'Marketing y Producto' | 'Marketing';

export interface TeamRecommendation {
  /** Pieza del motor del cambio (`engine` o un `brake`) que motiva este aviso. */
  piece: ChangePieceName;
  /** % de cambio PROPIO de esa pieza (`engineChangePercent`/`brakeChangePercents[piece]`), no el de ventas totales. */
  changePercent: number;
  team: RecommendedTeam;
  /** Acción concreta ya redactada — el asistente la cita tal cual, no la reinventa. */
  action: string;
}

/**
 * Determina a qué equipo(s) avisar, de forma 100% determinista — el
 * modelo NUNCA debe razonar "misma dirección que el total"/"dirección
 * contraria" por su cuenta (confirmado en producción: ese razonamiento de
 * signos es inconsistente de una corrida a otra, el tipo de cálculo que
 * este proyecto saca siempre del modelo y mete al backend).
 *
 * Regla de negocio (confirmada con el usuario): `engine` va SIEMPRE en la
 * misma dirección que el cambio total de ventas — si el total subió,
 * `engine` MEJORÓ (nada que avisar ahí, aunque sea la pieza más grande).
 * Cada `brake` va SIEMPRE en dirección contraria al total — si el total
 * subió, el `brake` EMPEORÓ (es el lado flojo pese al buen resultado
 * general) y sí amerita un aviso. Si el total bajó, es al revés: el
 * `engine` empeoró (lo que explica la caída) y cada `brake` mejoró (lo
 * que amortiguó la caída, sin avisar ahí).
 *
 * Una pieza que empeoró se recomienda SIEMPRE, incluso con el semáforo en
 * gris/baja confianza (el usuario lo confirmó: el número de esa pieza es
 * real, no depende de cuántas órdenes hubo) — la baja confianza es
 * responsabilidad del llamador (ya la expone `get_diagnosis` por
 * separado vía `color`/`grayReason`), no de esta función.
 */
/**
 * Umbral mínimo (igual al default de `app.ga.changeEngineThresholdPercent`,
 * ver `resumen.service.ts`) para que el chequeo INDEPENDIENTE de ticket
 * (abajo) considere "real" una caída — evita avisar por un vaivén de 1-2%
 * sin importancia. Hardcodeado a propósito: esta función es pura (sin
 * `ConfigService`), y ambos valores deben quedar iguales por diseño.
 */
const TICKET_MIN_RELEVANT_PERCENT = 5;

export function buildTeamRecommendations(
  salesChangePercent: number | null,
  engine: ChangePieceName | null,
  engineChangePercent: number | undefined,
  brakes: ChangePieceName[],
  brakeChangePercents: Partial<Record<ChangePieceName, number>> | undefined,
  /**
   * % de cambio del ticket promedio (\`ticket.changePercent\` de
   * `get_diagnosis`) — a diferencia de tráfico/conversión, el ticket es
   * 100% VTEX (sales ÷ orders), NUNCA depende de datos de Analytics. Por
   * eso se evalúa SIEMPRE por separado, incluso cuando `engine`/`brakes`
   * salieron `null` por cobertura de GA incompleta (días provisionales,
   * etc.) — confirmado en producción: un rango con días provisionales
   * bloqueaba la recomendación de Producto a pesar de que el ticket había
   * caído con toda claridad (dato que no necesitaba GA para calcularse).
   */
  ticketChangePercent: number | null,
  /**
   * \`mix\` de \`get_diagnosis\` (solo se calcula si la conversión GA cambió
   * ≥5% y hay cobertura completa — ver `resumen.service.ts`) — cuando la
   * pieza que empeoró es conversión, afina la acción: si el cambio vino de
   * la MEZCLA de canales (de dónde entra el tráfico), es un tema de
   * Marketing/targeting, no necesariamente un error de flujo; si vino de
   * DENTRO de los mismos canales, sí aplica el flujo completo de revisión
   * de embudo. `undefined`/"no concluyente" usa el flujo genérico (seguro
   * por defecto, igual que antes de tener este dato).
   */
  mixReading?: MixDecompositionResult['reading'],
): TeamRecommendation[] {
  if (salesChangePercent === null || salesChangePercent === 0) return [];
  const totalWentUp = salesChangePercent > 0;
  const recommendations: TeamRecommendation[] = [];
  const flaggedPieces = new Set<ChangePieceName>();

  // `engine` solo empeoró si el total BAJÓ (misma dirección que el total).
  if (!totalWentUp && engine && engineChangePercent !== undefined) {
    recommendations.push(buildRecommendation(engine, engineChangePercent, mixReading));
    flaggedPieces.add(engine);
  }

  // Cada `brake` solo empeoró si el total SUBIÓ (dirección contraria al total).
  if (totalWentUp) {
    for (const brake of brakes) {
      const changePercent = brakeChangePercents?.[brake];
      if (changePercent === undefined) continue;
      recommendations.push(buildRecommendation(brake, changePercent, mixReading));
      flaggedPieces.add(brake);
    }
  }

  // Chequeo independiente de ticket (ver comentario del parámetro) — solo si
  // `engine`/`brakes` no lo señalaron ya arriba, para no duplicar el aviso.
  // A diferencia de engine/brake (que miran la dirección RELATIVA al total,
  // para efectos de atribución), acá el criterio es simple y absoluto: el
  // ticket CAYÓ, sin importar hacia dónde fue el total — un ticket más bajo
  // es una señal mala para Producto en sí misma, no solo cuando "contradice"
  // el resultado general (confirmado por un caso real: con el total cayendo
  // y el ticket SUBIENDO, no hay nada que avisarle a Producto, aunque los
  // signos sean "opuestos" entre ticket y total).
  if (!flaggedPieces.has('ticket') && ticketChangePercent !== null && ticketChangePercent <= -TICKET_MIN_RELEVANT_PERCENT) {
    recommendations.push(buildRecommendation('ticket', ticketChangePercent));
  }

  return recommendations;
}

function buildRecommendation(
  piece: ChangePieceName,
  changePercent: number,
  mixReading?: MixDecompositionResult['reading'],
): TeamRecommendation {
  switch (piece) {
    case 'ticket':
      return {
        piece,
        changePercent,
        team: 'Producto',
        action:
          'Revisar el ordenamiento/posicionamiento de productos en el sitio, gestionar los productos con mayor descuento (pueden estar arrastrando el ticket hacia abajo), o reforzar/implementar productos complementarios en la ficha para subir el valor del pedido.',
      };
    case 'conversión':
      if (mixReading === 'mezcla') {
        return {
          piece,
          changePercent,
          team: 'Marketing',
          action:
            'El cambio en conversión vino de un cambio en la MEZCLA de canales (más o menos tráfico de un canal que ya convertía distinto a los demás) — es un tema de hacia dónde se dirige el tráfico, no necesariamente un error del flujo de compra. Avísale a Marketing para revisar qué canales ganaron o perdieron peso.',
        };
      }
      return {
        piece,
        changePercent,
        team: 'Marketing y Producto',
        action:
          'Marketing revisa el embudo y Producto evalúa si hay algún error en el flujo de compra; SOLO SI confirman una anomalía real, Desarrollo la corrige (no empezar directo por Desarrollo — salvo que el cambio sea un salto brusco de un solo día, que suele ser un problema de medición, no de negocio).',
      };
    case 'tráfico':
      return {
        piece,
        changePercent,
        team: 'Marketing',
        action:
          'Ajustar segmentación o mensaje de los canales con mucho tráfico y poca compra, o revisar que la página de destino cumpla lo que promete el anuncio.',
      };
  }
}
