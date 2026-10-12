import assert from 'node:assert/strict';
import test from 'node:test';

import { ChannelPoint, decomposeMixVsWithin } from './channel-mix.util';

function overallConversion(channels: ChannelPoint[]): number {
  const sessions = channels.reduce((sum, c) => sum + c.sessions, 0);
  const purchases = channels.reduce((sum, c) => sum + c.purchases, 0);
  return sessions > 0 ? purchases / sessions : 0;
}

test('decomposeMixVsWithin: mezcla + dentro SUMAN EXACTO el cambio total de la conversión agregada', () => {
  const channelsA: ChannelPoint[] = [
    { channel: 'Organic', sessions: 600, purchases: 30 },
    { channel: 'Paid', sessions: 350, purchases: 15 }, // < 20 en A → se agrupa en "Otros"
    { channel: 'Social', sessions: 50, purchases: 5 }, // < 20 en ambos → se agrupa
  ];
  const channelsB: ChannelPoint[] = [
    { channel: 'Organic', sessions: 500, purchases: 20 },
    { channel: 'Paid', sessions: 450, purchases: 25 }, // >= 20 en B, pero igual se agrupa (lo fue en A)
    { channel: 'Social', sessions: 50, purchases: 3 },
  ];

  const result = decomposeMixVsWithin(channelsA, channelsB, 20);
  const expectedTotalChangePp = (overallConversion(channelsA) - overallConversion(channelsB)) * 100;

  assert.ok(Math.abs(result.mixEffect + result.withinEffect - expectedTotalChangePp) < 1e-9);
  assert.ok(Math.abs(result.mixEffect - -0.16) < 0.01);
  assert.ok(Math.abs(result.withinEffect - 0.36) < 0.01);
  assert.equal(result.reading, 'no concluyente'); // ambos efectos por debajo del piso de "dominante"
});

test('decomposeMixVsWithin: "Paid" se agrupa en "Otros" en LOS DOS períodos aunque en B solo tenga pocas compras en A (mismo agrupamiento, no asimétrico)', () => {
  // Si "Paid" NO se agrupara en B (donde sí supera el mínimo), el resultado cambiaría —
  // este test fija números exactos (calculados a mano) que solo salen así con agrupamiento simétrico.
  const channelsA: ChannelPoint[] = [
    { channel: 'Organic', sessions: 600, purchases: 30 },
    { channel: 'Paid', sessions: 350, purchases: 15 },
    { channel: 'Social', sessions: 50, purchases: 5 },
  ];
  const channelsB: ChannelPoint[] = [
    { channel: 'Organic', sessions: 500, purchases: 20 },
    { channel: 'Paid', sessions: 450, purchases: 25 },
    { channel: 'Social', sessions: 50, purchases: 3 },
  ];
  const result = decomposeMixVsWithin(channelsA, channelsB, 20);
  assert.ok(Math.abs(result.mixEffect - -0.16) < 0.01);
});

test('decomposeMixVsWithin: lectura "mezcla" cuando domina el cambio en participación, no la conversión de cada canal', () => {
  const channelsA: ChannelPoint[] = [
    { channel: 'X', sessions: 9000, purchases: 450 }, // conv 5%, igual en A y B
    { channel: 'Y', sessions: 1000, purchases: 100 }, // conv 10%, igual en A y B
  ];
  const channelsB: ChannelPoint[] = [
    { channel: 'X', sessions: 1000, purchases: 50 },
    { channel: 'Y', sessions: 9000, purchases: 900 },
  ];
  const result = decomposeMixVsWithin(channelsA, channelsB);
  assert.equal(result.reading, 'mezcla');
  assert.ok(Math.abs(result.withinEffect) < 1e-9); // la conversión de cada canal no cambió
});

test('decomposeMixVsWithin: lectura "dentro" cuando la participación no cambia pero la conversión de un canal sí', () => {
  const channelsA: ChannelPoint[] = [
    { channel: 'X', sessions: 500, purchases: 50 }, // conv 10%
    { channel: 'Y', sessions: 500, purchases: 25 }, // conv 5%
  ];
  const channelsB: ChannelPoint[] = [
    { channel: 'X', sessions: 500, purchases: 25 }, // conv 5% (bajó)
    { channel: 'Y', sessions: 500, purchases: 25 }, // conv 5% (igual)
  ];
  const result = decomposeMixVsWithin(channelsA, channelsB);
  assert.equal(result.reading, 'dentro');
  assert.ok(Math.abs(result.mixEffect) < 1e-9); // la participación de cada canal no cambió (50/50 en ambos períodos)
});
