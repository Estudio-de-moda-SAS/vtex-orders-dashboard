import assert from 'node:assert/strict';
import test from 'node:test';

import { buildResumenMessage } from './resumen-message.util';

test('buildResumenMessage: gris siempre lleva el motivo', () => {
  const message = buildResumenMessage({
    storeName: 'Diesel',
    color: 'gris',
    grayReason: 'Menos de 100 compras reales en el período actual o en el anterior.',
    salesChangePercent: null,
    engine: null,
    brakes: [],
  });
  assert.equal(message, 'Diesel: pocos datos para opinar (menos de 100 compras reales en el período actual o en el anterior.).');
});

test('buildResumenMessage: nombra el motor y el freno cuando ambos existen', () => {
  const message = buildResumenMessage({
    storeName: 'Pilatos',
    color: 'verde',
    salesChangePercent: 18,
    engine: 'tráfico',
    engineChangePercent: 19,
    brakes: ['conversión'],
    brakeChangePercents: { conversión: -8.3 },
  });
  assert.equal(
    message,
    'Pilatos: ventas +18,0%, impulsadas por más tráfico (+19,0%). La conversión bajó (-8,3%) y frenó parte del cambio.',
  );
});

test('buildResumenMessage: agrega la nota de días provisionales cuando aplica', () => {
  const message = buildResumenMessage({
    storeName: 'Kipling',
    color: 'amarillo',
    salesChangePercent: -2,
    engine: null,
    noEngineReason: 'cambio-minimo',
    brakes: [],
    provisional: true,
  });
  assert.ok(message.includes('Incluye días provisionales'));
});
