import assert from 'node:assert/strict';
import test from 'node:test';

import { KeyedMutex } from './keyed-mutex.util';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('KeyedMutex: dos llamadas con la MISMA key nunca se ejecutan al mismo tiempo (nunca se intercalan)', async () => {
  const mutex = new KeyedMutex();
  const events: string[] = [];

  const callA = mutex.run('diesel', async () => {
    events.push('A:start');
    await delay(30);
    events.push('A:end');
  });
  const callB = mutex.run('diesel', async () => {
    events.push('B:start');
    await delay(5);
    events.push('B:end');
  });

  await Promise.all([callA, callB]);

  // B nunca debe arrancar antes de que A termine — si se intercalaran, B:start quedaría antes de A:end.
  assert.deepEqual(events, ['A:start', 'A:end', 'B:start', 'B:end']);
});

test('KeyedMutex: llamadas con keys DISTINTAS corren en paralelo, sin esperarse entre sí', async () => {
  const mutex = new KeyedMutex();
  const events: string[] = [];

  const callDiesel = mutex.run('diesel', async () => {
    events.push('diesel:start');
    await delay(30);
    events.push('diesel:end');
  });
  const callPilatos = mutex.run('pilatos', async () => {
    events.push('pilatos:start');
    await delay(5);
    events.push('pilatos:end');
  });

  await Promise.all([callDiesel, callPilatos]);

  // pilatos (más corta) debe alcanzar a terminar mientras diesel (más larga) sigue corriendo — prueba de que no se serializan entre keys distintas.
  assert.ok(events.indexOf('pilatos:end') < events.indexOf('diesel:end'));
  assert.deepEqual(events.slice(0, 2).sort(), ['diesel:start', 'pilatos:start']);
});

test('KeyedMutex: si una llamada falla, la siguiente con la misma key igual se ejecuta (no queda bloqueada para siempre)', async () => {
  const mutex = new KeyedMutex();
  const events: string[] = [];

  const failing = mutex.run('diesel', async () => {
    events.push('failing');
    throw new Error('fallo simulado');
  });
  await assert.rejects(failing, /fallo simulado/);

  const next = await mutex.run('diesel', async () => {
    events.push('next');
    return 'ok';
  });

  assert.equal(next, 'ok');
  assert.deepEqual(events, ['failing', 'next']);
});
