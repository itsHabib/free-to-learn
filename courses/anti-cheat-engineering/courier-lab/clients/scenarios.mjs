import assert from 'node:assert/strict';
import { input, join, state } from './http-client.mjs';

export class InvariantViolation extends Error {
  constructor(code, message, observed) {
    super(message);
    this.name = 'InvariantViolation';
    this.code = code;
    this.observed = observed;
  }
}

export async function admitted(base, token, seq, move = 'idle', interact = false) {
  const response = await input(base, token, seq, move, interact);
  assert.equal(response.status, 200, 'input must complete over HTTP');
  assert.equal(response.data?.status, 'admitted', 'fresh valid input must be admitted');
  return response;
}

export async function honestWin({ base, advance }) {
  const actor = await join(base);
  const first = await state(base, actor.token);
  assert.equal(first.core.x, 2500, 'this hand-authored trace uses seed 17');
  await admitted(base, actor.token, 1, 'E');
  await advance(4);
  await admitted(base, actor.token, 2, 'E');
  await advance(2);
  await admitted(base, actor.token, 3, 'idle', true);
  await advance(1);
  const pickup = await state(base, actor.token);
  assert.deepEqual([pickup.actor.x, pickup.actor.y, pickup.actor.cargo, pickup.actor.score], [2500, 1000, true, 0]);
  assert.equal(pickup.lastDecision?.reason, 'pickup');
  await admitted(base, actor.token, 4, 'W');
  await advance(4);
  await admitted(base, actor.token, 5, 'W');
  await advance(2);
  await admitted(base, actor.token, 6, 'idle', true);
  await advance(1);
  const deposit = await state(base, actor.token);
  assert.deepEqual([deposit.actor.x, deposit.actor.y, deposit.actor.score, deposit.actor.cargo], [1000, 1000, 1, false]);
  assert.equal(deposit.lastDecision?.reason, 'deposit');
  assert.deepEqual(deposit.core, { x: 2500, y: 1000 });
  return { actor, pickup, deposit };
}

export async function probeRemotePickup({ base, advance }) {
  const actor = await join(base);
  const before = await state(base, actor.token);
  assert.deepEqual([before.actor.x, before.actor.y, before.actor.cargo, before.actor.score], [1000, 1000, false, 0]);
  await admitted(base, actor.token, 1, 'idle', true);
  await advance(1);
  const after = await state(base, actor.token);
  assert.equal(after.tick, before.tick + 1, 'probe must observe the acknowledged tick');
  assert.deepEqual([after.actor.x, after.actor.y, after.actor.score], [1000, 1000, 0]);
  return { before, after };
}

export function assertRemotePickupInvariant(observed) {
  if (observed.after.actor.cargo !== false) {
    throw new InvariantViolation('REMOTE_PICKUP', 'remote pickup must leave cargo false', observed);
  }
  assert.deepEqual(observed.after.lastDecision, { status: 'denied', reason: 'range', tick: observed.after.tick });
}

export async function probeStaleOrdering({ base, advance }) {
  const actor = await join(base);
  const before = await state(base, actor.token);
  await admitted(base, actor.token, 2, 'N');
  const retry = await input(base, actor.token, 1, 'E', true);
  assert.equal(retry.status, 200, 'stale probe must reach admission over HTTP');
  assert.ok(['admitted', 'stale'].includes(retry.data?.status), 'probe must produce an admission decision');
  await advance(1);
  const after = await state(base, actor.token);
  assert.equal(after.tick, before.tick + 1, 'probe must observe the acknowledged tick');
  return { before, after, retry: retry.data };
}

export function assertStaleOrderingInvariant(observed) {
  if (observed.after.actor.x !== 1000 || observed.after.actor.y !== 750) {
    throw new InvariantViolation('STALE_DIRECTION', 'a stale E input must not replace the newer N intent', observed);
  }
  assert.equal(observed.retry.status, 'stale');
  assert.equal(observed.after.actor.lastSeq, 2);
  assert.equal(observed.after.lastDecision, null, 'stale interaction must not enter the pending bit');
}
