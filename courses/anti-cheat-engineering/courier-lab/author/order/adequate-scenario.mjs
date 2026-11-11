// Author calibration only. Never copied into a learner workspace.
import assert from 'node:assert/strict';
import { join, input, state } from '../../clients/http-client.mjs';

export async function scenario({ base, advance }) {
  const expiring = await join(base);
  await input(base, expiring.token, 10, 'E');
  await advance(3);
  assert.equal((await state(base, expiring.token)).actor.x, 1750, 'three admitted movement ticks');
  await advance(1);
  assert.equal((await state(base, expiring.token)).actor.x, 2000, 'fourth inclusive movement tick');
  await advance(1);
  assert.equal((await state(base, expiring.token)).actor.x, 2000, 'polling must not renew expired intent');

  const ordered = await join(base);
  await input(base, ordered.token, 20, 'E');
  await input(base, ordered.token, 20, 'W', true);
  await advance(1);
  let seen = await state(base, ordered.token);
  assert.equal(seen.actor.x, 1250, 'equal sequence cannot overwrite movement');
  assert.equal(seen.lastDecision, null, 'equal sequence cannot stage interaction');
  await input(base, ordered.token, 19, 'W', true);
  await advance(1);
  seen = await state(base, ordered.token);
  assert.equal(seen.actor.x, 1500, 'older sequence cannot overwrite movement');
  assert.equal(seen.lastDecision, null, 'older sequence cannot stage interaction');
  await input(base, ordered.token, 18, 'idle', true);
  await advance(1);
  await input(base, ordered.token, 17, 'idle', true);
  await advance(1);
  seen = await state(base, ordered.token);
  assert.deepEqual(seen.findings, [], 'stale retries must not become detector observations');
  assert.equal(seen.actor.lastSeq, 20, 'stale requests preserve the admitted sequence');
}
