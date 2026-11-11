import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClock } from '../clock.mjs';
import { runInvestigation } from '../timing/runtime.mjs';
import { checkPackage } from '../integrity/policy.mjs';
import { replayWindow } from '../telemetry/policy.mjs';
import { selectRecovery } from '../recovery/policy.mjs';
import { repair } from '../capstone/policy.mjs';
import { initialState, addActor } from '../capstone/state.mjs';
import { interactionDenial } from '../defense.mjs';
import { admitInput, movementActive } from '../admission.mjs';

const modules = [
  ['lab', 'proximity', 4], ['lab/order', 'order', 4], ['timing', 'timing', 4], ['integrity', 'integrity', 6],
  ['telemetry', 'telemetry', 4], ['recovery', 'recovery', 6], ['capstone', 'capstone', 6],
];

const feedback = async (path) => import(new URL(`../${path}/feedback.mjs`, import.meta.url));
const byId = (result, id) => result.predictions.find((item) => item.id === id);

for (const [path, module, count] of modules) {
  test(`${module}: exact original questions, source links and reviewer-only fresh answers`, async () => {
    const { postCheckFeedback, reviewerFeedback } = await feedback(path);
    const learner = postCheckFeedback();
    const reviewer = reviewerFeedback();
    assert.deepEqual(Object.keys(learner).sort(), ['module', 'predictions', 'schema']);
    assert.equal(learner.schema, 1);
    assert.equal(learner.module, module);
    assert.equal(learner.predictions.length, count);
    const response = await readFile(new URL(`../${path}/response-template.md`, import.meta.url), 'utf8');
    const predictionSection = response.split(/^## /m)[1];
    const questions = [...predictionSection.matchAll(/^(?:\d+\.|-) (.+)$/gm)].map((match) => match[1]);
    assert.deepEqual(learner.predictions.map((item) => item.question), questions);
    const guide = await readFile(new URL(`../${path}/LEARNER.md`, import.meta.url), 'utf8');
    const anchors = new Set([...guide.matchAll(/^## (.+)$/gm)].map((match) => `LEARNER.md#${match[1].toLowerCase().replaceAll(' ', '-')}`));
    assert.equal(new Set(learner.predictions.map((item) => item.id)).size, count);
    for (const item of learner.predictions) {
      assert.deepEqual(Object.keys(item).sort(), ['answer', 'freshVariant', 'id', 'question', 'reason', 'source']);
      assert.ok(item.answer && item.reason && item.freshVariant.question);
      assert.ok(anchors.has(item.source), item.source);
      assert.deepEqual(Object.keys(item.freshVariant), ['question']);
      assert.notEqual(item.question, item.freshVariant.question);
    }
    assert.equal(reviewer.schema, 1);
    assert.equal(reviewer.module, module);
    assert.deepEqual(reviewer.freshVariantAnswers.map((item) => item.id), learner.predictions.map((item) => item.id));
    assert.ok(reviewer.freshVariantAnswers.every((item) => item.answer));
    assert.ok(reviewer.transfer.question && reviewer.transfer.referenceAnswer && reviewer.transfer.rubric.length >= 3);
    for (const item of reviewer.freshVariantAnswers) assert.ok(!JSON.stringify(learner).includes(item.answer));
    assert.ok(!JSON.stringify(learner).includes(reviewer.transfer.referenceAnswer));
    learner.predictions[0].answer = 'mutated copy';
    learner.predictions[0].freshVariant.question = 'mutated question';
    reviewer.transfer.rubric[0].evidence = 'mutated rubric';
    assert.notEqual(postCheckFeedback().predictions[0].answer, 'mutated copy');
    assert.notEqual(postCheckFeedback().predictions[0].freshVariant.question, 'mutated question');
    assert.notEqual(reviewerFeedback().transfer.rubric[0].evidence, 'mutated rubric');
  });
}

test('timing keys agree with real receipt, stale retry and clock calculations', async () => {
  const { postCheckFeedback } = await feedback('timing');
  const result = runInvestigation({ schema: 1, startMs: 0, actions: [
    { type: 'join', label: 'join', id: 'a' },
    { type: 'sample', label: 'tick3', nowMs: 150 },
    { type: 'input', label: 'late', id: 'a', seq: 1, move: 'E', sentAtMs: 0 },
    { type: 'sample', label: 'tick7', nowMs: 350 },
  ] });
  const late = result.observed.checkpoints.find(({ label }) => label === 'late');
  assert.equal(late.actors[0].expiresAt, 7);
  assert.equal(result.observed.checkpoints.at(-1).actors[0].x, 2000);
  assert.match(byId(postCheckFeedback(), 'receipt-window').answer, /4, 5, 6 and 7.*x=2000/);
  const retry = runInvestigation({ schema: 1, startMs: 0, actions: [
    { type: 'join', label: 'join', id: 'a' },
    { type: 'input', label: 'east', id: 'a', seq: 1, move: 'E' },
    { type: 'sample', label: 'tick3', nowMs: 150 },
    { type: 'input', label: 'stale-west', id: 'a', seq: 1, move: 'W' },
    { type: 'sample', label: 'tick4', nowMs: 200 },
    { type: 'sample', label: 'tick5', nowMs: 250 },
  ] });
  assert.deepEqual(retry.observed.checkpoints.slice(2).map((item) => item.actors[0].x), [1750, 1750, 2000, 2000]);
  assert.equal(retry.observed.checkpoints[3].receipt.status, 'stale');
  assert.match(byId(postCheckFeedback(), 'stale-retry').answer, /x stays 1750.*expiry stays 4.*x=2000.*x=2000/);
  const clock = createClock(0);
  assert.deepEqual(clock.sample(826.5), { ticks: 5, dropped: 11, overruns: 1, remainder: 26.5 });
  assert.deepEqual(clock.sample(850), { ticks: 1, dropped: 0, overruns: 1, remainder: 0 });
  assert.match(byId(postCheckFeedback(), 'bounded-clock').answer, /5 ticks, drops 11.*26\.5 ms/);
  const fresh = createClock(0);
  assert.deepEqual([fresh.sample(20), fresh.sample(620), fresh.sample(650)], [
    { ticks: 0, dropped: 0, overruns: 0, remainder: 20 },
    { ticks: 5, dropped: 7, overruns: 1, remainder: 20 },
    { ticks: 1, dropped: 0, overruns: 1, remainder: 0 },
  ]);
});

test('integrity keys preserve exact refusal categories and approved update behavior', async () => {
  const { postCheckFeedback } = await feedback('integrity');
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);
  const make = () => ({ manifest: { schema: 1, packageId: 'courier-runtime', release: 'r1', files: [{ path: 'engine.mjs', sha256: a }] }, observed: [{ path: 'engine.mjs', sha256: a }], supported: ['r1', 'r2'] });
  const samples = [
    ['approved-package', make(), { ok: true, reason: 'verified' }],
    ['changed-bytes', { ...make(), observed: [{ path: 'engine.mjs', sha256: b }] }, { ok: false, reason: 'digest' }],
    ['extra-file', { ...make(), observed: [...make().observed, { path: 'other.mjs', sha256: a }] }, { ok: false, reason: 'inventory' }],
    ['duplicate-path', { ...make(), observed: [...make().observed, ...make().observed] }, { ok: false, reason: 'inventory' }],
  ];
  const update = make();
  update.manifest.release = 'r2';
  update.manifest.files[0].sha256 = b;
  update.observed[0].sha256 = b;
  samples.push(['approved-update', update, { ok: true, reason: 'verified' }]);
  for (const [id, input, expected] of samples) {
    assert.deepEqual(checkPackage(input), expected);
    assert.ok(byId(postCheckFeedback(), id).answer.includes(`reason:'${expected.reason}'`));
  }
});

test('telemetry keys reject malformed history before final equality and compare empty checkpoints', async () => {
  const { postCheckFeedback } = await feedback('telemetry');
  let applications = 0;
  const engine = { release: 'r1', restore: (state) => structuredClone(state), apply: () => { applications += 1; }, canonical: (state) => state, equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) };
  const empty = { schema: 1, runtimeRelease: 'r1', startIndex: 70, checkpoint: { score: 3 }, events: [], endIndex: 70, complete: true, final: { score: 3 } };
  for (const indices of [[71, 73], [72, 71]]) {
    const record = { ...empty, endIndex: 72, events: indices.map((index) => ({ index, event: {} })) };
    assert.deepEqual(replayWindow(record, engine), { ok: false, reason: 'sequence' });
  }
  assert.equal(applications, 0);
  assert.deepEqual(replayWindow(empty, engine), { ok: true, state: { score: 3 } });
  assert.deepEqual(replayWindow({ ...empty, final: { score: 4 } }, engine), { ok: false, reason: 'final' });
  assert.match(byId(postCheckFeedback(), 'missing-index').answer, /reason:'sequence'.*71 and 72/);
  assert.match(byId(postCheckFeedback(), 'empty-window').answer, /endIndex must equal startIndex/);
});

test('recovery keys agree with target, compatibility, ordinal and UTF-16 rules', async () => {
  const { postCheckFeedback, reviewerFeedback } = await feedback('recovery');
  const evidence = {
    targetReleaseId: 'r1', releases: [{ id: 'r1', packageHash: 'p1', stateSchema: 1, configId: 'c1', configHash: 'h1' }],
    configurations: [{ id: 'c1', hash: 'h1', releaseId: 'r1', stateSchema: 1 }],
    snapshots: [
      { id: 'older', hash: 's2', ordinal: 2, stateSchema: 1, configId: 'c1', configHash: 'h1' },
      { id: 'z-ready', hash: 'sz', ordinal: 6, stateSchema: 1, configId: 'c1', configHash: 'h1' },
      { id: 'a-ready', hash: 'sa', ordinal: 6, stateSchema: 1, configId: 'c1', configHash: 'h1' },
      { id: 'newer', hash: 's10', ordinal: 10, stateSchema: 2, configId: 'c1', configHash: 'h1' },
    ],
  };
  assert.equal(selectRecovery(evidence).snapshotId, 'a-ready');
  assert.equal(selectRecovery({ ...evidence, snapshots: evidence.snapshots.toReversed() }).snapshotId, 'a-ready');
  assert.deepEqual(selectRecovery({ ...evidence, targetReleaseId: 'r3' }), { ok: false, reason: 'unknown-target' });
  const incompatible = [{ id: 'wrong-hash', hash: 's1', ordinal: 1, stateSchema: 1, configId: 'c1', configHash: 'h2' }, { id: 'wrong-schema', hash: 's2', ordinal: 2, stateSchema: 2, configId: 'c1', configHash: 'h1' }];
  assert.deepEqual(selectRecovery({ ...evidence, snapshots: incompatible }), { ok: false, reason: 'no-compatible-snapshot' });
  const tied = ['a-ready', 'Z-ready'].map((id) => ({ ...evidence.snapshots[0], id, ordinal: 9 }));
  assert.equal(selectRecovery({ ...evidence, snapshots: tied }).snapshotId, 'Z-ready');
  const practice = { ...evidence, snapshots: [
    { ...evidence.snapshots[3], ordinal: 13 },
    { ...evidence.snapshots[1], id: 'm-snap', ordinal: 8 },
    { ...evidence.snapshots[0], ordinal: 5 },
    { ...evidence.snapshots[2], id: 'B-snap', ordinal: 8 },
  ] };
  assert.equal(selectRecovery(practice).snapshotId, 'B-snap');
  assert.equal(selectRecovery({ ...practice, snapshots: practice.snapshots.toReversed() }).snapshotId, 'B-snap');
  assert.deepEqual(selectRecovery({ ...practice, targetReleaseId: 'r4' }), { ok: false, reason: 'unknown-target' });
  assert.match(byId(postCheckFeedback(), 'snapshot-order').answer, /ordinal-8.*B-snap/);
  assert.match(reviewerFeedback().freshVariantAnswers.find(({ id }) => id === 'snapshot-order').answer, /Z-ready wins/);
});

test('capstone keys preserve distance, successful receipts, failed IDs and refusal precedence', async () => {
  const { postCheckFeedback } = await feedback('capstone');
  const request = { requestId: 'A', stationId: 'alpha' };
  const base = () => addActor(initialState(), 'actor-1');
  for (const [x, y, reason] of [[400, 0, 'repaired'], [300, 300, 'range']]) {
    const state = base();
    Object.assign(state.actors[0], { x, y });
    assert.equal(repair(state, 'actor-1', request).reason, reason);
  }
  assert.match(byId(postCheckFeedback(), 'range-boundary').answer, /160000.*180000>160000/);
  const first = repair(base(), 'actor-1', request);
  const moved = structuredClone(first.state);
  moved.actors[0].x = 900;
  const duplicate = repair(moved, 'actor-1', request);
  assert.equal(duplicate.reason, 'duplicate');
  assert.deepEqual(duplicate.receipt, first.receipt);
  assert.deepEqual(duplicate.state, moved);
  assert.equal(repair(moved, 'actor-1', { ...request, stationId: 'beta' }).reason, 'conflict');
  const failed = repair(moved, 'actor-1', { ...request, requestId: 'B' });
  assert.equal(failed.reason, 'range');
  assert.deepEqual(failed.state, moved);
  failed.state.actors[0].x = 0;
  const second = repair(failed.state, 'actor-1', { ...request, requestId: 'B' });
  assert.equal(second.reason, 'repaired');
  assert.equal(repair(second.state, 'actor-1', { ...request, requestId: 'C' }).reason, 'history-full');
  assert.equal(repair(second.state, 'actor-1', request).reason, 'duplicate');
  assert.equal(repair(second.state, 'actor-1', { requestId: 'C', stationId: 'missing' }).reason, 'station');
});

test('proximity key arithmetic agrees with the actual guard, including signs and both axes', async () => {
  const { postCheckFeedback } = await feedback('lab');
  const expected = [[250, 0, null], [251, 0, 'range'], [150, 200, null], [200, 200, 'range']];
  for (const [x, y, reason] of expected) assert.equal(interactionDenial({ x, y, nextInteractTick: 0 }, { x: 0, y: 0 }, 1), reason);
  assert.match(byId(postCheckFeedback(), 'axis-edge').answer, /62500/);
  assert.match(byId(postCheckFeedback(), 'outside-edge').answer, /63001/);
  assert.match(byId(postCheckFeedback(), 'diagonal-outside').answer, /80000/);
});

test('order v3 keys agree with admitted-state preservation and inclusive movement windows', async () => {
  const { postCheckFeedback, reviewerFeedback } = await feedback('lab/order');
  const empty = { lastSeq: 0, lastSeen: 0, expiresAt: 0, move: 'idle', pendingInteract: false };
  const west = admitInput(empty, { seq: 7, move: 'W', interact: false }, 1).next;
  const stale = admitInput(west, { seq: 6, move: 'E', interact: true }, 3);
  assert.equal(stale.status, 'stale');
  assert.deepEqual(stale.next, west);
  const ticksThrough4 = [2, 3, 4].filter((tick) => movementActive(stale.next, tick));
  assert.equal(2000 - ticksThrough4.length * 250, 1250);
  assert.equal(stale.next.pendingInteract, false);
  assert.equal(stale.next.expiresAt, 5);
  const east = admitInput(empty, { seq: 3, move: 'E', interact: false }, 2).next;
  const active = [3, 4, 5, 6, 7, 8].filter((tick) => movementActive(east, tick));
  assert.deepEqual(active, [3, 4, 5, 6]);
  assert.equal(1000 + active.length * 250, 2000);
  const initialWest = admitInput(empty, { seq: 1, move: 'W', interact: false }, 2).next;
  const renewed = admitInput(initialWest, { seq: 2, move: 'W', interact: false }, 6).next;
  assert.equal(movementActive(renewed, 7), true);
  assert.equal(renewed.expiresAt, 10);
  assert.match(byId(postCheckFeedback(), 'stale-command').answer, /x=1250, pendingInteract=false and expiresAt=5/);
  assert.match(byId(postCheckFeedback(), 'read-only-polling').answer, /T6.*T8 is x=2000/);
  assert.match(reviewerFeedback().transfer.question, /^An owned replay scrubber/);
  assert.doesNotMatch(reviewerFeedback().transfer.referenceAnswer, /expiresAt=/);
});
