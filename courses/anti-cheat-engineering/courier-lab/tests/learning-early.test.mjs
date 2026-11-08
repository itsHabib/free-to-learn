import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFile } from 'node:fs/promises';
import * as spatial from '../learning/units/spatial.mjs';
import * as order from '../learning/units/order.mjs';
import * as testing from '../learning/units/testing.mjs';
import * as timing from '../learning/units/timing.mjs';
import { createWorld, join, admit, advance, snapshot } from '../engine.mjs';

const units = [spatial, order, testing, timing];
const seeds = [...Array.from({ length: 96 }, (_, seed) => seed), 65537, 2147483647, 4294967295];

function expectedSpatial(item) {
  const input = item.inputs;
  if (input.stepMm) {
    const x = input.actor.x + (input.move === 'E' ? input.stepMm : input.move === 'W' ? -input.stepMm : 0);
    const y = input.actor.y + (input.move === 'S' ? input.stepMm : input.move === 'N' ? -input.stepMm : 0);
    const distanceSquared = (x - input.target.x) ** 2 + (y - input.target.y) ** 2;
    return { x, y, distanceSquared, withinRange: Math.hypot(x - input.target.x, y - input.target.y) <= input.radiusMm };
  }
  if (Object.hasOwn(input, 'radiusMm') && input.actor) {
    const distanceSquared = ['x', 'y'].reduce((sum, axis) => sum + (input.actor[axis] - input.target[axis]) ** 2, 0);
    return { distanceSquared, withinRange: distanceSquared <= input.radiusMm ** 2 };
  }
  if (input.vehicle) {
    const distance = Math.hypot(input.vehicle.x - input.station.x, input.vehicle.y - input.station.y);
    const reason = input.currentTick < input.vehicle.readyAtTick ? 'cooldown' : distance > input.radiusMm ? 'range' : input.vehicle.energy < input.cost ? 'energy' : 'repair';
    return { accepted: reason === 'repair', reason, energy: input.vehicle.energy - (reason === 'repair' ? input.cost : 0) };
  }
  let x = input.actor.x;
  let y = input.actor.y;
  if (input.move === 'N') y -= 250;
  if (input.move === 'S') y += 250;
  if (input.move === 'E') x += 250;
  if (input.move === 'W') x -= 250;
  const inRange = Math.hypot(x - input.target.x, y - input.target.y) <= 250;
  const denied = input.tick < input.actor.nextInteractTick ? 'cooldown' : !inRange ? 'range' : null;
  return { x, y, reason: denied ?? (input.actor.cargo ? 'deposit' : 'pickup'), cargo: denied ? input.actor.cargo : !input.actor.cargo, score: input.actor.score + Number(!denied && input.actor.cargo), nextInteractTick: denied ? input.actor.nextInteractTick : input.tick + 4 };
}

function expectedOrder(item) {
  const input = item.inputs;
  if (input.input) {
    const next = { ...input.state };
    const newer = input.input.seq > next.lastSeq;
    if (newer) Object.assign(next, { lastSeq: input.input.seq, lastSeen: input.tick, expiresAt: input.tick + 4, move: input.input.move, pendingInteract: next.pendingInteract || input.input.interact });
    return { status: newer ? 'admitted' : 'stale', next };
  }
  if (input.arrivals) {
    let lastSeq = input.state.lastSeq;
    const admitted = [];
    for (const arrival of input.arrivals) {
      if (arrival.seq <= lastSeq) continue;
      lastSeq = arrival.seq;
      admitted.push(arrival);
    }
    const pending = input.state.pendingInteract || admitted.some((arrival) => arrival.interact);
    return { lastSeq, pendingBeforeTick: pending, attemptedInteractions: Number(pending), cargoAfterTick: Boolean(input.actorAtTarget.cargo) !== Boolean(pending), scoreAfterTick: input.actorAtTarget.score + Number(pending && input.actorAtTarget.cargo), pendingAfterTick: false };
  }
  if (Object.hasOwn(input, 'probeTick')) {
    const renews = input.arrivalBeforeProbe !== null && input.arrivalBeforeProbe.seq > input.lastSeq;
    const expiresAt = renews ? input.probeTick + 4 : input.initialExpiry;
    return { activeAtProbe: input.probeTick <= expiresAt, expiresAt, lastSeq: renews ? input.arrivalBeforeProbe.seq : input.lastSeq };
  }
  const state = { ...input.initial };
  const framesRead = [];
  for (const command of input.commands) {
    if (command.kind === 'read') framesRead.push(state.frame);
    if (command.kind === 'seek' && command.seq > state.lastSeq) Object.assign(state, { lastSeq: command.seq, frame: command.frame });
  }
  return { ...state, framesRead };
}

function combinations(values, count, start = 0, current = [], result = []) {
  if (current.length === count) { result.push([...current]); return result; }
  for (let index = start; index < values.length; index += 1) combinations(values, count, index + 1, [...current, values[index]], result);
  return result;
}

function expectedTesting(item) {
  const input = item.inputs;
  if (input.fixture && input.candidateRun) {
    const expectedChargeCount = input.fixture.initialChargeCount + new Set(input.fixture.requestIds).size;
    const control = input.correctRun;
    const candidate = input.candidateRun;
    const answer = (nextAction, reason) => ({ nextAction, reason, expectedChargeCount });
    if (control === null) return answer('run-correct-control', 'control-absent');
    if (control.ledger.chargeCount !== expectedChargeCount) return answer('repair-control', 'control-disagrees');
    if (!isDeepStrictEqual(control.requestIds, candidate.requestIds)) return answer('match-request-schedule', 'different-inputs');
    if (candidate.captureStatus !== 'complete' || candidate.ledger === null) return answer('finish-candidate-observation', 'no-completed-observation');
    if (candidate.processedRequestCount < candidate.requestIds.length) return answer('wait-for-worker', 'observation-too-early');
    if (candidate.ledger.source !== 'owner') return answer('read-owner-ledger', 'client-value-not-authoritative');
    assert.fail('transfer fixture must contain an evidence gap');
  }
  if (input.correct) {
    const path = input.allowedPaths.find((candidate) => !isDeepStrictEqual(input.correct[candidate], input.defect[candidate]));
    return { tick: input.correct.tick, path, expected: input.correct[path] };
  }
  if (input.assertions) {
    const ids = input.assertions.map((candidate) => candidate.id).sort();
    for (let size = 1; size <= ids.length; size += 1) {
      const candidates = combinations(ids, size);
      const result = candidates.find((chosen) => input.defects.every((defect) => chosen.some((id) => {
        const row = input.assertions.find((candidate) => candidate.id === id);
        return !isDeepStrictEqual(row.observed[defect], row.expected);
      })));
      if (result) return result;
    }
    assert.fail('generated matrix must be coverable');
  }
  const result = { detected: [], notDetected: [], inconclusive: [] };
  for (const run of input.runs) {
    const category = run.correct !== 'pass' ? 'inconclusive' : run.variant === 'pass' ? 'notDetected' : run.variant === 'assertion-fail' ? 'detected' : 'inconclusive';
    result[category].push(run.id);
  }
  Object.values(result).forEach((values) => values.sort());
  return result;
}

// Independent action-by-action oracle: it does not call the teaching generator's
// clock, investigation runtime, policy, expected result, or scoring function.
function simulate(record, defect = '') {
  let lastMs = record.startMs;
  let fraction = 0;
  let overruns = 0;
  let tick = 0;
  const actors = [];
  const checkpoints = [];
  for (const action of record.actions) {
    let receipt = null;
    let clock = null;
    const actor = actors.find((candidate) => candidate.connection === action.id);
    if (action.type === 'join') actors.push({ id: `actor-${actors.length + 1}`, connection: action.id, connected: true, lastSeq: 0, expiresAt: 0, x: 1000, direction: 0 });
    if (action.type === 'disconnect') {
      actor.connected = false;
      if (defect === 'clear-disconnected') actor.direction = 0;
    }
    if (action.type === 'resume') actor.connected = true;
    if (action.type === 'input') {
      const status = !actor.connected ? 'offline' : action.seq <= actor.lastSeq ? 'stale' : 'admitted';
      receipt = { status, tick, seq: action.seq };
      if (status === 'admitted') {
        actor.lastSeq = action.seq;
        actor.expiresAt = (defect === 'client-time' ? Math.floor((action.sentAtMs ?? lastMs) / 50) : tick) + 4;
        actor.direction = action.move === 'E' ? 1 : action.move === 'W' ? -1 : 0;
      }
    }
    if (action.type === 'sample') {
      const total = action.nowMs - lastMs + fraction;
      const whole = Math.floor(total / 50);
      const ticks = Math.min(5, whole);
      const dropped = whole - ticks;
      fraction = defect === 'discard-fraction' ? 0 : total % 50;
      lastMs = action.nowMs;
      overruns += Number(dropped > 0);
      for (let count = 0; count < ticks; count += 1) {
        tick += 1;
        actors.forEach((candidate) => {
          if (tick <= candidate.expiresAt + Number(defect === 'late-expiry')) candidate.x += 250 * candidate.direction;
        });
      }
      clock = { ticks, dropped, overruns, remainder: fraction };
    }
    checkpoints.push({ label: action.label, tick, actors: actors.map(({ direction, ...state }) => ({ ...state })), receipt, clock });
  }
  return checkpoints;
}

function expectedTiming(item, defect = '') {
  const input = item.inputs;
  if (input.readings) {
    const checkpoints = simulate({ startMs: input.startMs, actions: input.readings.map((nowMs, index) => ({ type: 'sample', label: String(index), nowMs })) }, defect);
    return checkpoints.map(({ tick, clock }) => ({ tick, ...clock }));
  }
  const checkpoints = simulate(input.record, defect);
  if (input.initialActor) {
    const atReceipt = checkpoints.find((checkpoint) => checkpoint.label === 'receipt');
    const final = checkpoints.at(-1);
    return { receiptTick: atReceipt.tick, expiresAt: atReceipt.actors[0].expiresAt, xAtReceipt: atReceipt.actors[0].x, processedTick: final.tick, xAfterSample: final.actors[0].x, clock: final.clock };
  }
  const final = checkpoints.at(-1);
  const result = { tick: final.tick, actors: final.actors, resumedReceipt: checkpoints.find((checkpoint) => checkpoint.label === 'resumed-receipt').receipt };
  if (input.reservation) result.reservationStatus = !input.reservation.sameClockOrigin ? 'unknown' : input.reservation.nowMs >= input.reservation.deadlineMs ? 'expired' : 'valid';
  return result;
}

const oracles = { spatial: expectedSpatial, order: expectedOrder, testing: expectedTesting, timing: expectedTiming };

for (const module of units) {
  test(`${module.unit.id}: complete teaching schema, deterministic generated answers and fresh substantive inputs`, async () => {
    const { unit, makeItem } = module;
    assert.ok(unit.intro.length > 60);
    assert.ok(unit.sections.length >= 2 && unit.sections.length <= 4);
    assert.equal(unit.masterySlots.length, 3);
    assert.equal(unit.support.hints.length, 3);
    const known = new Set(unit.objectives.map((objective) => objective.id));
    const covered = new Set();
    for (const section of unit.sections) {
      assert.ok(section.paragraphs.every((paragraph) => paragraph.length > 80));
      assert.ok(section.worked.steps.length >= 3);
      assert.ok(section.worked.answer && section.completion.missing && section.source.anchor);
      await readFile(new URL(`../${section.source.path}`, import.meta.url), 'utf8');
    }
    for (const mode of ['practice', 'completion', 'mastery']) {
      const keys = mode === 'mastery' ? unit.masterySlots : unit.sections.map((section) => section.id);
      for (const key of keys) {
        const distinct = new Set();
        for (const seed of seeds) {
          const item = makeItem({ mode, key, seed });
          assert.deepEqual(item, makeItem({ mode, key, seed }));
          assert.deepEqual(item.expected, oracles[unit.id](item), `${unit.id}/${mode}/${key}/${seed}`);
          assert.equal(item.hints.length, mode === 'mastery' ? 0 : 3);
          if (mode === 'completion') assert.ok(item.inputs.completedSteps[0].length > 40);
          assert.ok(item.explanation.length > 60 && item.prompt.length > 60);
          assert.ok(item.objectiveIds.every((id) => known.has(id)));
          if (mode === 'mastery') item.objectiveIds.forEach((id) => covered.add(id));
          distinct.add(JSON.stringify(item.inputs));
        }
        assert.ok(distinct.size >= 30, `${key} changes substantive inputs, not just ID`);
      }
    }
    assert.deepEqual([...covered].sort(), [...known].sort(), 'mastery set covers every unit objective');
    assert.throws(() => makeItem({ mode: 'other', key: unit.masterySlots[0], seed: 1 }), /mode/);
    assert.throws(() => makeItem({ mode: 'mastery', key: 'missing', seed: 1 }), /key/);
    assert.throws(() => makeItem({ mode: 'mastery', key: unit.masterySlots[0], seed: -1 }), /seed/);
  });
}

test('spatial boundaries and plausible wrong procedures are actually distinguishable', () => {
  const results = new Set();
  let axisOnlyWrong = 0;
  let exclusiveWrong = 0;
  for (const seed of seeds) {
    const range = spatial.makeItem({ mode: 'mastery', key: 'boundary', seed });
    const { actor, target } = range.inputs;
    axisOnlyWrong += Number(((actor.x - target.x) ** 2 <= 62500) !== range.expected.withinRange);
    exclusiveWrong += Number((range.expected.distanceSquared < 62500) !== range.expected.withinRange);
    const interaction = spatial.makeItem({ mode: 'mastery', key: 'refusal', seed });
    results.add(interaction.expected.reason);
  }
  assert.ok(axisOnlyWrong > 10 && exclusiveWrong > 10);
  assert.deepEqual([...results].sort(), ['cooldown', 'deposit', 'pickup', 'range']);
  const stationReasons = new Set(seeds.map((seed) => spatial.makeItem({ mode: 'mastery', key: 'transfer', seed }).expected.reason));
  assert.deepEqual([...stationReasons].sort(), ['cooldown', 'energy', 'range', 'repair']);
});

test('M1 tick-order tests only taught movement and range, with an explicit four-field answer', () => {
  const section = spatial.unit.sections.find((candidate) => candidate.id === 'tick-order');
  const teaching = JSON.stringify(section);
  assert.doesNotMatch(teaching, /cooldown|nextInteractTick|reason|deposit/);
  assert.match(teaching, /E adds 250 to x; W subtracts 250 from x; N subtracts 250 from y; S adds 250 to y/);
  assert.deepEqual(spatial.unit.objectives.find((objective) => objective.id === 'spatial.tick-order').prerequisites, ['spatial.range']);
  const outcomes = new Set();
  const directions = new Set();
  let oldPositionWrong = 0;
  for (const mode of ['practice', 'completion']) {
    for (const seed of seeds) {
      const item = spatial.makeItem({ mode, key: 'tick-order', seed });
      assert.deepEqual(Object.keys(item.expected).sort(), ['distanceSquared', 'withinRange', 'x', 'y']);
      assert.deepEqual(Object.keys(item.inputs.actor).sort(), ['x', 'y']);
      assert.doesNotMatch(JSON.stringify({ prompt: item.prompt, inputs: item.inputs, hints: item.hints }), /cooldown|nextInteractTick|reason|cargo|score/);
      assert.match(item.prompt, /\{x,y,distanceSquared,withinRange\}/);
      assert.match(item.prompt, /withinRange is true.*otherwise false/);
      assert.deepEqual(item.expected, expectedSpatial(item));
      const before = Math.hypot(item.inputs.actor.x - item.inputs.target.x, item.inputs.actor.y - item.inputs.target.y) <= 250;
      oldPositionWrong += Number(before !== item.expected.withinRange);
      outcomes.add(item.expected.withinRange);
      directions.add(item.inputs.move);
    }
  }
  assert.ok(oldPositionWrong > 20, 'cases must distinguish measuring before and after movement');
  assert.deepEqual([...outcomes].sort(), [false, true]);
  assert.deepEqual([...directions].sort(), ['E', 'N', 'S', 'W']);
});

test('early literal result fields and recovery state defaults are declared before scoring', () => {
  const cooldownTeaching = spatial.unit.sections.find((section) => section.id === 'cooldown').paragraphs.join(' ');
  for (const reason of ['cooldown', 'range', 'pickup', 'deposit']) assert.ok(cooldownTeaching.includes(`"${reason}"`));
  for (const seed of seeds) {
    const interaction = spatial.makeItem({ mode: 'practice', key: 'cooldown', seed });
    assert.ok(interaction.prompt.includes(`"${interaction.expected.reason}"`));
    const admission = order.makeItem({ mode: 'practice', key: 'admission', seed });
    assert.ok(admission.prompt.includes(`"${admission.expected.status}"`));
    const recovery = timing.makeItem({ mode: 'practice', key: 'recovery', seed });
    assert.ok(recovery.prompt.includes(`"${recovery.expected.resumedReceipt.status}"`));
    assert.match(recovery.prompt, /actor-1, actor-2.*x=1000, lastSeq=0, expiresAt=0 and idle/);
    assert.match(recovery.prompt, /processed tick, clock remainder and overruns are zero/);
  }
  assert.match(order.unit.sections[0].paragraphs.join(' '), /true if either.*false only when both are false/);
});

test('ordering cases expose stale interaction, false cancellation and exclusive expiry mistakes', () => {
  let staleTrue = 0;
  let falseWouldCancel = 0;
  let inclusiveBoundary = 0;
  const statuses = new Set();
  for (const seed of seeds) {
    const admission = order.makeItem({ mode: 'practice', key: 'admission', seed });
    statuses.add(admission.expected.status);
    if (admission.expected.status === 'stale' && admission.inputs.input.interact && !admission.inputs.state.pendingInteract) staleTrue += 1;
    const batch = order.makeItem({ mode: 'mastery', key: 'coalescing', seed });
    if (batch.expected.pendingBeforeTick && batch.inputs.arrivals.at(-1).interact === false) falseWouldCancel += 1;
    const expiry = order.makeItem({ mode: 'mastery', key: 'expiry', seed });
    if (expiry.inputs.probeTick === expiry.expected.expiresAt) {
      assert.equal(expiry.expected.activeAtProbe, true);
      inclusiveBoundary += 1;
    }
  }
  assert.deepEqual([...statuses].sort(), ['admitted', 'stale']);
  assert.ok(staleTrue > 5 && falseWouldCancel > 10 && inclusiveBoundary > 10);
});

test('testing matrix values are plausible owner-engine observations from the described fixtures', () => {
  for (const seed of seeds) {
    const item = testing.makeItem({ mode: 'mastery', key: 'minimal-plan', seed });
    for (const fixture of item.inputs.fixtures) {
      const world = createWorld(17);
      const actor = join(world);
      const atTick = fixture.fixture === 'fourth-step' ? fixture.atTick - 4 : fixture.fixture === 'duplicate' ? fixture.atTick - 2 : fixture.atTick - 1;
      advance(world, atTick);
      if (fixture.fixture === 'duplicate') {
        admit(world, actor.id, { v: 1, seq: 10, move: 'E', interact: false });
        advance(world, 2);
        admit(world, actor.id, { v: 1, seq: 10, move: 'E', interact: false });
      }
      if (fixture.fixture === 'fourth-step') {
        actor.x = fixture.expected - 1000;
        admit(world, actor.id, { v: 1, seq: 10, move: 'E', interact: false });
        advance(world, 4);
      }
      if (fixture.fixture === 'stale-bit') {
        actor.x = world.core.x;
        admit(world, actor.id, { v: 1, seq: 10, move: 'idle', interact: false });
        admit(world, actor.id, { v: 1, seq: 9, move: 'idle', interact: true });
        advance(world, 1);
      }
      const field = fixture.path.slice('actor.'.length);
      assert.equal(snapshot(world, actor.id).actor[field], fixture.expected);
    }
  }
});

test('test planning rejects status-only, redundant plans and crash-as-detection reasoning', () => {
  let redundantPlans = 0;
  let inconclusive = 0;
  for (const seed of seeds) {
    const observation = testing.makeItem({ mode: 'mastery', key: 'observation', seed });
    assert.notEqual(observation.expected.path, 'http.status');
    const matrix = testing.makeItem({ mode: 'mastery', key: 'minimal-plan', seed });
    assert.notDeepEqual(matrix.expected, matrix.inputs.assertions.map((row) => row.id));
    redundantPlans += Number(matrix.expected.length < matrix.inputs.assertions.length);
    const result = testing.makeItem({ mode: 'practice', key: 'controls', seed });
    inconclusive += result.expected.inconclusive.length;
    assert.ok(result.inputs.runs.filter((run) => run.variant === 'timeout' || run.variant === 'import-error').every((run) => result.expected.inconclusive.includes(run.id)));
  }
  assert.ok(redundantPlans > 50 && inconclusive > 50);
});

test('M3 transfer requires repairing experiment evidence, not relabeling a classification table', () => {
  const actions = new Set();
  const chargeCounts = new Set();
  for (const seed of seeds) {
    const item = testing.makeItem({ mode: 'mastery', key: 'transfer', seed });
    assert.equal(item.inputs.runs, undefined, 'the new task is not the practice status-row table');
    assert.deepEqual(Object.keys(item.expected).sort(), ['expectedChargeCount', 'nextAction', 'reason']);
    assert.deepEqual(item.expected, expectedTesting(item));
    assert.ok(item.inputs.actions.some((option) => option.value === item.expected.nextAction));
    assert.ok(item.inputs.reasons.some((option) => option.value === item.expected.reason));
    assert.notEqual(item.expected.nextAction, 'increase-retries', 'more retries cannot supply missing evidence');
    assert.match(item.prompt, /\{nextAction,reason,expectedChargeCount\}/);
    assert.ok(!Object.hasOwn(item.expected, 'detected'));
    actions.add(item.expected.nextAction);
    chargeCounts.add(item.expected.expectedChargeCount);
  }
  assert.equal(actions.size, 6, 'all six distinct experimental follow-ups must occur');
  assert.ok(chargeCounts.size >= 5, 'the required state value must vary with the fixture, not just the action label');
});

test('timing cases distinguish client clocks, lost fractions, late expiry and disconnect resets', () => {
  const differences = { 'client-time': 0, 'discard-fraction': 0, 'late-expiry': 0, 'clear-disconnected': 0 };
  const reservationStates = new Set();
  const receiptStates = new Set();
  for (const seed of seeds) {
    const clock = timing.makeItem({ mode: 'mastery', key: 'clock', seed });
    differences['discard-fraction'] += Number(!isDeepStrictEqual(clock.expected, expectedTiming(clock, 'discard-fraction')));
    const receipt = timing.makeItem({ mode: 'mastery', key: 'receipt', seed });
    for (const defect of ['client-time', 'late-expiry']) differences[defect] += Number(!isDeepStrictEqual(receipt.expected, expectedTiming(receipt, defect)));
    const recovery = timing.makeItem({ mode: 'mastery', key: 'transfer', seed });
    differences['clear-disconnected'] += Number(!isDeepStrictEqual(recovery.expected, expectedTiming(recovery, 'clear-disconnected')));
    reservationStates.add(recovery.expected.reservationStatus);
    receiptStates.add(recovery.expected.resumedReceipt.status);
    assert.equal(recovery.expected.actors[1].x, 1000);
    assert.equal(recovery.expected.actors[1].lastSeq, 0);
  }
  assert.ok(Object.values(differences).every((count) => count > 10), JSON.stringify(differences));
  assert.deepEqual([...reservationStates].sort(), ['expired', 'unknown', 'valid']);
  assert.deepEqual([...receiptStates].sort(), ['admitted', 'stale']);
});

// The runtime is owned by a parallel writer. This check activates when its file
// is present on the integrated candidate; standalone unit authoring remains testable.
let grade;
try { ({ grade } = await import('../learning/grade.mjs')); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== new URL('../learning/grade.mjs', import.meta.url).href) throw error;
}

function plausibleWrong(item, right) {
  const wrong = structuredClone(right);
  if (item.inputs.assertions) return item.inputs.assertions.map((row) => row.id);
  if (item.inputs.readings) { wrong[0].remainder = 0; return wrong; }
  if (item.inputs.correct) return { tick: right.tick, path: 'http.status', expected: 200 };
  if (item.inputs.fixture && item.inputs.candidateRun) return { ...right, nextAction: 'increase-retries', reason: 'insufficient-load' };
  if (item.inputs.runs) return { detected: item.inputs.runs.map((run) => run.id).sort(), notDetected: [], inconclusive: [] };
  if (Object.hasOwn(right, 'withinRange')) { wrong.withinRange = !right.withinRange; return wrong; }
  if (Object.hasOwn(right, 'pendingBeforeTick')) { wrong.pendingBeforeTick = !right.pendingBeforeTick; return wrong; }
  if (Object.hasOwn(right, 'activeAtProbe')) { wrong.activeAtProbe = !right.activeAtProbe; return wrong; }
  if (Object.hasOwn(right, 'framesRead')) { wrong.lastSeq -= 1; return wrong; }
  if (Object.hasOwn(right, 'resumedReceipt')) { wrong.actors[0].lastSeq = 0; return wrong; }
  if (Object.hasOwn(right, 'receiptTick')) { wrong.expiresAt -= 1; return wrong; }
  if (Object.hasOwn(right, 'accepted')) { wrong.accepted = !right.accepted; return wrong; }
  wrong.cargo = !right.cargo;
  return wrong;
}
test('integrated grader accepts independent answers and rejects plausible wrong responses', { skip: !grade && 'shared grader not yet integrated in this isolated unit branch' }, () => {
  for (const module of units) {
    for (const key of module.unit.masterySlots) {
      for (const seed of seeds.slice(0, 24)) {
        const item = module.makeItem({ mode: 'mastery', key, seed });
        const right = oracles[module.unit.id](item);
        assert.deepEqual(grade(item, JSON.stringify(right)).correct, true);
        const wrong = plausibleWrong(item, right);
        assert.notDeepEqual(wrong, right, 'the wrong model must actually disagree on this case');
        assert.equal(grade(item, JSON.stringify(wrong)).correct, false);
        assert.equal(grade(item, JSON.stringify({ ...right, extraUnrequiredField: true })).correct, false);
        assert.equal(grade(item, '{unfinished').status, 'format-error');
      }
    }
  }
});
