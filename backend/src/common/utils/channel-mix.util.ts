/**
 * Cuando la conversión según Analytics cambia, ¿fue porque cambió DE
 * DÓNDE viene el tráfico (más/menos participación de un canal que ya
 * convertía distinto), o porque cada canal empezó a convertir distinto
 * por sí mismo? Descomposición clásica tipo Oaxaca-Blinder:
 *
 *   efecto_mezcla  = Σ (w_A − w_B) × c_B
 *   efecto_dentro  = Σ w_A × (c_A − c_B)
 *
 * donde `w` es la participación del canal en sesiones y `c` su
 * conversión (compras GA ÷ sesiones). Por construcción, ambos términos
 * SUMAN EXACTO el cambio total de la conversión agregada (ver test) —
 * siempre que `w`/`c` de cada período se calculen sobre el MISMO
 * conjunto de canales (ya agrupado), que es justo lo que hace
 * `regroupChannels` antes de todo lo demás.
 */

export interface ChannelPoint {
  channel: string;
  sessions: number;
  /** Compras SEGÚN GA (evento de compra), no pedidos reales de VTEX — esta descomposición es "indicativa", no real. */
  purchases: number;
}

export interface MixDecompositionResult {
  /** Puntos porcentuales de conversión explicados por el cambio en la MEZCLA de canales. */
  mixEffect: number;
  /** Puntos porcentuales explicados por el cambio DENTRO de cada canal. */
  withinEffect: number;
  reading: 'mezcla' | 'dentro' | 'no concluyente';
}

const OTHER_LABEL = 'Otros';
/** Por debajo de esto (en puntos porcentuales), ninguno de los dos efectos se considera "dominante" — valor inicial, a validar con datos reales. */
const DOMINANCE_NOISE_FLOOR_PP = 0.5;

/** Agrupa en "Otros" los canales marcados — misma función para A y B, así el agrupamiento queda IDÉNTICO en ambos períodos. */
function regroupChannels(channels: ChannelPoint[], lowPurchaseChannels: Set<string>): ChannelPoint[] {
  const kept = channels.filter((c) => !lowPurchaseChannels.has(c.channel));
  const grouped = channels.filter((c) => lowPurchaseChannels.has(c.channel));
  if (grouped.length === 0) return kept;
  return [
    ...kept,
    {
      channel: OTHER_LABEL,
      sessions: grouped.reduce((sum, c) => sum + c.sessions, 0),
      purchases: grouped.reduce((sum, c) => sum + c.purchases, 0),
    },
  ];
}

/**
 * Un canal con menos de `minPurchasesForGrouping` compras GA en A **o**
 * en B se agrupa en "Otros" — en LOS DOS períodos, nunca solo en uno,
 * para no comparar conjuntos de canales distintos entre A y B.
 */
export function decomposeMixVsWithin(
  channelsA: ChannelPoint[],
  channelsB: ChannelPoint[],
  minPurchasesForGrouping = 20,
): MixDecompositionResult {
  const purchasesByChannelA = new Map(channelsA.map((c) => [c.channel, c.purchases]));
  const purchasesByChannelB = new Map(channelsB.map((c) => [c.channel, c.purchases]));
  const allChannelNames = new Set([...purchasesByChannelA.keys(), ...purchasesByChannelB.keys()]);

  const lowPurchaseChannels = new Set<string>();
  for (const name of allChannelNames) {
    const purchasesA = purchasesByChannelA.get(name) ?? 0;
    const purchasesB = purchasesByChannelB.get(name) ?? 0;
    if (purchasesA < minPurchasesForGrouping || purchasesB < minPurchasesForGrouping) {
      lowPurchaseChannels.add(name);
    }
  }

  const groupedA = regroupChannels(channelsA, lowPurchaseChannels);
  const groupedB = regroupChannels(channelsB, lowPurchaseChannels);

  const totalSessionsA = groupedA.reduce((sum, c) => sum + c.sessions, 0);
  const totalSessionsB = groupedB.reduce((sum, c) => sum + c.sessions, 0);

  const byChannelA = new Map(groupedA.map((c) => [c.channel, c]));
  const byChannelB = new Map(groupedB.map((c) => [c.channel, c]));
  const names = new Set([...byChannelA.keys(), ...byChannelB.keys()]);

  let mixEffect = 0;
  let withinEffect = 0;
  for (const name of names) {
    const a = byChannelA.get(name);
    const b = byChannelB.get(name);
    const weightA = totalSessionsA > 0 && a ? a.sessions / totalSessionsA : 0;
    const weightB = totalSessionsB > 0 && b ? b.sessions / totalSessionsB : 0;
    const convA = a && a.sessions > 0 ? a.purchases / a.sessions : 0;
    const convB = b && b.sessions > 0 ? b.purchases / b.sessions : 0;
    mixEffect += (weightA - weightB) * convB;
    withinEffect += weightA * (convA - convB);
  }

  // Puntos porcentuales, para que sea legible (ej. "+0,3 pp" en vez de "+0,003").
  mixEffect *= 100;
  withinEffect *= 100;

  const absMix = Math.abs(mixEffect);
  const absWithin = Math.abs(withinEffect);
  let reading: MixDecompositionResult['reading'];
  if (absMix < DOMINANCE_NOISE_FLOOR_PP && absWithin < DOMINANCE_NOISE_FLOOR_PP) {
    reading = 'no concluyente';
  } else if (absMix > absWithin) {
    reading = 'mezcla';
  } else if (absWithin > absMix) {
    reading = 'dentro';
  } else {
    reading = 'no concluyente';
  }

  return { mixEffect, withinEffect, reading };
}
