import assert from 'node:assert/strict';
import { request, session, submit, state } from './client.mjs';

const actor = (world, id) => world.actors.find((item) => item.id === id);
const balances = (world, id) => {
  const { energy, credits, receipts } = actor(world, id);
  return { energy, credits, receipts };
};

/** Author calibration only. Never copy this completed scenario to a learner. */
export async function scenario({ base, moveActor }) {
  const player = await session(base);
  const body = { requestId: 'retry', stationId: 'alpha' };
  moveActor(player.id, { x: 800, y: 0 });
  const far = await state(base, player.token);
  const failed = await submit(base, player.token, body);
  assert.equal(failed.status, 200);
  assert.equal(failed.data.reason, 'range');
  assert.deepEqual(failed.data.state, far);
  moveActor(player.id, { x: 399, y: 0 });
  const first = await submit(base, player.token, body);
  assert.equal(first.data.reason, 'repaired');
  assert.deepEqual(first.data.receipt, { ...body, energyAdded: 3, creditsSpent: 2, energy: 7, credits: 4 });
  assert.deepEqual(balances(first.data.state, player.id), { energy: 7, credits: 4, receipts: [first.data.receipt] });
  moveActor(player.id, { x: 900, y: 0 });
  const beforeRetry = await state(base, player.token);
  const retry = await submit(base, player.token, body);
  assert.equal(retry.data.reason, 'duplicate');
  assert.deepEqual(retry.data.receipt, first.data.receipt);
  assert.deepEqual(retry.data.state, beforeRetry);
  const conflict = await submit(base, player.token, { ...body, stationId: 'beta' });
  assert.equal(conflict.data.reason, 'conflict');
  assert.deepEqual(conflict.data.state, beforeRetry);
  moveActor(player.id, { x: 400, y: 0 });
  const second = await submit(base, player.token, { requestId: 'second', stationId: 'alpha' });
  assert.equal(second.data.reason, 'repaired');
  assert.deepEqual([actor(second.data.state, player.id).energy, actor(second.data.state, player.id).credits], [10, 2]);
  const beforeFull = await state(base, player.token);
  const full = await submit(base, player.token, { requestId: 'third', stationId: 'alpha' });
  assert.equal(full.data.reason, 'history-full');
  assert.deepEqual(full.data.state, beforeFull);
  assert.deepEqual((await submit(base, player.token, body)).data.receipt, first.data.receipt);

  const other = await session(base);
  moveActor(other.id, { x: 300, y: 300 });
  const diagonal = await state(base, other.token);
  const outside = await submit(base, other.token, { requestId: 'diagonal', stationId: 'alpha' });
  assert.equal(outside.data.reason, 'range');
  assert.deepEqual(outside.data.state, diagonal);
  moveActor(other.id, { x: 0, y: 0 });
  const unknown = await submit(base, other.token, { requestId: 'unknown', stationId: 'missing' });
  assert.equal(unknown.data.reason, 'station');
  assert.equal(actor(unknown.data.state, other.id).receipts.length, 0);
  const beforeClaim = await state(base, other.token);
  const claimed = await submit(base, other.token, { requestId: 'claims', stationId: 'alpha', x: 0, y: 0, energy: 1, credits: 100 });
  assert.equal(claimed.status, 400);
  assert.deepEqual(await state(base, other.token), beforeClaim);
  const independent = await submit(base, other.token, body);
  assert.equal(independent.data.reason, 'repaired');
  assert.deepEqual([actor(independent.data.state, other.id).energy, actor(independent.data.state, other.id).credits], [7, 4]);
  assert.equal((await request(base, '/repair', { method: 'POST', json: body })).status, 401);
}
