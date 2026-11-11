import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, join, admit, advance, canonical, events, replay } from '../engine.mjs';
import { createDetector } from '../defense.mjs';
import { capture, restore, createRecordedEngine, createReplayEngine, equal, RUNTIME_RELEASE } from '../telemetry/runtime.mjs';
import { replayWindow } from '../telemetry/policy.mjs';
import { assess, cases } from '../telemetry/fixtures.mjs';
import { correctPolicies, wrongPolicies } from '../telemetry/controls.mjs';
import * as template from '../telemetry/template.mjs';

const input = (seq, move = 'idle', interact = false) => ({ v: 1, seq, move, interact });
const clone = (value) => JSON.parse(JSON.stringify(value));
const facade = createReplayEngine();

function replayWorld(record) {
  const world = facade.restore(record.checkpoint);
  for (const { event } of record.events) facade.apply(world, event);
  return world;
}

function deny(engine, actor, seq) {
  engine.admit(actor.id, input(seq, 'idle', true));
  engine.advance(1);
}

test('a new recorder exposes a detached, complete zero-event window', () => {
  const recorder = createRecordedEngine(-5);
  const record = recorder.window();
  assert.deepEqual(Object.keys(record).sort(), ['checkpoint', 'complete', 'endIndex', 'events', 'final', 'runtimeRelease', 'schema', 'startIndex']);
  assert.deepEqual([record.schema, record.runtimeRelease, record.startIndex, record.endIndex, record.complete], [1, RUNTIME_RELEASE, 0, 0, true]);
  assert.deepEqual(replayWindow(record, facade), { ok: true, state: canonical(recorder.world) });
  record.checkpoint.core.x = -1;
  record.final.tick = 100;
  assert.equal(recorder.window().checkpoint.core.x, 2250);
  assert.equal(recorder.world.tick, 0);
});

test('complete windows replay the existing engine, including stale input and interaction coalescing', () => {
  const recorder = createRecordedEngine(17);
  const actor = recorder.join();
  const staged = input(2, 'E', true);
  recorder.admit(actor.id, staged);
  staged.move = 'W';
  assert.equal(recorder.admit(actor.id, input(1, 'W', true)).status, 'stale');
  recorder.admit(actor.id, input(3, 'idle', false));
  recorder.advance(2);
  const record = recorder.window();
  assert.deepEqual(record.events.map(({ index }) => index), [1, 2, 3, 4, 5, 6]);
  assert.equal(record.events[1].event.input.move, 'E');
  assert.equal(record.events[2].event.input.seq, 1);
  assert.deepEqual(actor.lastDecision, { status: 'denied', reason: 'range', tick: 1 });
  assert.equal(actor.x, 1000);
  assert.deepEqual(replayWindow(record, facade), { ok: true, state: canonical(recorder.world) });
  assert.deepEqual(capture(replayWorld(record)), capture(recorder.world));
});

test('rollover checkpoints the prior state before a causal operation and keeps absolute indices', () => {
  const recorder = createRecordedEngine(17, { capacity: 2 });
  const actor = recorder.join();
  recorder.admit(actor.id, input(1, 'E', true));
  const prior = capture(recorder.world);
  const older = recorder.window();
  recorder.advance(1);
  const rolled = recorder.window();
  assert.deepEqual([rolled.startIndex, rolled.endIndex, rolled.events.length], [2, 3, 1]);
  assert.deepEqual(rolled.checkpoint, prior);
  assert.deepEqual(rolled.events, [{ index: 3, event: { type: 'tick' } }]);
  assert.deepEqual(replayWindow(rolled, facade), { ok: true, state: canonical(recorder.world) });
  recorder.advance(7);
  const latest = recorder.window();
  assert.deepEqual([latest.startIndex, latest.endIndex], [8, 10]);
  assert.deepEqual(latest.events.map(({ index }) => index), [9, 10]);
  assert.deepEqual(replayWindow(latest, facade), { ok: true, state: canonical(recorder.world) });
  assert.deepEqual([older.startIndex, older.endIndex, older.checkpoint.tick], [0, 2, 0]);
  assert.deepEqual(replayWindow(older, facade).state, older.final);
});

test('rejected operations do not roll a full window or consume indices', () => {
  const recorder = createRecordedEngine(0, { capacity: 1 });
  const actor = recorder.join();
  const before = recorder.window();
  assert.equal(recorder.admit('unknown', input(1)).status, 'rejected');
  assert.equal(recorder.admit(actor.id, { ...input(1), token: 'secret' }).status, 'rejected');
  for (const ticks of [0, -1, 101, 0.5, Infinity, NaN, '2']) assert.throws(() => recorder.advance(ticks), /ticks must/);
  assert.deepEqual(recorder.window(), before);
  recorder.admit(actor.id, input(1));
  const full = recorder.window();
  recorder.admit(actor.id, input(1, 'E', true));
  assert.equal(recorder.window().endIndex, full.endIndex + 1);
  assert.equal(recorder.window().events[0].event.input.seq, 1);
  assert.equal(replayWindow(recorder.window(), facade).ok, true);
});

test('capture and restore preserve pending interaction, movement, expiry and cooldown for future execution', () => {
  const recorder = createRecordedEngine(0);
  const actor = recorder.join();
  recorder.admit(actor.id, input(1, 'E'));
  recorder.advance(3);
  recorder.admit(actor.id, input(2, 'E', true));
  const checkpoint = capture(recorder.world);
  const continuation = restore(checkpoint);
  assert.deepEqual(capture(continuation), checkpoint);
  recorder.advance(1);
  advance(continuation, 1);
  assert.equal(actor.cargo, true);
  const afterFirstTick = canonical(recorder.world);
  assert.deepEqual(capture(continuation), capture(recorder.world));
  admit(continuation, actor.id, input(3, 'idle', true));
  recorder.admit(actor.id, input(3, 'idle', true));
  recorder.advance(1);
  advance(continuation, 1);
  assert.equal(actor.lastDecision.reason, 'cooldown');
  assert.deepEqual(capture(continuation), capture(recorder.world));
  recorder.advance(10);
  advance(continuation, 10);
  assert.deepEqual(capture(continuation), capture(recorder.world));
  const missingIntent = clone(checkpoint);
  missingIntent.actors[0].move = 'idle';
  const changed = restore(missingIntent);
  advance(changed, 1);
  assert.notDeepEqual(canonical(changed), afterFirstTick);
  assert.equal(changed.actors[0].x, 1750);
  assert.equal(changed.actors[0].lastDecision.reason, 'pickup');
});

test('restored detector buckets affect the next finding and age out at the same tick', () => {
  const recorder = createRecordedEngine(17);
  const actor = recorder.join();
  deny(recorder, actor, 1);
  deny(recorder, actor, 2);
  recorder.admit(actor.id, input(3, 'idle', true));
  const checkpoint = capture(recorder.world);
  const restored = restore(checkpoint);
  const erased = clone(checkpoint);
  erased.actors[0].detector = createDetector();
  const withoutEvidence = restore(erased);
  recorder.advance(1);
  advance(restored, 1);
  advance(withoutEvidence, 1);
  assert.deepEqual(restored.actors[0].detector.findings, [{ kind: 'repeated-invalid-action', tick: 3 }]);
  assert.deepEqual(withoutEvidence.actors[0].detector.findings, []);
  assert.deepEqual(capture(restored), capture(recorder.world));
  recorder.advance(20);
  advance(restored, 20);
  assert.deepEqual(restored.actors[0].detector.buckets, createDetector().buckets);
  assert.deepEqual(capture(restored), capture(recorder.world));
});

test('strict restore rejects missing, unknown, inconsistent and unbounded checkpoint state', () => {
  const recorder = createRecordedEngine(17);
  const actor = recorder.join();
  deny(recorder, actor, 1);
  const checkpoint = capture(recorder.world);
  const edits = [
    (c) => { c.schema = 2; },
    (c) => { c.token = 'secret'; },
    (c) => { c.seed = Infinity; },
    (c) => { c.tick = -1; },
    (c) => { c.tick = Number.MAX_SAFE_INTEGER; },
    (c) => { c.core.x = 2000; },
    (c) => { c.actors.push(...Array.from({ length: 4 }, () => clone(c.actors[0]))); },
    (c) => { c.actors[0].id = 'actor-2'; },
    (c) => { c.actors[0].x = NaN; },
    (c) => { c.actors[0].x = 4000; },
    (c) => { c.actors[0].y = 4001; },
    (c) => { c.actors[0].cargo = 1; },
    (c) => { c.actors[0].score = -1; },
    (c) => { c.actors[0].lastSeq = 1_000_001; },
    (c) => { c.actors[0].expiresAt = 99; },
    (c) => { c.actors[0].lastSeen = 2; },
    (c) => { c.actors[0].move = 'NE'; },
    (c) => { c.actors[0].pendingInteract = null; },
    (c) => { c.actors[0].nextInteractTick = 99; },
    (c) => { c.actors[0].lastDecision.reason = 'ban'; },
    (c) => { c.actors[0].detector.buckets.pop(); },
    (c) => { delete c.actors[0].detector.buckets[0]; },
    (c) => { c.actors[0].detector.findings = new Array(1); },
    (c) => { c.actors[0].detector.buckets[1].observations[0].reason = 'cooldown'; },
    (c) => { c.actors[0].detector.buckets[1].tick = 21; },
    (c) => { c.actors[0].detector.findings = Array.from({ length: 129 }, () => ({ kind: 'repeated-invalid-action', tick: 1 })); },
  ];
  for (const key of ['lastSeq', 'lastSeen', 'expiresAt', 'nextInteractTick', 'move', 'pendingInteract', 'lastDecision', 'detector']) {
    edits.push((c) => { delete c.actors[0][key]; });
  }
  for (const edit of edits) {
    const changed = clone(checkpoint);
    edit(changed);
    assert.throws(() => restore(changed), /invalid checkpoint/);
  }
  const detached = restore(checkpoint);
  detached.actors[0].detector.buckets[1].observations.length = 0;
  assert.equal(checkpoint.actors[0].detector.buckets[1].observations.length, 1);
});

test('facade refuses unknown events and invalid payloads without accepting arbitrary state writes', () => {
  const recorder = createRecordedEngine(17);
  const actor = recorder.join();
  const world = restore(capture(recorder.world));
  const invalid = [null, [], { type: 'teleport', x: 2 }, { type: 'tick', count: 2 },
    { type: 'join', id: actor.id }, { type: 'input', id: 'missing', input: input(1) },
    { type: 'input', id: actor.id, input: { ...input(1), v: 2 } },
    { type: 'input', id: actor.id, input: { ...input(1), seq: Infinity } },
    { type: 'input', id: actor.id, input: { ...input(1), seq: 1_000_001 } },
    { type: 'input', id: actor.id, input: { ...input(1), score: 100 } },
    { type: 'input', id: actor.id, input: { ...input(1), move: 'NE' } },
    { type: 'input', id: actor.id, input: { ...input(1), interact: 'true' } }];
  const before = capture(world);
  for (const event of invalid) assert.throws(() => facade.apply(world, event), /invalid/);
  assert.deepEqual(capture(world), before);
});

test('learner policy distinguishes all refusal reasons and rejects sequence gaps even for no-op stale input', () => {
  for (const item of cases()) assert.deepEqual(replayWindow(item.record, facade), item.expected, item.name);
  const source = cases()[0].record;
  const missingStale = clone(source);
  missingStale.events.splice(3, 1);
  assert.deepEqual(canonical(replayWorld(missingStale)), source.final);
  assert.deepEqual(replayWindow(missingStale, facade), { ok: false, reason: 'sequence' });
  const badShapes = [null, [], 1, 'record', {}, { ...source, schema: '1' }];
  for (const record of badShapes) assert.deepEqual(replayWindow(record, facade), { ok: false, reason: 'schema' });
  for (const events of [null, {}, 'events']) assert.deepEqual(replayWindow({ ...source, events }, facade), { ok: false, reason: 'incomplete' });
});

test('canonical comparison ignores key order but rejects missing fields, extra fields and invalid numbers', () => {
  assert.equal(equal({ a: [1, true, null], b: 'x' }, { b: 'x', a: [1, true, null] }), true);
  for (const pair of [[{ a: 1 }, { a: 1, b: 2 }], [[1], [1, 2]], [NaN, NaN], [Infinity, Infinity], [undefined, undefined]]) {
    assert.equal(equal(...pair), false);
  }
  const cyclic = {};
  cyclic.cyclic = cyclic;
  assert.equal(equal(cyclic, cyclic), false);
});

test('the window contains no transport tokens and no mutable aliases', () => {
  const recorder = createRecordedEngine(17, { capacity: 1 });
  const actor = recorder.join();
  recorder.world.token = 'bearer-transport-secret';
  actor.authorization = 'Bearer transport-secret';
  recorder.admit(actor.id, input(1, 'E', true));
  recorder.advance(1);
  const record = recorder.window();
  assert.doesNotMatch(JSON.stringify(record), /token|authorization|Bearer|transport-secret/i);
  assert.equal(replayWindow(record, facade).ok, true);
  record.events[0].event.type = 'forged';
  record.checkpoint.actors[0].detector.buckets[1].observations.push({ tick: 1, reason: 'range' });
  record.final.actors[0].actor.score = 99;
  assert.equal(recorder.window().events[0].event.type, 'tick');
  assert.equal(recorder.world.actors[0].score, 0);
});

test('capacity, actor count, event count and long sessions remain bounded', () => {
  for (const capacity of [0, -1, 257, Infinity, NaN, 1.5, '4']) assert.throws(() => createRecordedEngine(17, { capacity }), /capacity must/);
  const recorder = createRecordedEngine(17, { capacity: 3 });
  const actors = Array.from({ length: 4 }, () => recorder.join());
  assert.throws(() => recorder.join(), /session limit/);
  for (let count = 0; count < 50; count += 1) recorder.advance(100);
  for (let seq = 1; seq <= 300; seq += 1) deny(recorder, actors[0], seq);
  const record = recorder.window();
  assert.ok(record.events.length <= 3);
  assert.equal(record.endIndex, 5604);
  assert.equal(recorder.world.history.length, 4096);
  assert.equal(record.checkpoint.actors[0].detector.buckets.length, 20);
  assert.ok(record.checkpoint.actors[0].detector.findings.length <= 128);
  assert.equal(replayWindow(record, facade).ok, true);
  assert.deepEqual(capture(replayWorld(record)), capture(recorder.world));
});

test('legacy v1 records and replay keep their original behavior', () => {
  const world = createWorld(17);
  const actor = join(world);
  admit(world, actor.id, input(1, 'E', true));
  advance(world, 2);
  assert.deepEqual(replay(events(world)), canonical(world));
  assert.equal(events(world).version, 1);
  const recorder = createRecordedEngine(17);
  const recordedActor = recorder.join();
  recorder.admit(recordedActor.id, input(1, 'E', true));
  recorder.advance(2);
  assert.deepEqual(events(recorder.world), events(world));
});

test('owner-only mutant options reach the old engine while replay uses normal rules', () => {
  assert.throws(() => createRecordedEngine(17, { mutant: 'unknown' }), /unknown mutant/);
  const proximity = createRecordedEngine(17, { mutant: 'omit-proximity' });
  const actor = proximity.join();
  proximity.admit(actor.id, input(1, 'idle', true));
  proximity.advance(1);
  assert.equal(actor.cargo, true);
  assert.deepEqual(replayWindow(proximity.window(), facade), { ok: false, reason: 'final' });
  const ordering = createRecordedEngine(17, { mutant: 'omit-sequence' });
  const other = ordering.join();
  ordering.admit(other.id, input(2, 'E'));
  assert.equal(ordering.admit(other.id, input(1, 'W')).status, 'admitted');
  ordering.advance(1);
  assert.equal(other.x, 750);
  assert.deepEqual(replayWindow(ordering.window(), facade), { ok: false, reason: 'final' });
  assert.equal(Object.hasOwn(proximity.window().checkpoint, 'mutant'), false);
});

test('assessment accepts two independent policies and rejects every plausible wrong control by behavior', async () => {
  for (const [name, candidate] of Object.entries(correctPolicies)) {
    const result = await assess(candidate);
    assert.equal(result.passed, true, `${name}: ${JSON.stringify(result.criteria.filter((criterion) => !criterion.passed))}`);
  }
  for (const [name, candidate] of Object.entries(wrongPolicies)) {
    const result = await assess(candidate);
    assert.equal(result.passed, false, name);
    assert.ok(result.criteria.some((criterion) => !criterion.passed && Object.hasOwn(criterion.error, 'expected') && Object.hasOwn(criterion.error, 'actual')), name);
    assert.ok(result.criteria.every((criterion) => !criterion.error?.actual?.threw), `${name} was rejected only by throwing`);
  }
  assert.equal((await assess({})).passed, false);
  assert.equal((await assess(template)).passed, false);
  const rewritesExpected = await assess({
    replayWindow(record) {
      record.final.actors.length = 0;
      record.final.tick = -1;
      return { ok: true, state: record.final };
    },
  });
  assert.equal(rewritesExpected.criteria[0].passed, false);
  assert.ok(rewritesExpected.criteria[0].error.expected.state.actors.length > 0);
  const crashed = await assess({ replayWindow() { throw new Error('broken policy'); } });
  assert.equal(crashed.passed, false);
  assert.deepEqual(crashed.criteria[0].error.actual, { threw: 'broken policy' });
});
