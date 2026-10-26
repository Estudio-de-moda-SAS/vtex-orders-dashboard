import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSyncNote, checkSyncFreshness } from './sync-freshness.util';

const NOW = new Date('2026-10-25T12:00:00.000Z').getTime();

test('menos de 12 horas desde la última sincronización: no está desactualizado', () => {
  const result = checkSyncFreshness('2026-10-25T06:00:00.000Z', 12, NOW);
  assert.equal(result.isStale, false);
  assert.equal(result.hoursSinceSync, 6);
});

test('exactamente 12 horas: SÍ está desactualizado (umbral inclusivo)', () => {
  const result = checkSyncFreshness('2026-10-25T00:00:00.000Z', 12, NOW);
  assert.equal(result.isStale, true);
  assert.equal(result.hoursSinceSync, 12);
});

test('más de 12 horas: está desactualizado', () => {
  const result = checkSyncFreshness('2026-10-24T00:00:00.000Z', 12, NOW);
  assert.equal(result.isStale, true);
  assert.equal(result.hoursSinceSync, 36);
});

test('sin sincronización registrada (null): se considera desactualizado, sin horas', () => {
  const result = checkSyncFreshness(null, 12, NOW);
  assert.equal(result.isStale, true);
  assert.equal(result.hoursSinceSync, null);
});

test('buildSyncNote: NUNCA es null, incluso cuando está al día (etiqueta cortísima, sin el nombre de la tienda ni "Resincronizar")', () => {
  const check = checkSyncFreshness('2026-10-25T06:00:00.000Z', 12, NOW);
  const note = buildSyncNote('Pilatos', check);
  assert.equal(note, 'sync: hace 6 horas');
  assert.doesNotMatch(note, /Resincronizar/);
});

test('buildSyncNote: menos de 1 hora se lee natural, no "0 horas"', () => {
  const check = checkSyncFreshness('2026-10-25T11:40:00.000Z', 12, NOW);
  const note = buildSyncNote('Pilatos', check);
  assert.match(note, /menos de 1 hora/);
});

test('buildSyncNote: al pasar el umbral, escala a recomendación con horas y "Resincronizar"', () => {
  const check = checkSyncFreshness('2026-10-24T00:00:00.000Z', 12, NOW);
  const note = buildSyncNote('Pilatos', check);
  assert.match(note, /Pilatos/);
  assert.match(note, /36 horas/);
  assert.match(note, /Resincronizar/);
});

test('buildSyncNote: caso sin sincronización nunca registrada tiene su propio mensaje', () => {
  const check = checkSyncFreshness(null, 12, NOW);
  const note = buildSyncNote('Kipling', check);
  assert.match(note, /Kipling/);
  assert.match(note, /ninguna sincronización/);
});
