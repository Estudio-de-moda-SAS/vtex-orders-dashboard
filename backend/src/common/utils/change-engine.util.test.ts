import assert from 'node:assert/strict';
import test from 'node:test';

import { decomposeChange, pickEngineAndBrakes } from './change-engine.util';

test('decomposeChange: null si cualquier entrada es <= 0 (no se puede tomar ln)', () => {
  assert.equal(decomposeChange({ sessionsA: 0, sessionsB: 100, conversionA: 0.01, conversionB: 0.01, ticketA: 100, ticketB: 100 }), null);
});

test('decomposeChange: las 3 piezas SUMAN EXACTO el cambio total en escala logarítmica (ventas = sesiones × conversión × ticket)', () => {
  const sessionsA = 1200;
  const sessionsB = 1000;
  const conversionA = 0.011;
  const conversionB = 0.012;
  const ticketA = 100000;
  const ticketB = 100000;

  const ventasA = sessionsA * conversionA * ticketA;
  const ventasB = sessionsB * conversionB * ticketB;
  const expectedTotalLogChange = Math.log(ventasA / ventasB) * 100;

  const result = decomposeChange({ sessionsA, sessionsB, conversionA, conversionB, ticketA, ticketB });
  assert.ok(result);
  const sum = result!.trafficPercent + result!.conversionPercent + result!.ticketPercent;
  assert.ok(Math.abs(sum - expectedTotalLogChange) < 1e-9);
});

test('pickEngineAndBrakes: motor = la pieza alineada con el cambio total y de mayor aporte; freno = la que va en contra', () => {
  const result = pickEngineAndBrakes({ trafficPercent: 18.232, conversionPercent: -8.701, ticketPercent: 0 }, 10, 5);
  assert.equal(result.engine, 'tráfico');
  assert.deepEqual(result.brakes, ['conversión']);
});

test('pickEngineAndBrakes: sin motor si el cambio total de ventas es menor a 1%', () => {
  const result = pickEngineAndBrakes({ trafficPercent: 18, conversionPercent: -8, ticketPercent: 0 }, 0.5, 5);
  assert.equal(result.engine, null);
  assert.equal(result.noEngineReason, 'cambio-minimo');
  assert.deepEqual(result.brakes, []);
});

test('pickEngineAndBrakes: "sin pieza clara" cuando ninguna pieza supera el umbral, aunque el cambio total sí sea relevante', () => {
  const result = pickEngineAndBrakes({ trafficPercent: 2, conversionPercent: -1, ticketPercent: 1 }, 5, 5);
  assert.equal(result.engine, null);
  assert.equal(result.noEngineReason, 'sin-pieza-clara');
  assert.deepEqual(result.brakes, []);
});

test('pickEngineAndBrakes: una pieza en contra que NO supera el umbral no se marca como freno', () => {
  const result = pickEngineAndBrakes({ trafficPercent: 20, conversionPercent: -2, ticketPercent: 0 }, 10, 5);
  assert.equal(result.engine, 'tráfico');
  assert.deepEqual(result.brakes, []);
});
