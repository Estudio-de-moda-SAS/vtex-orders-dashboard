import { ChangePieceName } from './change-engine.util';
import { SemaphoreColor } from './resumen-semaphore.util';

/**
 * Mensaje automático de `/resumen`, por plantillas (sin IA) — una frase
 * en español por tienda, nombrando el motor del cambio y cualquier
 * freno. Las frases de los ejemplos del encargo son guía de tono, no un
 * texto exacto a replicar literalmente; esta función genera algo
 * equivalente y consistente para cualquier combinación de entradas.
 */

export interface ResumenMessageInput {
  storeName: string;
  color: SemaphoreColor;
  /** Obligatorio cuando `color === 'gris'`. */
  grayReason?: string;
  /** `null` si A o B no tienen datos de ventas. */
  salesChangePercent: number | null;
  engine: ChangePieceName | null;
  noEngineReason?: 'cambio-minimo' | 'sin-pieza-clara';
  /** Valor (ya en %) de la pieza que es el motor — requerido si `engine` no es `null`. */
  engineChangePercent?: number;
  brakes: ChangePieceName[];
  /** Valor (ya en %) de cada freno nombrado en `brakes`. */
  brakeChangePercents?: Partial<Record<ChangePieceName, number>>;
  /** Si el rango incluye días provisionales — agrega la nota correspondiente. */
  provisional?: boolean;
}

function formatPercentSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1).replace('.', ',')}%`;
}

function lowerFirst(text: string): string {
  return text.length > 0 ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function pieceLabel(piece: ChangePieceName, increased: boolean): string {
  if (piece === 'tráfico') return increased ? 'más tráfico' : 'menos tráfico';
  if (piece === 'conversión') return increased ? 'mejor conversión' : 'peor conversión';
  return increased ? 'mayor ticket promedio' : 'menor ticket promedio';
}

function brakeSentence(piece: ChangePieceName, value: number): string {
  const increased = value >= 0;
  const subject = piece === 'tráfico' ? 'El tráfico' : piece === 'conversión' ? 'La conversión' : 'El ticket promedio';
  const verb = increased ? 'subió' : 'bajó';
  return `${subject} ${verb} (${formatPercentSigned(value)}) y frenó parte del cambio.`;
}

export function buildResumenMessage(input: ResumenMessageInput): string {
  if (input.color === 'gris') {
    const reason = input.grayReason ? ` (${lowerFirst(input.grayReason)})` : '';
    return `${input.storeName}: pocos datos para opinar${reason}.`;
  }

  const changeStr = input.salesChangePercent !== null ? formatPercentSigned(input.salesChangePercent) : 'sin dato';
  let headline = `${input.storeName}: ventas ${changeStr}`;

  if (input.engine && input.engineChangePercent !== undefined) {
    headline += `, impulsadas por ${pieceLabel(input.engine, input.engineChangePercent >= 0)} (${formatPercentSigned(input.engineChangePercent)})`;
  } else if (input.noEngineReason === 'sin-pieza-clara') {
    headline += ', sin un motor claro';
  }
  headline += '.';

  const parts = [headline];
  if (input.brakeChangePercents) {
    for (const brake of input.brakes) {
      const value = input.brakeChangePercents[brake];
      if (value !== undefined) parts.push(brakeSentence(brake, value));
    }
  }

  if (input.provisional) {
    parts.push('Incluye días provisionales — las cifras todavía pueden cambiar.');
  }

  return parts.join(' ');
}
