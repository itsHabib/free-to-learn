import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, join, admit, advance, snapshot, events, canonical, replay } from '../engine.mjs';
import { createDetector, expireObservations, interactionDenial, observeDenial } from '../defense.mjs';
import { parseInput } from '../protocol.mjs';

const input = (seq, move = 'idle', interact = false) => ({ v: 1, seq, move, interact });

function setup(seed = 17, options) {
  const world = createWorld(seed, options);
  const actor = join(world);
  return { world, actor };
}

function travel(world, actor, move, ticks) {
  let remaining = ticks;
  while (remaining > 0) {
    const count = Math.min(remaining, 4);
    assert.equal(admit(world, actor.id, input(actor.lastSeq + 1, move)).status, 'admitted');
    advance(world, count);
    remaining -= count;
  }
}

function act(world, actor) {
  admit(world, actor.id, input(actor.lastSeq + 1, 'idle', true));
  advance(world, 1);
  return snapshot(world, actor.id);
}

test('initial snapshot has exactly the public detached shape and seeded targets', () => {
  const { world, actor } = setup();
  const initial = snapshot(world, actor.id);
  assert.deepEqual(initial, {
    tick: 0,
    actor: { id: 'actor-1', x: 1000, y: 1000, score: 0, cargo: false, lastSeq: 0, expiresAt: 0, nextInteractTick: 0 },
    core: { x: 2500, y: 1000 }, depot: { x: 1000, y: 1000 },
    arena: { width: 8000, height: 4000, wall: { x: 4000, y: 0, width: 250, height: 2500 } },
    lastDecision: null, findings: [],
  });
  initial.actor.x = 8000;
  initial.arena.wall.width = 0;
  initial.core.x = 0;
  initial.findings.push({ kind: 'fake' });
  assert.equal(snapshot(world, actor.id).actor.x, 1000);
  assert.equal(snapshot(world, actor.id).arena.wall.width, 250);
  assert.equal(snapshot(world, actor.id).core.x, 2500);
  assert.deepEqual(snapshot(world, actor.id).findings, []);
  const zero = setup(0);
  assert.equal(snapshot(zero.world, zero.actor.id).core.x, 2000);
});

test('world rejects invalid seeds and mutants and limits deterministic joins', () => {
  for (const seed of [NaN, Infinity, 1.2, '17', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createWorld(seed), /seed must be a safe integer/);
  }
  assert.throws(() => createWorld(17, { mutant: 'remote-code' }), /unknown mutant/);
  const world = createWorld(-1);
  assert.deepEqual(Array.from({ length: 4 }, () => join(world).id), ['actor-1', 'actor-2', 'actor-3', 'actor-4']);
  assert.throws(() => join(world), /session limit/);
  assert.equal(world.actors.length, 4);
  assert.equal(snapshot(world, 'actor-1').core.x, 2500);
  assert.throws(() => snapshot(world, 'missing'), /unknown actor/);
});

test('strict parser accepts only the four declared fields and exact types', () => {
  for (const move of ['N', 'S', 'E', 'W', 'idle']) {
    for (const seq of [1, 1_000_000]) {
      const value = input(seq, move, true);
      assert.deepEqual(parseInput(JSON.stringify(value)), { ok: true, input: value });
    }
  }
  const invalid = [
    null, [], 7, 'text', {}, { ...input(1), score: 999 }, { ...input(1), id: 'actor-2' },
    { ...input(1), x: 5000 }, { ...input(1), clientTime: 0 }, { ...input(1), inventory: [] },
    { ...input(1), v: '1' }, { ...input(1), v: 2 }, { ...input(1), seq: 0 },
    { ...input(1), seq: -1 }, { ...input(1), seq: 1_000_001 }, { ...input(1), seq: 1.5 },
    { ...input(1), seq: '1' }, { ...input(1), move: 'NE' }, { ...input(1), move: null },
    { ...input(1), interact: 1 }, { ...input(1), interact: 'false' },
    { v: 1, seq: 1, move: 'E' }, { ...input(1), __protoField: 1 },
  ];
  for (const value of invalid) {
    const result = parseInput(JSON.stringify(value));
    assert.equal(result.ok, false, JSON.stringify(value));
    assert.equal(typeof result.reason, 'string');
    assert.deepEqual(Object.keys(result).sort(), ['ok', 'reason']);
  }
  assert.deepEqual(parseInput('{'), { ok: false, reason: 'invalid-json' });
  assert.deepEqual(parseInput(input(1)), { ok: false, reason: 'input-text-required' });
});

test('malformed and unknown-actor admission cannot consume sequence or mutate intent', () => {
  const { world, actor } = setup();
  const before = canonical(world);
  for (const value of [{ ...input(100), score: 999 }, input(0), { ...input(1), move: ['E'] }, null]) {
    assert.equal(admit(world, actor.id, value).status, 'rejected');
  }
  assert.deepEqual(admit(world, 'missing', input(1)), { status: 'rejected', reason: 'unknown-actor', tick: 0, seq: 1 });
  assert.deepEqual(canonical(world), before);
  assert.deepEqual(events(world).events, [{ type: 'join', id: actor.id }]);
  assert.equal(admit(world, actor.id, input(1)).status, 'admitted');
});

test('duplicate same-tick input leaves the first direction and exactly one interaction', () => {
  const { world, actor } = setup();
  assert.deepEqual(admit(world, actor.id, input(1, 'E', true)), { status: 'admitted', reason: 'accepted', tick: 0, seq: 1 });
  assert.deepEqual(admit(world, actor.id, input(1, 'W', true)), { status: 'stale', reason: 'stale-sequence', tick: 0, seq: 1 });
  advance(world, 1);
  assert.equal(actor.x, 1250);
  assert.deepEqual(snapshot(world, actor.id).lastDecision, { status: 'denied', reason: 'range', tick: 1 });
  advance(world, 1);
  assert.equal(snapshot(world, actor.id).lastDecision.tick, 1);
  assert.equal(actor.detector.buckets.flatMap((bucket) => bucket.observations).length, 1);
});

test('sequence gaps are allowed and a stale request changes neither intent nor lastSeen', () => {
  const { world, actor } = setup();
  admit(world, actor.id, input(2, 'N'));
  assert.equal(admit(world, actor.id, input(1, 'E', true)).status, 'stale');
  advance(world, 1);
  assert.deepEqual([actor.x, actor.y, actor.lastSeq, actor.lastSeen], [1000, 750, 2, 0]);
  assert.equal(snapshot(world, actor.id).lastDecision, null);
  assert.equal(admit(world, actor.id, input(200, 'S')).status, 'admitted');
  assert.equal(actor.lastSeen, 1);
  advance(world, 1);
  assert.equal(actor.y, 1000);
  assert.equal(actor.lastSeq, 200);
});

test('new movement replaces old movement while interaction bits coalesce through false', () => {
  const { world, actor } = setup();
  admit(world, actor.id, input(1, 'E', true));
  admit(world, actor.id, input(2, 'W', true));
  admit(world, actor.id, input(3, 'idle', false));
  advance(world, 1);
  assert.deepEqual([actor.x, actor.y, actor.lastSeq], [1000, 1000, 3]);
  assert.deepEqual(snapshot(world, actor.id).lastDecision, { status: 'denied', reason: 'range', tick: 1 });
  advance(world, 4);
  assert.equal(snapshot(world, actor.id).lastDecision.tick, 1);
});

test('movement expires after four ticks and same-tick renewal has no gap', () => {
  const expired = setup();
  admit(expired.world, expired.actor.id, input(1, 'E'));
  advance(expired.world, 4);
  assert.equal(expired.actor.x, 2000);
  advance(expired.world, 3);
  assert.equal(expired.actor.x, 2000);
  const renewed = setup();
  admit(renewed.world, renewed.actor.id, input(1, 'E'));
  advance(renewed.world, 4);
  admit(renewed.world, renewed.actor.id, input(2, 'E'));
  advance(renewed.world, 1);
  assert.equal(renewed.actor.x, 2250);
  assert.equal(renewed.actor.expiresAt, 8);
  assert.equal(snapshot(renewed.world, renewed.actor.id).actor.expiresAt, 8);
});

test('a stale request at expiry cannot renew movement or queue an interaction', () => {
  const { world, actor } = setup();
  admit(world, actor.id, input(2, 'E'));
  advance(world, 4);
  assert.equal(admit(world, actor.id, input(1, 'N', true)).status, 'stale');
  advance(world, 1);
  assert.deepEqual([actor.x, actor.y, actor.expiresAt, actor.lastSeen], [2000, 1000, 4, 0]);
  assert.equal(snapshot(world, actor.id).lastDecision, null);
});

test('each tick moves before evaluating a staged interaction', () => {
  const { world, actor } = setup();
  travel(world, actor, 'E', 4);
  assert.equal(actor.x, 2000);
  admit(world, actor.id, input(actor.lastSeq + 1, 'E', true));
  advance(world, 1);
  assert.equal(actor.x, 2250);
  assert.equal(actor.cargo, true);
  assert.deepEqual(snapshot(world, actor.id).lastDecision, { status: 'applied', reason: 'pickup', tick: 5 });
});

test('the honest six-tick route picks up and deposits once with cooldown', () => {
  const { world, actor } = setup();
  travel(world, actor, 'E', 6);
  assert.equal(actor.x, 2500);
  assert.equal(act(world, actor).lastDecision.reason, 'pickup');
  assert.equal(actor.cargo, true);
  travel(world, actor, 'W', 6);
  const deposited = act(world, actor);
  assert.deepEqual([actor.x, actor.score, actor.cargo], [1000, 1, false]);
  assert.deepEqual(deposited.core, { x: 2500, y: 1000 });
  assert.deepEqual(deposited.lastDecision, { status: 'applied', reason: 'deposit', tick: 14 });
  assert.equal(actor.nextInteractTick, 18);
  assert.equal(act(world, actor).lastDecision.reason, 'cooldown');
  assert.deepEqual([actor.score, actor.cargo], [1, false]);
  assert.equal(act(world, actor).lastDecision.reason, 'cooldown');
  assert.equal(act(world, actor).lastDecision.reason, 'cooldown');
  assert.equal(act(world, actor).lastDecision.reason, 'range');
  assert.equal(actor.score, 1);
  assert.deepEqual(replay(events(world)), canonical(world));
});

test('an unusual legal route uses the inclusive 250mm edge and isolates actor cargo', () => {
  const { world, actor } = setup();
  const other = join(world);
  travel(world, actor, 'E', 5);
  assert.equal(actor.x, 2250);
  assert.equal(act(world, actor).lastDecision.reason, 'pickup');
  assert.equal(snapshot(world, other.id).actor.cargo, false);
  travel(world, actor, 'W', 4);
  assert.equal(actor.x, 1250);
  assert.equal(act(world, actor).lastDecision.reason, 'deposit');
  assert.equal(actor.score, 1);
  assert.equal(snapshot(world, other.id).actor.score, 0);
  travel(world, other, 'E', 5);
  assert.equal(act(world, other).lastDecision.reason, 'pickup');
  assert.equal(other.cargo, true);
  assert.deepEqual(replay(events(world)), canonical(world));
});

test('proximity is squared Euclidean distance and cooldown has priority', () => {
  const target = { x: 2500, y: 1000 };
  assert.equal(interactionDenial({ x: 2250, y: 1000, nextInteractTick: 0 }, target, 1), null);
  assert.equal(interactionDenial({ x: 2250, y: 1001, nextInteractTick: 0 }, target, 1), 'range');
  assert.equal(interactionDenial({ x: 2300, y: 850, nextInteractTick: 0 }, target, 1), null);
  assert.equal(interactionDenial({ x: 1000, y: 1000, nextInteractTick: 3 }, target, 2), 'cooldown');
  assert.equal(interactionDenial({ x: 1000, y: 1000, nextInteractTick: 3 }, target, 3), 'range');
});

test('all arena boundaries block overflow and do not produce cheating findings', () => {
  const { world, actor } = setup();
  travel(world, actor, 'N', 5);
  assert.deepEqual([actor.x, actor.y], [1000, 0]);
  travel(world, actor, 'W', 5);
  assert.deepEqual([actor.x, actor.y], [0, 0]);
  travel(world, actor, 'S', 17);
  assert.deepEqual([actor.x, actor.y], [0, 4000]);
  travel(world, actor, 'E', 33);
  assert.deepEqual([actor.x, actor.y], [8000, 4000]);
  assert.deepEqual(snapshot(world, actor.id).findings, []);
  assert.equal(snapshot(world, actor.id).lastDecision, null);
});

test('wall blocks its inclusive segment and can be passed below its end', () => {
  const { world, actor } = setup();
  travel(world, actor, 'E', 12);
  assert.deepEqual([actor.x, actor.y], [3750, 1000]);
  travel(world, actor, 'S', 6);
  assert.deepEqual([actor.x, actor.y], [3750, 2500]);
  travel(world, actor, 'E', 1);
  assert.deepEqual([actor.x, actor.y], [3750, 2500]);
  travel(world, actor, 'S', 1);
  travel(world, actor, 'E', 3);
  assert.deepEqual([actor.x, actor.y], [4500, 2750]);
  travel(world, actor, 'N', 1);
  travel(world, actor, 'W', 2);
  assert.deepEqual([actor.x, actor.y], [4500, 2500]);
  assert.deepEqual(snapshot(world, actor.id).findings, []);
});

test('three distant range denials in twenty ticks yield advisory findings', () => {
  const { world, actor } = setup();
  for (let count = 0; count < 3; count += 1) act(world, actor);
  assert.deepEqual(snapshot(world, actor.id).findings, [{ kind: 'repeated-invalid-action', tick: 3 }]);
  assert.deepEqual([actor.score, actor.cargo], [0, false]);
  travel(world, actor, 'E', 1);
  assert.equal(actor.x, 1250);
  const other = setup();
  travel(other.world, other.actor, 'E', 5);
  act(other.world, other.actor);
  for (let count = 0; count < 3; count += 1) assert.equal(act(other.world, other.actor).lastDecision.reason, 'cooldown');
  assert.deepEqual(snapshot(other.world, other.actor.id).findings, []);
  assert.equal(other.actor.cargo, true);
});

test('human pickup re-presses and near-target anticipation produce no findings', () => {
  const { world, actor } = setup();
  travel(world, actor, 'E', 3);
  for (let index = 0; index < 3; index += 1) {
    admit(world, actor.id, input(actor.lastSeq + 1, 'E', true));
    advance(world, 1);
  }
  assert.deepEqual([actor.x, actor.cargo], [2500, true]);
  for (let index = 0; index < 2; index += 1) assert.equal(act(world, actor).lastDecision.reason, 'cooldown');
  assert.deepEqual(snapshot(world, actor.id).findings, []);
});

test('the detector excludes cooldown and the inclusive 500 mm boundary', () => {
  const detector = createDetector();
  for (let tick = 1; tick <= 3; tick += 1) {
    observeDenial(detector, tick, 'cooldown', 1_000_000);
    observeDenial(detector, tick, 'range', 250_000);
    observeDenial(detector, tick, 'range', 62_501);
    observeDenial(detector, tick, 'range');
  }
  assert.deepEqual(detector.findings, []);
  assert.equal(detector.buckets.flatMap((bucket) => bucket.observations).length, 0);
  for (let tick = 4; tick <= 6; tick += 1) observeDenial(detector, tick, 'range', 250_001);
  assert.deepEqual(detector.findings, [{ kind: 'repeated-invalid-action', tick: 6 }]);
});

test('twenty-tick window excludes old violations and stale retry floods', () => {
  const { world, actor } = setup();
  act(world, actor);
  advance(world, 19);
  act(world, actor);
  act(world, actor);
  assert.deepEqual(snapshot(world, actor.id).findings, []);
  act(world, actor);
  assert.deepEqual(snapshot(world, actor.id).findings, [{ kind: 'repeated-invalid-action', tick: 23 }]);
  advance(world, 20);
  assert.equal(actor.detector.buckets.flatMap((bucket) => bucket.observations).length, 0);
  const clean = setup();
  admit(clean.world, clean.actor.id, input(100, 'idle'));
  for (let count = 0; count < 500; count += 1) admit(clean.world, clean.actor.id, input(99, 'E', true));
  advance(clean.world, 3);
  assert.deepEqual(snapshot(clean.world, clean.actor.id).findings, []);
  assert.equal(clean.actor.detector.buckets.flatMap((bucket) => bucket.observations).length, 0);
});

test('detector keeps a bounded ring and at most one bounded finding per tick', () => {
  const detector = createDetector();
  for (let tick = 1; tick <= 400; tick += 1) {
    observeDenial(detector, tick, 'range', 1_000_000);
    observeDenial(detector, tick, 'cooldown', 1_000_000);
    observeDenial(detector, tick, 'stale', 1_000_000);
  }
  assert.equal(detector.buckets.length, 20);
  assert.equal(detector.buckets.flatMap((bucket) => bucket.observations).length, 20);
  assert.equal(detector.findings.length, 128);
  assert.equal(new Set(detector.findings.map((finding) => finding.tick)).size, 128);
  assert.deepEqual(detector.findings.at(-1), { kind: 'repeated-invalid-action', tick: 400 });
  expireObservations(detector, 420);
  assert.equal(detector.buckets.flatMap((bucket) => bucket.observations).length, 0);
});

test('records preserve ordered valid inputs including stale admissions and detach all fields', () => {
  const { world, actor } = setup();
  const staged = input(2, 'N');
  admit(world, actor.id, staged);
  staged.move = 'E';
  admit(world, actor.id, input(1, 'W', true));
  advance(world, 1);
  const record = events(world);
  assert.deepEqual(record.events, [
    { type: 'join', id: 'actor-1' },
    { type: 'input', id: 'actor-1', input: input(2, 'N') },
    { type: 'input', id: 'actor-1', input: input(1, 'W', true) },
    { type: 'tick' },
  ]);
  assert.deepEqual(replay(record), canonical(world));
  record.events[1].input.move = 'E';
  record.final.actors[0].actor.x = 0;
  assert.equal(events(world).events[1].input.move, 'N');
  assert.equal(canonical(world).actors[0].actor.x, 1000);
});

test('replay is independent of JSON property order but rejects altered results and invalid events', () => {
  const { world, actor } = setup();
  admit(world, actor.id, input(1, 'E'));
  advance(world, 3);
  const reordered = JSON.parse(JSON.stringify(events(world)), (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).reverse());
  });
  assert.deepEqual(replay(reordered), canonical(world));
  const malformed = [
    { ...events(world), version: 2 }, { ...events(world), dropped: 1 },
    { ...events(world), events: null }, { ...events(world), events: [{ type: 'reset' }] },
    { ...events(world), events: [{ type: 'tick', ticks: 5 }] },
    { ...events(world), events: [{ type: 'join', id: 'actor-2' }] },
    { ...events(world), events: [{ type: 'input', id: 'missing', input: input(1) }] },
    { ...events(world), events: [{ type: 'join', id: 'actor-1' }, { type: 'input', id: 'actor-1', input: { ...input(1), score: 999 } }] },
  ];
  for (const record of malformed) assert.throws(() => replay(record), /replay|records/);
  const forged = events(world);
  forged.final.actors[0].actor.score = 999;
  assert.throws(() => replay(forged), /final state mismatch/);
  const reorderedActions = events(world);
  [reorderedActions.events[1], reorderedActions.events[2]] = [reorderedActions.events[2], reorderedActions.events[1]];
  assert.throws(() => replay(reorderedActions), /final state mismatch/);
});

test('event history caps at 4096 and dropped history cannot claim complete replay', () => {
  const { world, actor } = setup();
  for (let count = 0; count < 4096; count += 1) admit(world, actor.id, input(1));
  const record = events(world);
  assert.equal(record.events.length, 4096);
  assert.equal(record.dropped, 1);
  assert.equal(record.events[0].type, 'input');
  assert.throws(() => replay(record), /dropped records/);
  assert.throws(() => replay({ ...record, dropped: 0, events: [...record.events, { type: 'tick' }] }), /invalid replay events/);
});

test('advance refuses unbounded or invalid tick requests without changing state', () => {
  const { world } = setup();
  for (const ticks of [0, -1, 101, 1.5, Infinity, NaN, '1']) assert.throws(() => advance(world, ticks), /ticks must/);
  assert.equal(world.tick, 0);
  advance(world, 100);
  assert.equal(world.tick, 100);
});

test('omit-proximity negative control changes remote pickup, so the regression detects it', () => {
  const normal = setup();
  const broken = setup(17, { mutant: 'omit-proximity' });
  const legalState = act(normal.world, normal.actor);
  const mutantState = act(broken.world, broken.actor);
  assert.equal(legalState.actor.cargo, false);
  assert.equal(legalState.lastDecision.reason, 'range');
  assert.equal(mutantState.actor.cargo, true);
  assert.equal(mutantState.lastDecision.reason, 'pickup');
  assert.throws(() => assert.equal(mutantState.actor.cargo, false), assert.AssertionError);
  assert.throws(() => replay(events(broken.world)), /final state mismatch/);
});

test('omit-sequence negative control changes direction, so the regression detects it', () => {
  const normal = setup();
  const broken = setup(17, { mutant: 'omit-sequence' });
  for (const { world, actor } of [normal, broken]) {
    admit(world, actor.id, input(2, 'N'));
    admit(world, actor.id, input(1, 'E'));
    advance(world, 1);
  }
  assert.deepEqual([normal.actor.x, normal.actor.y], [1000, 750]);
  assert.deepEqual([broken.actor.x, broken.actor.y], [1250, 1000]);
  assert.throws(() => assert.deepEqual([broken.actor.x, broken.actor.y], [1000, 750]), assert.AssertionError);
  assert.throws(() => replay(events(broken.world)), /final state mismatch/);
});
