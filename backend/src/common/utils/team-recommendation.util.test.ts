import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTeamRecommendations } from './team-recommendation.util';

test('total subió: el engine (misma dirección, mejoró) NO genera recomendación', () => {
  const result = buildTeamRecommendations(585.8, 'conversión', 133.2, ['ticket'], { ticket: -52.3 }, -52.3);
  assert.equal(result.some((r) => r.piece === 'conversión'), false);
});

test('total subió: el brake (dirección contraria, empeoró) SÍ genera recomendación — caso real confirmado por el usuario', () => {
  const result = buildTeamRecommendations(585.8, 'conversión', 133.2, ['ticket'], { ticket: -52.3 }, -52.3);
  assert.equal(result.length, 1);
  assert.equal(result[0].piece, 'ticket');
  assert.equal(result[0].team, 'Producto');
  assert.equal(result[0].changePercent, -52.3);
});

test('total bajó: el engine (misma dirección, empeoró) SÍ genera recomendación', () => {
  const result = buildTeamRecommendations(-40, 'tráfico', -60, ['conversión'], { conversión: 20 }, 10);
  assert.equal(result.length, 1);
  assert.equal(result[0].piece, 'tráfico');
  assert.equal(result[0].team, 'Marketing');
});

test('total bajó: el brake (dirección contraria, mejoró) NO genera recomendación', () => {
  const result = buildTeamRecommendations(-40, 'tráfico', -60, ['conversión'], { conversión: 20 }, 10);
  assert.equal(result.some((r) => r.piece === 'conversión'), false);
});

test('conversión como pieza que empeoró recomienda "Marketing y Producto", nunca Desarrollo directo', () => {
  const result = buildTeamRecommendations(30, 'tráfico', 50, ['conversión'], { conversión: -10 }, 5);
  const conversion = result.find((r) => r.piece === 'conversión');
  assert.ok(conversion);
  assert.equal(conversion!.team, 'Marketing y Producto');
  assert.match(conversion!.action, /Desarrollo la corrige/);
});

test('engine null (sin pieza clara) y ticket sin caída relevante: no genera ninguna recomendación', () => {
  const result = buildTeamRecommendations(2, null, undefined, [], undefined, 1);
  assert.deepEqual(result, []);
});

test('salesChangePercent null: no genera ninguna recomendación', () => {
  const result = buildTeamRecommendations(null, 'ticket', 10, [], undefined, 10);
  assert.deepEqual(result, []);
});

test('sin brakes y engine mejoró (total subió), ticket sin caída: lista vacía, ninguna pieza empeoró', () => {
  const result = buildTeamRecommendations(50, 'ticket', 50, [], undefined, 2);
  assert.deepEqual(result, []);
});

test('varios brakes empeorados (total subió) generan una recomendación por cada uno', () => {
  const result = buildTeamRecommendations(100, 'conversión', 120, ['ticket', 'tráfico'], { ticket: -10, tráfico: -5 }, -10);
  assert.equal(result.length, 2);
  assert.ok(result.some((r) => r.piece === 'ticket' && r.team === 'Producto'));
  assert.ok(result.some((r) => r.piece === 'tráfico' && r.team === 'Marketing'));
});

// --- Chequeo independiente de ticket (no depende de engine/brakes ni de cobertura de GA) ---

test('caso real: engine null por cobertura de GA incompleta (días provisionales), pero el ticket cayó fuerte — SÍ recomienda Producto', () => {
  // Kipling 2026-10-01..23 vs mismo rango 2025: ventas +118,7%, ticket -41,5%, engine/brakes vacíos
  // porque el período A tiene días provisionales (confirmado en producción — reportado por el usuario).
  const result = buildTeamRecommendations(118.7, null, undefined, [], undefined, -41.5);
  assert.equal(result.length, 1);
  assert.equal(result[0].piece, 'ticket');
  assert.equal(result[0].team, 'Producto');
  assert.equal(result[0].changePercent, -41.5);
});

test('ticket ya venía marcado como brake: el chequeo independiente NO lo duplica', () => {
  const result = buildTeamRecommendations(100, 'conversión', 120, ['ticket'], { ticket: -10 }, -10);
  assert.equal(result.filter((r) => r.piece === 'ticket').length, 1);
});

test('ticket cayó pero por debajo del umbral mínimo (±5%): no genera recomendación', () => {
  const result = buildTeamRecommendations(118.7, null, undefined, [], undefined, -2.5);
  assert.deepEqual(result, []);
});

test('ticket subió cuando las ventas también subieron (misma dirección, mejoró): no genera recomendación', () => {
  const result = buildTeamRecommendations(118.7, null, undefined, [], undefined, 30);
  assert.deepEqual(result, []);
});

test('ticket en null (sin dato): no genera recomendación por ese lado', () => {
  const result = buildTeamRecommendations(118.7, null, undefined, [], undefined, null);
  assert.deepEqual(result, []);
});

// --- `mix` (mezcla de canales vs. dentro del canal) afina la acción de conversión ---

test('conversión empeoró por MEZCLA de canales: acción apunta a Marketing, no al flujo completo de embudo', () => {
  const result = buildTeamRecommendations(30, 'tráfico', 50, ['conversión'], { conversión: -10 }, 5, 'mezcla');
  const conversion = result.find((r) => r.piece === 'conversión');
  assert.ok(conversion);
  assert.equal(conversion!.team, 'Marketing');
  assert.doesNotMatch(conversion!.action, /Desarrollo/);
});

test('conversión empeoró DENTRO del mismo canal: mantiene el flujo completo Marketing+Producto+Desarrollo', () => {
  const result = buildTeamRecommendations(30, 'tráfico', 50, ['conversión'], { conversión: -10 }, 5, 'dentro');
  const conversion = result.find((r) => r.piece === 'conversión');
  assert.ok(conversion);
  assert.equal(conversion!.team, 'Marketing y Producto');
  assert.match(conversion!.action, /Desarrollo la corrige/);
});

test('conversión empeoró, mix "no concluyente": usa el flujo genérico (igual que sin mix)', () => {
  const result = buildTeamRecommendations(30, 'tráfico', 50, ['conversión'], { conversión: -10 }, 5, 'no concluyente');
  const conversion = result.find((r) => r.piece === 'conversión');
  assert.ok(conversion);
  assert.equal(conversion!.team, 'Marketing y Producto');
});
