/**
 * "Motor del cambio": descompone la variación de ventas en sus 3 causas
 * matemáticamente independientes — tráfico (sesiones), conversión (compras
 * reales ÷ sesiones) y ticket (ventas ÷ compras reales) — usando la
 * identidad `ventas = sesiones × conversión × ticket`. Por construcción
 * (ver `ResumenService`, donde conversión y ticket se calculan a partir de
 * las MISMAS sesiones/compras/ventas), esa identidad siempre se cumple
 * exactamente, así que:
 *
 *   ln(ventas_A / ventas_B) = ln(sesiones_A/sesiones_B)
 *                           + ln(conversión_A/conversión_B)
 *                           + ln(ticket_A/ticket_B)
 *
 * Cada término se expresa ×100 ("aporte en puntos", no un % aritmético
 * puro) para que los 3 sumen EXACTO el cambio total en escala logarítmica
 * — es la forma estándar de hacer esta descomposición (se usa igual en
 * growth-accounting financiero) y, para variaciones moderadas (no un
 * x10), es una muy buena aproximación del % aritmético real.
 */

export interface ChangeEngineInputs {
  sessionsA: number;
  sessionsB: number;
  conversionA: number;
  conversionB: number;
  ticketA: number;
  ticketB: number;
}

export interface ChangeComponents {
  trafficPercent: number;
  conversionPercent: number;
  ticketPercent: number;
}

/** `null` si falta cualquiera de las 6 entradas o alguna es <= 0 (no se puede tomar `ln`). */
export function decomposeChange(inputs: ChangeEngineInputs): ChangeComponents | null {
  const { sessionsA, sessionsB, conversionA, conversionB, ticketA, ticketB } = inputs;
  if (sessionsA <= 0 || sessionsB <= 0 || conversionA <= 0 || conversionB <= 0 || ticketA <= 0 || ticketB <= 0) {
    return null;
  }
  return {
    trafficPercent: Math.log(sessionsA / sessionsB) * 100,
    conversionPercent: Math.log(conversionA / conversionB) * 100,
    ticketPercent: Math.log(ticketA / ticketB) * 100,
  };
}

export type ChangePieceName = 'tráfico' | 'conversión' | 'ticket';

export interface EngineAndBrakes {
  /** La pieza que más explica el cambio, solo si va en su misma dirección y supera el umbral — `null` si ninguna califica. */
  engine: ChangePieceName | null;
  /** Piezas que van EN CONTRA de la dirección del cambio total, con variación absoluta >= umbral — no cambian el color, solo se marcan. */
  brakes: ChangePieceName[];
  /** Presente solo cuando `engine` es `null` — por qué no se nombró un motor. */
  noEngineReason?: 'cambio-minimo' | 'sin-pieza-clara';
}

/**
 * Motor = la pieza de mayor aporte ABSOLUTO entre las que van en la MISMA
 * dirección del cambio total de ventas y superan `pieceThresholdPercent`.
 * Freno = pieza que va en la dirección CONTRARIA y también supera el
 * umbral. Si el cambio total de ventas es menor a 1%, no se nombra motor
 * (cambio demasiado chico para atribuirlo a nada).
 */
export function pickEngineAndBrakes(
  components: ChangeComponents,
  totalSalesChangePercent: number,
  pieceThresholdPercent: number,
): EngineAndBrakes {
  if (Math.abs(totalSalesChangePercent) < 1) {
    return { engine: null, brakes: [], noEngineReason: 'cambio-minimo' };
  }

  const direction = Math.sign(totalSalesChangePercent);
  const pieces: Array<{ name: ChangePieceName; value: number }> = [
    { name: 'tráfico', value: components.trafficPercent },
    { name: 'conversión', value: components.conversionPercent },
    { name: 'ticket', value: components.ticketPercent },
  ];

  const aligned = pieces.filter((p) => Math.sign(p.value) === direction && Math.abs(p.value) >= pieceThresholdPercent);
  const engine =
    aligned.length > 0 ? aligned.reduce((max, p) => (Math.abs(p.value) > Math.abs(max.value) ? p : max)).name : null;

  const brakes = pieces
    .filter((p) => Math.sign(p.value) === -direction && Math.abs(p.value) >= pieceThresholdPercent)
    .map((p) => p.name);

  return engine ? { engine, brakes } : { engine: null, brakes, noEngineReason: 'sin-pieza-clara' };
}
