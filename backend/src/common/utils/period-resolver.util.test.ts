import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolvePeriodPhrase } from './period-resolver.util';

const TODAY = '2026-10-23'; // viernes

test('resolvePeriodPhrase: hoy', () => {
  assert.deepEqual(resolvePeriodPhrase('hoy', TODAY), { startDay: '2026-10-23', endDay: '2026-10-23' });
});

test('resolvePeriodPhrase: ayer', () => {
  assert.deepEqual(resolvePeriodPhrase('ayer', TODAY), { startDay: '2026-10-22', endDay: '2026-10-22' });
});

test('resolvePeriodPhrase: esta semana (lunes a hoy)', () => {
  assert.deepEqual(resolvePeriodPhrase('esta semana', TODAY), { startDay: '2026-10-19', endDay: '2026-10-23' });
});

test('resolvePeriodPhrase: semana pasada (lunes a domingo completos)', () => {
  assert.deepEqual(resolvePeriodPhrase('semana pasada', TODAY), { startDay: '2026-10-12', endDay: '2026-10-18' });
});

test('resolvePeriodPhrase: este mes (1 al día actual)', () => {
  assert.deepEqual(resolvePeriodPhrase('este mes', TODAY), { startDay: '2026-10-01', endDay: '2026-10-23' });
});

test('resolvePeriodPhrase: mes pasado (mes completo anterior)', () => {
  assert.deepEqual(resolvePeriodPhrase('mes pasado', TODAY), { startDay: '2026-09-01', endDay: '2026-09-30' });
});

test('resolvePeriodPhrase: este año (1 de enero al día actual)', () => {
  assert.deepEqual(resolvePeriodPhrase('este año', TODAY), { startDay: '2026-01-01', endDay: '2026-10-23' });
});

test('resolvePeriodPhrase: año pasado (año calendario completo)', () => {
  assert.deepEqual(resolvePeriodPhrase('año pasado', TODAY), { startDay: '2025-01-01', endDay: '2025-12-31' });
});

test('resolvePeriodPhrase: rango explícito YYYY-MM-DD..YYYY-MM-DD', () => {
  assert.deepEqual(resolvePeriodPhrase('2026-10-01..2026-10-10', TODAY), { startDay: '2026-10-01', endDay: '2026-10-10' });
});

test('resolvePeriodPhrase: rango explícito invertido es inválido', () => {
  assert.equal(resolvePeriodPhrase('2026-10-10..2026-10-01', TODAY), null);
});

test('resolvePeriodPhrase: frase no reconocida devuelve null, no adivina', () => {
  assert.equal(resolvePeriodPhrase('la temporada navideña', TODAY), null);
});

test('resolvePeriodPhrase: respeta mayúsculas/espacios extra', () => {
  assert.deepEqual(resolvePeriodPhrase('  Ayer  ', TODAY), { startDay: '2026-10-22', endDay: '2026-10-22' });
});

test('resolvePeriodPhrase: "mes pasado" cruzando de año (enero -> diciembre anterior)', () => {
  assert.deepEqual(resolvePeriodPhrase('mes pasado', '2026-01-15'), { startDay: '2025-12-01', endDay: '2025-12-31' });
});
