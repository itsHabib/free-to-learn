import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm, lstat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retain } from '../retention/policy.mjs';
import { assess, cases } from '../retention/fixtures.mjs';
import { correctPolicies, wrongPolicies } from '../retention/controls.mjs';
import { buildExport, writeExport, deleteExport, validateEvents, validateSettings, MAX_SOURCE_EVENTS } from '../retention/store.mjs';
import { createSyntheticWorkload, measureRetention, summarizeTimings, WORKLOAD_NAME } from '../retention/measure.mjs';
import { postCheckFeedback, reviewerFeedback } from '../retention/feedback.mjs';
import * as template from '../retention/template.mjs';

const settings = { nowTick: 12, maxAgeTicks: 5, maxEvents: 3 };
const events = () => [7, 8, 10, 12, 13].map((tick) => ({
  tick, actorId: `synthetic-actor-${tick}`, reason: 'range', distanceSquared: tick * 100_000,
  capability: 'synthetic-capability', address: 'synthetic-address', device: 'synthetic-device',
}));

async function scratch(t) {
  const directory = await mkdtemp(join(tmpdir(), 'ivy-retention-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('reference policy meets all valid-input cases without source mutation', async () => {
  for (const item of cases()) {
    const input = structuredClone(item.events);
    const configuration = { ...item.settings };
    assert.deepEqual(retain(input, configuration), item.expected, item.name);
    assert.deepEqual(input, item.events, item.name);
    assert.deepEqual(configuration, item.settings, item.name);
  }
  assert.equal((await assess({ retain })).passed, true);
  const source = events();
  const result = retain(source, settings);
  result[0].actorId = 'changed-export';
  assert.equal(source[1].actorId, 'synthetic-actor-8');
});

test('two independent correct policies pass and eight wrong controls fail with the intended feedback', async () => {
  assert.equal(correctPolicies.length, 2);
  for (const policy of correctPolicies) assert.equal((await assess(policy)).passed, true, policy.name);
  assert.ok(wrongPolicies.length >= 6);
  for (const policy of wrongPolicies) {
    const result = await assess(policy);
    assert.equal(result.passed, false, policy.name);
    const failure = result.criteria.find((criterion) => !criterion.passed && criterion.name.includes(policy.intended));
    assert.ok(failure, `${policy.name}: expected a failure containing ${policy.intended}`);
    assert.ok(Object.hasOwn(failure.error, 'expected'));
    assert.ok(Object.hasOwn(failure.error, 'actual'));
    assert.match(failure.error.source, /^LEARNER\.md#/);
  }
  assert.equal((await assess(template)).passed, false);
});

test('missing, throwing, async and non-JSON candidate results yield structured feedback', async () => {
  const absent = await assess({});
  assert.equal(absent.passed, false);
  assert.equal(absent.criteria[0].error.actual, 'undefined');
  const thrown = await assess({ retain() { throw new Error('synthetic failure'); } });
  assert.equal(thrown.passed, false);
  assert.deepEqual(thrown.criteria[0].error.actual, { threw: 'synthetic failure' });
  assert.equal((await assess({ retain: async (...args) => retain(...args) })).passed, true);
  const cyclic = {};
  cyclic.self = cyclic;
  const strange = await assess({ retain: () => cyclic });
  assert.equal(strange.passed, false);
  assert.deepEqual(strange.criteria[0].error.actual.self, { type: 'repeated or circular reference' });
  const leaked = await assess(wrongPolicies.find(({ name }) => name === 'copy excluded fields'));
  assert.doesNotMatch(JSON.stringify(leaked), /synthetic-capability-example|synthetic-address-example|synthetic-device-example/);
});

test('in-memory export has only allowed fields, a declared byte limit and detached source data', () => {
  const source = events();
  const before = structuredClone(source);
  const result = buildExport(source, settings);
  assert.equal(Object.hasOwn(result, 'timings'), false);
  assert.equal(result.payload.kind, 'minimized-denial-events');
  assert.deepEqual(result.payload.events, retain(source, settings));
  assert.deepEqual(Object.keys(result.payload).sort(), ['events', 'kind', 'schema', 'settings']);
  assert.equal(result.summary.inputCount, 5);
  assert.equal(result.summary.retainedCount, 3);
  assert.equal(result.summary.removedCount, 2);
  assert.equal(result.summary.jsonBytes, Buffer.byteLength(result.json));
  assert.deepEqual(JSON.parse(result.json), result.payload);
  assert.deepEqual(source, before);
  for (const event of result.payload.events) assert.deepEqual(Object.keys(event), ['tick', 'actorId', 'reason', 'distanceSquared']);
  assert.doesNotMatch(result.json, /capability|address|device|synthetic-actor-7|synthetic-actor-13/);
  assert.doesNotMatch(JSON.stringify(result.summary), /synthetic-/);
  result.payload.events[0].actorId = 'changed-output';
  assert.deepEqual(source, before);
  const inheritedSerializer = (input, configuration) => retain(input, configuration).map((event) => Object.assign(
    Object.create({ toJSON() { return { capability: 'synthetic-leak' }; } }), event,
  ));
  const plain = buildExport(source, settings, { policy: inheritedSerializer });
  assert.deepEqual(JSON.parse(plain.json).events, retain(source, settings));
  assert.doesNotMatch(plain.json, /synthetic-leak/);
  assert.throws(() => buildExport(source, settings, { maxBytes: 1 }), /exceeds maxBytes/);
});

test('store boundary refuses malformed input and unsafe policy output before writing', async (t) => {
  const directory = await scratch(t);
  for (const value of [null, {}, { ...settings, nowTick: -1 }, { ...settings, maxAgeTicks: 0 }, { ...settings, maxEvents: Infinity }]) {
    assert.throws(() => validateSettings(value), /must be/);
  }
  for (const source of [null, [events()[0], { ...events()[1], tick: 6 }], [{ ...events()[0], actorId: '' }], [{ ...events()[0], distanceSquared: NaN }], new Array(MAX_SOURCE_EVENTS + 1)]) {
    assert.throws(() => validateEvents(source));
  }
  for (const name of ['copy excluded fields', 'delete source fields in place', 'retain future events', 'ignore count limit', 'reverse equal-tick order', 'round measured distance']) {
    const policy = wrongPolicies.find((item) => item.name === name).retain;
    const source = events().map((event) => event.tick === 12 ? { ...event, distanceSquared: 1.25 } : event);
    const configuration = { nowTick: 12, maxAgeTicks: 10, maxEvents: 2 };
    await assert.rejects(writeExport(join(directory, `${name}.json`), source, configuration, { policy }));
  }
  await assert.rejects(writeExport(join(directory, 'small.json'), events(), settings, { maxBytes: 1 }), /exceeds maxBytes/);
  assert.deepEqual(await readdir(directory), []);
});

test('actual export bytes are bounded and deleting its receipt leaves a separate export intact', async (t) => {
  const directory = await scratch(t);
  const source = events();
  const original = structuredClone(source);
  const path = join(directory, 'selected.json');
  const separatePath = join(directory, 'separate.json');
  const receipt = await writeExport(path, source, settings);
  const separate = await writeExport(separatePath, source, { ...settings, maxEvents: 1 });
  const bytes = await readFile(path);
  assert.equal(bytes.length, receipt.jsonBytes);
  assert.equal((await lstat(path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(bytes).events, retain(source, settings));
  assert.deepEqual((await readdir(directory)).sort(), ['selected.json', 'separate.json']);
  await assert.rejects(writeExport(path, source, settings), { code: 'EEXIST' });
  assert.deepEqual(await readFile(path), bytes);
  const deletion = await deleteExport(receipt);
  assert.equal(deletion.deleted, true);
  assert.equal(deletion.jsonBytes, bytes.length);
  assert.match(deletion.scope, /This export only/);
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  assert.deepEqual(JSON.parse(await readFile(separatePath)).events, retain(source, { ...settings, maxEvents: 1 }));
  assert.deepEqual(source, original);
  assert.deepEqual(await readdir(directory), ['separate.json']);
  await assert.rejects(deleteExport(receipt), { code: 'ENOENT' });
  await deleteExport(separate);
  assert.deepEqual(await readdir(directory), []);
});

test('deletion refuses changed bytes and a symlink instead of removing a different artifact', async (t) => {
  const directory = await scratch(t);
  const path = join(directory, 'selected.json');
  const receipt = await writeExport(path, events(), settings);
  await writeFile(path, 'changed');
  await assert.rejects(deleteExport(receipt), /bytes changed/);
  assert.equal(await readFile(path, 'utf8'), 'changed');
  await rm(path);
  const target = join(directory, 'other.json');
  await writeFile(target, 'other');
  await symlink(target, path);
  await assert.rejects(deleteExport(receipt), /regular file/);
  assert.equal(await readFile(target, 'utf8'), 'other');
  await assert.rejects(deleteExport({ path }), /receipt/);
});

test('named workload report measures two settings and emits actual elapsed samples and JSON bytes', () => {
  const workload = createSyntheticWorkload(512);
  const before = structuredClone(workload);
  const configurations = [
    { nowTick: 511, maxAgeTicks: 400, maxEvents: 300 },
    { nowTick: 511, maxAgeTicks: 40, maxEvents: 20 },
  ];
  const report = measureRetention({ workload, settings: configurations, warmup: 1, samples: 3 });
  assert.equal(report.schema, 2);
  assert.deepEqual(report.settings, configurations);
  assert.equal(report.workload.name, WORKLOAD_NAME);
  assert.equal(report.workload.eventCount, 512);
  assert.equal(report.workload.inputJsonBytes, Buffer.byteLength(JSON.stringify(workload.events)));
  assert.match(report.workload.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.environment, { node: process.version, platform: process.platform, arch: process.arch });
  assert.equal(report.warmup, 1);
  assert.equal(report.samples, 3);
  assert.equal(report.runs.length, 2);
  for (let index = 0; index < report.runs.length; index += 1) {
    const run = report.runs[index];
    assert.deepEqual(run.settings, configurations[index]);
    assert.equal(run.elapsedMs.length, 3);
    assert.ok(run.elapsedMs.every((value) => Number.isFinite(value) && value >= 0));
    for (const name of ['policyMs', 'encodeMs', 'policyAndEncodeMs']) {
      assert.equal(run[name].length, 3);
      assert.ok(run[name].every((value) => Number.isFinite(value) && value >= 0));
    }
    assert.deepEqual(run.policyAndEncodeMs, run.policyMs.map((value, index) => value + run.encodeMs[index]));
    for (const [name, samples] of [['wholeOperation', run.elapsedMs], ['policyAndEncode', run.policyAndEncodeMs]]) {
      assert.deepEqual(run.timingSummary[name], summarizeTimings(samples));
      assert.equal(run.timingSummary[name].tailStatistic, 'max');
      assert.equal(run.timingSummary[name].p95Ms, null);
    }
    assert.deepEqual(run.jsonByteSamples, Array(3).fill(buildExport(workload.events, configurations[index]).summary.jsonBytes));
    assert.equal(run.retainedCount, configurations[index].maxEvents);
  }
  assert.ok(report.runs[0].jsonBytes > report.runs[1].jsonBytes);
  assert.match(report.operation, /no disk I\/O/);
  assert.match(report.policyAndEncodeOperation, /excludes source validation, cloning/);
  assert.match(report.limits, /No production capacity/);
  assert.match(report.limits, /direct cost changed by the limits/);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-actor|synthetic-example|synthetic-address|synthetic-device/);
  assert.deepEqual(workload, before);
  assert.throws(() => measureRetention({ workload, samples: 0 }), /samples/);
  assert.throws(() => measureRetention({ workload, settings: [settings] }), /Compare/);
});

test('timing summaries name a small-sample maximum and use nearest rank p95 only from 20 samples', () => {
  const five = [8, 1, 2, 4, 3];
  assert.deepEqual(summarizeTimings(five), { sampleCount: 5, medianMs: 3, maxMs: 8, p95Ms: null, tailStatistic: 'max', tailMs: 8 });
  assert.deepEqual(five, [8, 1, 2, 4, 3]);
  assert.equal(summarizeTimings([3, 1]).medianMs, 2);
  const twenty = Array.from({ length: 20 }, (_, index) => 20 - index);
  assert.deepEqual(summarizeTimings(twenty), { sampleCount: 20, medianMs: 10.5, maxMs: 20, p95Ms: 19, tailStatistic: 'p95', tailMs: 19 });
  for (const values of [[], null, [-1], [Infinity], [NaN]]) assert.throws(() => summarizeTimings(values), /finite nonnegative/);
});

test('measurement passes every declared setting and count to the policy and keeps them detached', () => {
  const workload = createSyntheticWorkload(32);
  const configurations = [{ nowTick: 31, maxAgeTicks: 16, maxEvents: 8 }, { nowTick: 30, maxAgeTicks: 5, maxEvents: 2 }];
  const seen = [];
  const policy = (input, setting) => {
    seen.push({ ...setting });
    return retain(input, setting);
  };
  const report = measureRetention({ workload, settings: configurations, warmup: 2, samples: 20, policy });
  assert.deepEqual(seen, configurations.flatMap((setting) => Array.from({ length: 22 }, () => setting)));
  assert.equal(report.samples, 20);
  assert.equal(report.warmup, 2);
  for (const run of report.runs) {
    assert.equal(run.elapsedMs.length, 20);
    assert.equal(run.timingSummary.wholeOperation.tailStatistic, 'p95');
    assert.equal(run.timingSummary.policyAndEncode.tailStatistic, 'p95');
  }
  configurations[0].maxEvents = 1;
  assert.equal(report.settings[0].maxEvents, 8);
});

test('prediction feedback gives correct boundary and stable-order answers with fresh questions, while reviewer keys stay separate', () => {
  const learner = postCheckFeedback();
  const reviewer = reviewerFeedback();
  assert.equal(learner.predictions.length, 4);
  assert.equal(Object.hasOwn(learner, 'transfer'), false);
  for (const prediction of learner.predictions) {
    assert.ok(prediction.answer && prediction.reason);
    assert.match(prediction.source, /^LEARNER\.md#/);
    assert.deepEqual(Object.keys(prediction.freshVariant), ['question']);
    assert.notEqual(prediction.question, prediction.freshVariant.question);
    const key = reviewer.freshVariants.find(({ id }) => id === prediction.id);
    assert.equal(key.question, prediction.freshVariant.question);
    assert.ok(key.answer);
  }
  const event = (tick, actorId = String(tick)) => ({ tick, actorId, reason: 'range', distanceSquared: 1 });
  assert.deepEqual(retain([7, 8, 9, 14, 15].map((tick) => event(tick)), { nowTick: 14, maxAgeTicks: 6, maxEvents: 10 }).map(({ tick }) => tick), [9, 14]);
  assert.deepEqual(retain([[11, 'A'], [12, 'B'], [12, 'C'], [12, 'D'], [14, 'E']].map(([tick, id]) => event(tick, id)), { nowTick: 14, maxAgeTicks: 10, maxEvents: 3 }).map(({ actorId }) => actorId), ['C', 'D', 'E']);
  assert.deepEqual(retain([18, 19, 20, 23, 24].map((tick) => event(tick)), { nowTick: 23, maxAgeTicks: 4, maxEvents: 10 }).map(({ tick }) => tick), [20, 23]);
  assert.deepEqual(retain([[30, 'P'], [30, 'Q'], [30, 'R'], [31, 'S'], [31, 'T']].map(([tick, id]) => event(tick, id)), { nowTick: 31, maxAgeTicks: 10, maxEvents: 4 }).map(({ actorId }) => actorId), ['Q', 'R', 'S', 'T']);
  assert.equal(reviewer.transfer.rubric.length, 5);
  assert.match(reviewer.transfer.referenceAnswer, /count cap.*reconstruction impossible/);
  assert.match(reviewer.transfer.reviewStatus, /Advisory only/);
});

test('a short export cannot reconstruct a longer detector window', () => {
  const source = [23, 29, 37].map((tick) => ({ tick, actorId: 'synthetic-actor', reason: 'range', distanceSquared: 1_000_000 }));
  const short = retain(source, { nowTick: 40, maxAgeTicks: 8, maxEvents: 10 });
  const long = retain(source, { nowTick: 40, maxAgeTicks: 20, maxEvents: 10 });
  assert.deepEqual(short.map(({ tick }) => tick), [37]);
  assert.deepEqual(long.map(({ tick }) => tick), [23, 29, 37]);
  assert.deepEqual(retain(source, { nowTick: 40, maxAgeTicks: 20, maxEvents: 1 }), short);
});
