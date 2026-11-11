import assert from 'node:assert/strict';
import { request, session, submit, state } from './client.mjs';

export async function scenario({ base, moveActor }) {
  function actorIn(snapshot, id) {
    assert.ok(Array.isArray(snapshot.actors), 'state exposes the documented actors array');
    const actor = snapshot.actors.find(candidate => candidate.id === id);
    assert.ok(actor, 'the authenticated actor is present');
    return actor;
  }

  async function repaired(owner, receipt) {
    const before = await state(base, owner.token);
    const expected = structuredClone(before);
    const actor = actorIn(expected, owner.id);
    actor.energy = receipt.energy;
    actor.credits = receipt.credits;
    actor.receipts.push(receipt);
    const result = await submit(base, owner.token, {
      requestId: receipt.requestId,
      stationId: receipt.stationId,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.reason, 'repaired');
    assert.deepEqual(result.data.receipt, receipt);
    assert.deepEqual(result.data.state, expected);
    assert.deepEqual(await state(base, owner.token), expected);
  }

  async function unchanged(owner, body, reason, receipt = null) {
    const before = await state(base, owner.token);
    const result = await submit(base, owner.token, body);
    assert.equal(result.status, 200);
    assert.equal(result.data.reason, reason);
    assert.deepEqual(result.data.receipt, receipt);
    assert.deepEqual(result.data.state, before);
    assert.deepEqual(await state(base, owner.token), before);
  }

  const a = await session(base);
  await moveActor(a.id, { x: 400, y: 0 });
  const initialA = actorIn(await state(base, a.token), a.id);
  assert.equal(initialA.energy, 4);
  assert.equal(initialA.credits, 6);
  assert.deepEqual(initialA.receipts, []);
  const firstReceipt = {
    requestId: 'first-repair', stationId: 'alpha', energyAdded: 3,
    creditsSpent: 2, energy: 7, credits: 4,
  };
  await repaired(a, firstReceipt);

  await moveActor(a.id, { x: 2400, y: 1000 });
  await unchanged(a, { requestId: 'first-repair', stationId: 'alpha' }, 'duplicate', firstReceipt);
  await unchanged(a, { requestId: 'first-repair', stationId: 'beta' }, 'conflict');

  await moveActor(a.id, { x: 0, y: 0 });
  await repaired(a, {
    requestId: 'second-repair', stationId: 'alpha', energyAdded: 3,
    creditsSpent: 2, energy: 10, credits: 2,
  });
  await unchanged(a, { requestId: 'third-repair', stationId: 'alpha' }, 'history-full');
  await unchanged(a, { requestId: 'first-repair', stationId: 'alpha' }, 'duplicate', firstReceipt);

  const b = await session(base);
  await moveActor(b.id, { x: 300, y: 300 });
  await unchanged(b, { requestId: 'retry-after-range', stationId: 'alpha' }, 'range');
  await moveActor(b.id, { x: 0, y: 0 });
  await repaired(b, {
    requestId: 'retry-after-range', stationId: 'alpha', energyAdded: 3,
    creditsSpent: 2, energy: 7, credits: 4,
  });

  const c = await session(base);
  await moveActor(c.id, { x: 0, y: 0 });
  const beforeInvalid = await state(base, c.token);
  const injected = await submit(base, c.token, {
    requestId: 'client-claims', stationId: 'alpha', actorId: a.id,
    x: 0, y: 0, energy: 10, credits: 999, price: 0, score: 999,
  });
  assert.equal(injected.status, 400);
  assert.deepEqual(await state(base, c.token), beforeInvalid);

  const missingToken = await request(base, '/repair', {
    method: 'POST', json: { requestId: 'unauthenticated', stationId: 'alpha' },
  });
  assert.equal(missingToken.status, 401);
  const unknownToken = await request(base, '/state', { token: 'not-a-real-session-token' });
  assert.equal(unknownToken.status, 401);
  assert.deepEqual(await state(base, c.token), beforeInvalid);

  await unchanged(c, { requestId: 'missing-station', stationId: 'unknown-station' }, 'station');
  await repaired(c, {
    requestId: 'first-repair', stationId: 'alpha', energyAdded: 3,
    creditsSpent: 2, energy: 7, credits: 4,
  });
}
