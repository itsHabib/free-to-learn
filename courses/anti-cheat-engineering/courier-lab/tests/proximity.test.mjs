import assert from 'node:assert/strict';
import test from 'node:test';
import { join, state } from '../clients/http-client.mjs';
import { admitted, assertRemotePickupInvariant, honestWin, probeRemotePickup } from '../clients/scenarios.mjs';
import { withServer } from './harness.mjs';

// Kept separate so the editable defense lab can run these independent
// controls without relying on the learner's implementation or expected output.
test('honest delivery remains possible', async () => {
  await withServer(honestWin);
});

test('remote pickup cannot change authoritative cargo', async () => {
  await withServer(async (server) => assertRemotePickupInvariant(await probeRemotePickup(server)));
});

const boundaryCases = [
  {
    axis: 'x', position: [2250, 1000], depotPosition: [1250, 1000],
    outward: [['E', 4], ['E', 1]], homeward: [['W', 4]],
  },
  {
    axis: 'y', position: [2500, 1250], depotPosition: [1000, 1250],
    outward: [['E', 4], ['E', 2], ['S', 1]], homeward: [['W', 4], ['W', 2]],
  },
];

for (const example of boundaryCases) {
  test(`pickup and deposit include the exact 250 mm ${example.axis} boundary`, async () => {
    await withServer(async (server) => {
      const actor = await join(server.base);
      let seq = await walk(server, actor.token, example.outward);
      await admitted(server.base, actor.token, ++seq, 'idle', true);
      await server.advance(1);
      const pickedUp = await state(server.base, actor.token);
      assert.deepEqual([pickedUp.actor.x, pickedUp.actor.y], example.position);
      assert.deepEqual([pickedUp.actor.cargo, pickedUp.actor.score], [true, 0]);
      assert.equal(pickedUp.lastDecision.reason, 'pickup', 'the inclusive range must accept equality');
      seq = await walk(server, actor.token, example.homeward, seq);
      await admitted(server.base, actor.token, ++seq, 'idle', true);
      await server.advance(1);
      const deposited = await state(server.base, actor.token);
      assert.deepEqual([deposited.actor.x, deposited.actor.y], example.depotPosition);
      assert.deepEqual([deposited.actor.cargo, deposited.actor.score], [false, 1]);
      assert.equal(deposited.lastDecision.reason, 'deposit');
    });
  });
}

test('250 mm on both axes is outside the circular pickup range', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    const seq = await walk(server, actor.token, [['E', 4], ['E', 1], ['S', 1]]);
    await admitted(server.base, actor.token, seq + 1, 'idle', true);
    await server.advance(1);
    const denied = await state(server.base, actor.token);
    assert.deepEqual([denied.actor.x, denied.actor.y], [2250, 1250]);
    assert.deepEqual([denied.actor.cargo, denied.actor.score], [false, 0], 'a square or x-only guard must not admit the diagonal');
    assert.deepEqual(denied.lastDecision, { status: 'denied', reason: 'range', tick: denied.tick });
    assert.equal(denied.actor.nextInteractTick, 0, 'a range denial must not start the success cooldown');
  });
});

test('range repair preserves the four-tick cooldown after pickup', async () => {
  await withServer(async (server) => {
    const actor = await join(server.base);
    let seq = await walk(server, actor.token, [['E', 4], ['E', 1]]);
    await admitted(server.base, actor.token, ++seq, 'idle', true);
    await server.advance(1);
    const pickup = await state(server.base, actor.token);
    assert.equal(pickup.actor.cargo, true);
    assert.equal(pickup.actor.nextInteractTick, pickup.tick + 4);
    for (let offset = 1; offset <= 3; offset += 1) {
      await admitted(server.base, actor.token, ++seq, 'idle', true);
      await server.advance(1);
      const denied = await state(server.base, actor.token);
      assert.deepEqual(denied.lastDecision, { status: 'denied', reason: 'cooldown', tick: pickup.tick + offset });
      assert.deepEqual([denied.actor.cargo, denied.actor.score], [true, 0]);
      assert.equal(denied.actor.nextInteractTick, pickup.tick + 4, 'denied retries must not extend cooldown');
    }
    await admitted(server.base, actor.token, ++seq, 'idle', true);
    await server.advance(1);
    assert.equal((await state(server.base, actor.token)).lastDecision.reason, 'range', 'cooldown ends exactly at N+4');
  });
});

test('repeated interactions after deposit cannot score again or extend cooldown', async () => {
  await withServer(async (server) => {
    const { actor, deposit } = await honestWin(server);
    assert.equal(deposit.actor.nextInteractTick, deposit.tick + 4);
    for (let offset = 1; offset <= 4; offset += 1) {
      await admitted(server.base, actor.token, 6 + offset, 'idle', true);
      await server.advance(1);
      const repeated = await state(server.base, actor.token);
      assert.deepEqual([repeated.actor.score, repeated.actor.cargo], [1, false]);
      assert.equal(repeated.actor.nextInteractTick, deposit.tick + 4);
      assert.equal(repeated.lastDecision.reason, offset < 4 ? 'cooldown' : 'range');
      assert.deepEqual(repeated.core, { x: 2500, y: 1000 });
    }
  });
});

async function walk(server, token, path, lastSeq = 0) {
  let seq = lastSeq;
  for (const [direction, ticks] of path) {
    await admitted(server.base, token, ++seq, direction);
    await server.advance(ticks);
  }
  return seq;
}
