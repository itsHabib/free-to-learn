import assert from 'node:assert/strict';
import { input, join, state } from './http-client.mjs';

// Application receipt schedules, not TCP simulation. Geometry and route lengths
// are hand-authored for each seed; the engine is never used as the oracle.
const SEEDS = Object.freeze({
  17: { start: 2, sequence: 170, coreX: 2500, coreSteps: 6, approachSteps: 3 },
  31: { start: 3, sequence: 310, coreX: 2250, coreSteps: 5, approachSteps: 2 },
  99: { start: 1, sequence: 990, coreX: 2000, coreSteps: 4, approachSteps: 1 },
});

export const DELIVERY_SCHEDULES = Object.freeze([
  'continuous-renewals', 'reordered-input', 'same-tick-clump', 'expiry-gap',
  'lost-request', 'lost-response', 'state-polling', 'human-repress',
  'human-anticipatory', 'distant-script',
]);

async function begin(server, name, seed) {
  if (!Object.hasOwn(SEEDS, seed)) throw new Error(`No hand-authored schedule fixture for seed ${seed}`);
  const fixture = SEEDS[seed];
  await server.advance(fixture.start);
  const actor = await join(server.base);
  const run = { server, name, seed, actor, ...fixture, checkpoints: [] };
  const initial = await checkpoint(run, 'joined', { tick: run.start });
  assert.deepEqual(initial.core, { x: run.coreX, y: 1000 }, `${name}: seeded core geometry`);
  assert.deepEqual(initial.depot, { x: 1000, y: 1000 }, `${name}: depot geometry`);
  return run;
}

async function deliver(run, seq, move = 'idle', interact = false) {
  const response = await input(run.server.base, run.actor.token, seq, move, interact);
  assert.equal(response.status, 200, `${run.name}: gameplay input reaches HTTP admission`);
  return response;
}

async function checkpoint(run, label, {
  tick, x = 1000, y = 1000, seq = 0, expiry = 0, cargo = false, score = 0,
  cooldown = 0, decision = null, findings = [],
}) {
  const observed = await state(run.server.base, run.actor.token);
  assert.deepEqual({ tick: observed.tick, actor: observed.actor, lastDecision: observed.lastDecision, findings: observed.findings }, {
    tick,
    actor: { id: run.actor.id, x, y, score, cargo, lastSeq: seq, expiresAt: expiry, nextInteractTick: cooldown },
    lastDecision: decision, findings,
  }, `${run.name}/${label}: exact authoritative state`);
  run.checkpoints.push({ name: label, state: observed });
  return observed;
}

const denied = (tick, reason = 'range') => ({ status: 'denied', reason, tick });
const pickup = (tick) => ({ status: 'applied', reason: 'pickup', tick });

async function continuous(run) {
  const { start: t, sequence: n, server } = run;
  await deliver(run, n, 'E');
  await checkpoint(run, 'admitted-before-movement', { tick: t, seq: n, expiry: t + 4 });
  await server.advance(3);
  await checkpoint(run, 'three-tick-gap', { tick: t + 3, x: 1750, seq: n, expiry: t + 4 });
  await deliver(run, n + 1, 'E');
  await server.advance(4);
  await checkpoint(run, 'four-tick-gap', { tick: t + 7, x: 2750, seq: n + 1, expiry: t + 7 });
  await deliver(run, n + 2, 'W');
  await server.advance(4);
  await checkpoint(run, 'inclusive-renewal', { tick: t + 11, x: 1750, seq: n + 2, expiry: t + 11 });
  await deliver(run, n + 3, 'W');
  await server.advance(2);
  await checkpoint(run, 'continuous-no-catch-up', { tick: t + 13, x: 1250, seq: n + 3, expiry: t + 15 });
}

async function toCore(run) {
  const { start: t, sequence: n, server, coreSteps } = run;
  await deliver(run, n, 'E');
  await server.advance(4);
  await checkpoint(run, 'route-fourth-tick', { tick: t + 4, x: 2000, seq: n, expiry: t + 4 });
  if (coreSteps === 4) return { at: t + 4, seq: n, expiry: t + 4 };
  await deliver(run, n + 1, 'E');
  await server.advance(coreSteps - 4);
  await checkpoint(run, 'at-core', { tick: t + coreSteps, x: run.coreX, seq: n + 1, expiry: t + 8 });
  return { at: t + coreSteps, seq: n + 1, expiry: t + 8 };
}

async function reordered(run) {
  const { at: t, seq: n } = await toCore(run);
  await deliver(run, n + 2);
  await deliver(run, n + 1, 'W', true);
  await run.server.advance(1);
  await checkpoint(run, 'older-input-adds-no-interaction', { tick: t + 1, x: run.coreX, seq: n + 2, expiry: t + 4 });
  await deliver(run, n + 3, 'idle', true);
  await run.server.advance(1);
  await checkpoint(run, 'fresh-repress-picks-up', {
    tick: t + 2, x: run.coreX, seq: n + 3, expiry: t + 5, cargo: true, cooldown: t + 6, decision: pickup(t + 2),
  });
}

async function clump(run) {
  const { at: t, seq: n } = await toCore(run);
  await deliver(run, n + 1, 'W', true);
  await deliver(run, n + 2, 'idle', true);
  await deliver(run, n + 3, 'E', false);
  await checkpoint(run, 'clump-does-not-move-immediately', { tick: t, x: run.coreX, seq: n + 3, expiry: t + 4 });
  await run.server.advance(1);
  await checkpoint(run, 'latest-move-and-one-interaction', {
    tick: t + 1, x: run.coreX + 250, seq: n + 3, expiry: t + 4, cargo: true, cooldown: t + 5, decision: pickup(t + 1),
  });
  await run.server.advance(1);
  await checkpoint(run, 'pending-interaction-consumed-once', {
    tick: t + 2, x: run.coreX + 500, seq: n + 3, expiry: t + 4, cargo: true, cooldown: t + 5, decision: pickup(t + 1),
  });
}

async function expiryGap(run) {
  const { start: t, sequence: n, server } = run;
  await deliver(run, n, 'E');
  await server.advance(3);
  await checkpoint(run, 'third-active-tick', { tick: t + 3, x: 1750, seq: n, expiry: t + 4 });
  await server.advance(1);
  await checkpoint(run, 'fourth-active-tick', { tick: t + 4, x: 2000, seq: n, expiry: t + 4 });
  await server.advance(1);
  await checkpoint(run, 'fifth-tick-stopped', { tick: t + 5, x: 2000, seq: n, expiry: t + 4 });
  await server.advance(3);
  await checkpoint(run, 'outside-envelope-gap', { tick: t + 8, x: 2000, seq: n, expiry: t + 4 });
  await deliver(run, n + 1, 'E');
  await checkpoint(run, 'readmitted-before-next-tick', { tick: t + 8, x: 2000, seq: n + 1, expiry: t + 12 });
  await server.advance(1);
  await checkpoint(run, 'resumes-one-step', { tick: t + 9, x: 2250, seq: n + 1, expiry: t + 12 });
}

async function lostRequest(run) {
  const { start: t, sequence: n, server } = run;
  // The first application attempt is withheld; only its retry reaches HTTP.
  const withheld = { seq: n, move: 'E', interact: true };
  await server.advance(2);
  await checkpoint(run, 'undelivered-request-has-no-effect', { tick: t + 2 });
  await deliver(run, withheld.seq, withheld.move, withheld.interact);
  await checkpoint(run, 'first-delivered-copy', { tick: t + 2, seq: n, expiry: t + 6 });
  await server.advance(1);
  await checkpoint(run, 'delivered-copy-applies-once', { tick: t + 3, x: 1250, seq: n, expiry: t + 6, decision: denied(t + 3) });
  await deliver(run, withheld.seq, withheld.move, withheld.interact);
  await server.advance(2);
  await checkpoint(run, 'retry-keeps-original-expiry-and-decision', { tick: t + 5, x: 1750, seq: n, expiry: t + 6, decision: denied(t + 3) });
}

async function lostResponse(run) {
  const { start: t, sequence: n, server } = run;
  // Discard the first successful response at the application boundary. The
  // subsequent requests contain the exact same command, including sequence.
  await deliver(run, n, 'E', true);
  await server.advance(1);
  await checkpoint(run, 'response-discarded-after-effect', { tick: t + 1, x: 1250, seq: n, expiry: t + 4, decision: denied(t + 1) });
  for (const [offset, x] of [[2, 1500], [3, 1750], [4, 2000]]) {
    await deliver(run, n, 'E', true);
    await server.advance(1);
    await checkpoint(run, `unchanged-retry-${offset}`, { tick: t + offset, x, seq: n, expiry: t + 4, decision: denied(t + 1) });
  }
  await server.advance(1);
  await checkpoint(run, 'retry-did-not-renew', { tick: t + 5, x: 2000, seq: n, expiry: t + 4, decision: denied(t + 1) });
}

async function polling(run) {
  const { start: t, sequence: n, server } = run;
  await deliver(run, n, 'E');
  await server.advance(3);
  const thirdTick = { tick: t + 3, x: 1750, seq: n, expiry: t + 4 };
  await checkpoint(run, 'poll-before-expiry', thirdTick);
  await checkpoint(run, 'same-tick-poll-is-read-only', thirdTick);
  await server.advance(1);
  await checkpoint(run, 'poll-at-expiry', { tick: t + 4, x: 2000, seq: n, expiry: t + 4 });
  await server.advance(1);
  const stopped = { tick: t + 5, x: 2000, seq: n, expiry: t + 4 };
  await checkpoint(run, 'poll-after-expiry', stopped);
  await checkpoint(run, 'repeat-expired-poll', stopped);
  await server.advance(2);
  await checkpoint(run, 'polling-does-not-renew', { tick: t + 7, x: 2000, seq: n, expiry: t + 4 });
}

async function humanRepress(run) {
  const { at: t, seq: n } = await toCore(run);
  await deliver(run, n + 1, 'idle', true);
  await run.server.advance(1);
  await checkpoint(run, 'human-pickup', {
    tick: t + 1, x: run.coreX, seq: n + 1, expiry: t + 4, cargo: true, cooldown: t + 5, decision: pickup(t + 1),
  });
  for (const offset of [2, 3, 4]) {
    await deliver(run, n + offset, 'idle', true);
    await run.server.advance(1);
    await checkpoint(run, `ordinary-repress-${offset - 1}`, {
      tick: t + offset, x: run.coreX, seq: n + offset, expiry: t + offset + 3,
      cargo: true, cooldown: t + 5, decision: denied(t + offset, 'cooldown'),
    });
  }
}

async function anticipation(run) {
  const { start: t, sequence: n, server, approachSteps: k } = run;
  await deliver(run, n, 'E');
  await server.advance(k);
  await checkpoint(run, 'approaching-core', { tick: t + k, x: run.coreX - 750, seq: n, expiry: t + 4 });
  await deliver(run, n + 1, 'E', true);
  await server.advance(1);
  await checkpoint(run, 'press-at-500-mm', { tick: t + k + 1, x: run.coreX - 500, seq: n + 1, expiry: t + k + 4, decision: denied(t + k + 1) });
  await deliver(run, n + 2, 'E', true);
  await server.advance(1);
  await checkpoint(run, 'press-at-250-mm-picks-up', {
    tick: t + k + 2, x: run.coreX - 250, seq: n + 2, expiry: t + k + 5,
    cargo: true, cooldown: t + k + 6, decision: pickup(t + k + 2),
  });
  await deliver(run, n + 3, 'E', true);
  await server.advance(1);
  await checkpoint(run, 'nearby-repress-during-cooldown', {
    tick: t + k + 3, x: run.coreX, seq: n + 3, expiry: t + k + 6,
    cargo: true, cooldown: t + k + 6, decision: denied(t + k + 3, 'cooldown'),
  });
}

async function distant(run) {
  const { start: t, sequence: n, server } = run;
  for (const offset of [1, 2, 3]) {
    await deliver(run, n + offset - 1, 'idle', true);
    await server.advance(1);
    const findings = offset === 3 ? [{ kind: 'repeated-invalid-action', tick: t + 3 }] : [];
    await checkpoint(run, `distant-denial-${offset}`, {
      tick: t + offset, seq: n + offset - 1, expiry: t + offset + 3, decision: denied(t + offset), findings,
    });
  }
  await deliver(run, n + 3, 'E');
  await server.advance(1);
  await checkpoint(run, 'advisory-does-not-block-movement', {
    tick: t + 4, x: 1250, seq: n + 3, expiry: t + 7, decision: denied(t + 3),
    findings: [{ kind: 'repeated-invalid-action', tick: t + 3 }],
  });
}

const RUNNERS = Object.freeze({
  'continuous-renewals': continuous, 'reordered-input': reordered, 'same-tick-clump': clump,
  'expiry-gap': expiryGap, 'lost-request': lostRequest, 'lost-response': lostResponse,
  'state-polling': polling, 'human-repress': humanRepress,
  'human-anticipatory': anticipation, 'distant-script': distant,
});

/** Run on a fresh owner-clock server; gameplay always crosses actual HTTP. */
export async function runDeliverySchedule(server, name, { seed = 17 } = {}) {
  if (!Object.hasOwn(RUNNERS, name)) throw new Error(`Unknown delivery schedule: ${name}`);
  const runner = RUNNERS[name];
  const run = await begin(server, name, seed);
  await runner(run);
  return { name, seed, actor: run.actor, checkpoints: run.checkpoints };
}
