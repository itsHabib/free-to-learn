import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { withServer } from '../../tests/harness.mjs';
import { DELIVERY_SCHEDULES, runDeliverySchedule } from '../../clients/schedules.mjs';

export async function componentFixtures(root, seed) {
  const results = [];
  async function criterion(name, exercise) {
    try { const evidence = await exercise(); results.push({ name, passed: true, evidence }); }
    catch (error) { results.push({ name, passed: false, failureKind: error instanceof assert.AssertionError ? 'assertion' : 'runner-failure', trace: error.trace, error: { name: error.name, code: error.code, message: error.message, actual: error.actual, expected: error.expected, stack: error.stack } }); }
  }
  await criterion('pure admission contract', async () => {
    const { admitInput, movementActive } = await import(pathToFileURL(join(root, 'admission.mjs')));
    const before = Object.freeze({ lastSeq: 20, lastSeen: 7, expiresAt: 11, move: 'N', pendingInteract: true });
    const input = Object.freeze({ v: 1, seq: 21, move: 'E', interact: false });
    const next = { lastSeq: 21, lastSeen: 9, expiresAt: 13, move: 'E', pendingInteract: true };
    assert.deepEqual(admitInput(before, input, 9), { status: 'admitted', next });
    for (const seq of [20, 19]) assert.deepEqual(admitInput(before, { ...input, seq, interact: true }, 9), { status: 'stale', next: before });
    assert.equal(movementActive(next, 13), true);
    assert.equal(movementActive(next, 14), false);
    assert.equal(movementActive({ lastSeq: 0, lastSeen: 0, expiresAt: 0, move: 'idle', pendingInteract: false }, 1), false);
    return { next, activeThrough: 13, inactiveAt: 14 };
  });
  for (const name of DELIVERY_SCHEDULES) {
    await criterion(name, () => withServer(async (server) => {
      try {
        const result = await runDeliverySchedule(server, name, { seed });
        return { ...result, trace: await server.record() };
      } catch (error) {
        error.trace = await server.record();
        throw error;
      }
    }, { seed, entry: join(root, 'server.mjs') }));
  }
  return results;
}
