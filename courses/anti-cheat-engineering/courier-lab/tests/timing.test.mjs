import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assess } from '../timing/fixtures.mjs';
import { correctPolicies, wrongPolicies } from '../timing/controls.mjs';
import { investigations, runInvestigation, validateInvestigation } from '../timing/runtime.mjs';
import { predictTiming } from '../timing/template.mjs';

const run = (name) => runInvestigation(investigations().find((item) => item.name === name).record);
const checkpoint = (result, label) => result.observed.checkpoints.find((item) => item.label === label);

test('timing fixtures accept two independent policies and reject every distinct wrong control', async () => {
  assert.equal(Object.keys(correctPolicies).length, 2);
  assert.ok(Object.keys(wrongPolicies).length >= 6);
  for (const [name, candidate] of Object.entries(correctPolicies)) {
    const result = await assess(candidate);
    assert.equal(result.passed, true, `${name}: ${JSON.stringify(result.criteria.filter((item) => !item.passed))}`);
  }
  for (const [name, candidate] of Object.entries(wrongPolicies)) {
    const result = await assess(candidate);
    assert.equal(result.passed, false, name);
    const failures = result.criteria.filter((item) => !item.passed);
    assert.ok(failures.length, name);
    assert.ok(failures.every((item) => item.error.expected && item.error.actual && item.error.source.startsWith('LEARNER.md#')), name);
  }
});

test('receipt changes intent before movement; expiry includes the fourth step and excludes the fifth', () => {
  const result = run('inclusive-expiry');
  assert.equal(checkpoint(result, 'start').actors[0].x, 1000);
  assert.equal(checkpoint(result, 'start').actors[0].expiresAt, 4);
  assert.equal(checkpoint(result, 'fourth-tick').actors[0].x, 2000);
  assert.equal(checkpoint(result, 'fifth-tick-stopped').actors[0].x, 2000);
  assert.equal(checkpoint(result, 'fifth-tick-stopped').tick, 5);
});

test('delayed client time does not control expiry and stale receipts do not renew it', () => {
  const delayed = run('delayed-client-time');
  assert.deepEqual(checkpoint(delayed, 'delayed-receipt').receipt, { status: 'admitted', tick: 3, seq: 1 });
  assert.equal(checkpoint(delayed, 'delayed-receipt').actors[0].expiresAt, 7);
  assert.equal(checkpoint(delayed, 'four-after-receipt').actors[0].x, 2000);
  const retry = run('duplicate-retry');
  assert.equal(checkpoint(retry, 'duplicate-opposite').receipt.status, 'stale');
  assert.equal(checkpoint(retry, 'no-renewal').actors[0].x, 2000);
  assert.equal(checkpoint(retry, 'no-renewal').actors[0].expiresAt, 4);
});

test('owner callbacks preserve fraction and cap processed ticks while dropping excess whole ticks', () => {
  const fractional = run('fractional-callbacks');
  assert.deepEqual(checkpoint(fractional, 'fraction-49').clock, { ticks: 0, dropped: 0, overruns: 0, remainder: 49 });
  assert.equal(checkpoint(fractional, 'next-tick').tick, 2);
  const paused = run('bounded-pause');
  assert.deepEqual(checkpoint(paused, 'long-pause').clock, { ticks: 5, dropped: 11, overruns: 1, remainder: 26.5 });
  assert.equal(checkpoint(paused, 'long-pause').actors[0].x, 2000);
  assert.deepEqual(checkpoint(paused, 'remainder-carries').clock, { ticks: 1, dropped: 0, overruns: 1, remainder: 0 });
  assert.equal(checkpoint(paused, 'remainder-carries').actors[0].x, 1750);
});

test('outage preserves owner state, resume keeps sequence and fresh join receives a distinct actor', () => {
  const resumed = run('outage-and-resume');
  assert.equal(checkpoint(resumed, 'still-active-server-intent').actors[0].x, 1500);
  assert.equal(checkpoint(resumed, 'undelivered-input').receipt.status, 'offline');
  assert.equal(checkpoint(resumed, 'intent-expired').actors[0].x, 2000);
  assert.equal(checkpoint(resumed, 'retry-original').receipt.status, 'stale');
  assert.equal(checkpoint(resumed, 'recovered-one-step').actors[0].x, 1750);
  const fresh = checkpoint(run('fresh-rejoin'), 'independent-actors');
  assert.deepEqual(fresh.actors.map(({ id, lastSeq, x }) => ({ id, lastSeq, x })), [
    { id: 'actor-1', lastSeq: 10, x: 1500 }, { id: 'actor-2', lastSeq: 1, x: 750 },
  ]);
  assert.equal(fresh.actors[0].connected, false);
});

test('records and predictions preserve inputs and expose no bearer tokens', () => {
  for (const item of investigations()) {
    const before = structuredClone(item.record);
    const observed = runInvestigation(item.record);
    for (const candidate of Object.values(correctPolicies)) candidate.predictTiming(item.record);
    assert.deepEqual(item.record, before);
    assert.doesNotMatch(JSON.stringify(observed), /bearer|authorization|token/i);
  }
});

test('mechanism refuses invalid and unbounded scripts; incomplete learner template fails meaningfully', async () => {
  const valid = investigations()[0].record;
  for (const bad of [null, { ...valid, schema: 2 }, { ...valid, actions: Array(81).fill(valid.actions[0]) }, { ...valid, actions: [{ type: 'sample', label: 'backwards', nowMs: -1 }] }, { ...valid, actions: [{ type: 'sample', label: 'huge', nowMs: Infinity }] }]) assert.throws(() => validateInvestigation(bad));
  assert.throws(() => runInvestigation({ schema: 1, startMs: 0, actions: [
    { type: 'join', label: 'join', id: 'a' },
    { type: 'input', label: 'west', id: 'a', seq: 1, move: 'W' },
    { type: 'sample', label: 'first-four', nowMs: 200 },
    { type: 'input', label: 'renew-west', id: 'a', seq: 2, move: 'W' },
    { type: 'sample', label: 'blocked-at-edge', nowMs: 250 },
  ] }), /unobstructed floor/);
  const result = await assess({ predictTiming });
  assert.equal(result.passed, false);
  assert.ok(result.criteria.every((item) => item.error.source));
  assert.equal((await assess({})).criteria[0].name, 'export predictTiming(record)');
  const mutating = await assess({ predictTiming(record) {
    const output = correctPolicies['tick-by-tick'].predictTiming(record);
    record.schema = 99;
    return output;
  } });
  assert.equal(mutating.passed, false);
  assert.equal(mutating.criteria[0].error.actual.schema, 99);
  assert.equal(mutating.criteria[0].error.source, 'LEARNER.md#the-contract');
});

test('prompt and learner response retain separate prediction, repair and transfer tasks', async () => {
  const prompt = JSON.parse(await readFile(new URL('../timing/prompt.json', import.meta.url)));
  assert.equal(prompt.id, 'courier-timing-01');
  assert.equal(prompt.version, 1);
  const response = await readFile(new URL('../timing/response-template.md', import.meta.url), 'utf8');
  assert.match(response, /Predictions before/);
  assert.match(response, /Repair after feedback/);
  assert.match(response, /reservation deadline/);
});
