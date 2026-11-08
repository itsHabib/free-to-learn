import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as policy from '../recovery/policy.mjs';
import * as template from '../recovery/template.mjs';
import { correctPolicies, wrongPolicies } from '../recovery/controls.mjs';
import { cases, assess } from '../recovery/fixtures.mjs';
import { createTrialEvidence, runTrial, hashValue, TRIAL_VERSION } from '../recovery/runtime.mjs';

const copy = (value) => JSON.parse(JSON.stringify(value));

for (const [name, candidate] of Object.entries(correctPolicies)) {
  test(`independent correct policy passes: ${name}`, async () => {
    const result = await assess(candidate);
    assert.equal(result.passed, true, JSON.stringify(result.criteria.filter((item) => !item.passed), null, 2));
    assert.equal(result.criteria.length, cases().length + 1);
  });
}

for (const [name, candidate] of Object.entries(wrongPolicies)) {
  test(`calibration rejects wrong control: ${name}`, async () => {
    const result = await assess(candidate);
    assert.equal(result.passed, false, name);
    for (const item of result.criteria.filter((criterion) => !criterion.passed)) {
      assert.ok(Object.hasOwn(item.error, 'expected'));
      assert.ok(Object.hasOwn(item.error, 'actual'));
      assert.match(item.error.source, /^LEARNER\.md#/);
    }
  });
}

test('selection returns only existing pinned identities without modifying evidence', () => {
  const item = cases()[0];
  const before = copy(item.evidence);
  const selected = policy.selectRecovery(item.evidence);
  assert.deepEqual(selected, item.expected);
  assert.deepEqual(item.evidence, before);
  assert.deepEqual(Object.keys(selected).sort(), ['configHash', 'configId', 'ok', 'packageHash', 'releaseId', 'snapshotHash', 'snapshotId']);
});

test('case-differing snapshot IDs expose locale collation instead of code-unit order', async () => {
  const item = cases().find((value) => value.name.includes('code-unit order'));
  assert.equal(policy.selectRecovery(item.evidence).snapshotId, 'Z-ready');
  assert.equal(wrongPolicies['locale-collation-on-tie'].selectRecovery(item.evidence).snapshotId, 'a-ready');
  const result = await assess(wrongPolicies['locale-collation-on-tie']);
  assert.equal(result.criteria.find((value) => value.name === item.name).passed, false);
});

test('incomplete template, missing export and throwing policy preserve diagnostic feedback', async () => {
  assert.equal((await assess(template)).passed, false);
  const missing = await assess({});
  assert.equal(missing.passed, false);
  assert.equal(missing.criteria[0].error.actual, 'undefined');
  const broken = await assess({ selectRecovery() { throw new Error('cannot select'); } });
  assert.equal(broken.passed, false);
  assert.deepEqual(broken.criteria[0].error.actual, { threw: 'cannot select' });
  assert.doesNotThrow(() => JSON.stringify(broken));
});

test('trial evidence is immutable, named, versioned and repeatable', async () => {
  const a = await createTrialEvidence();
  const b = await createTrialEvidence();
  assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(a.evidence));
  assert.ok(Object.isFrozen(a.evidence.snapshots[0].state));
  assert.throws(() => { a.evidence.snapshots[0].state.schema = 1; }, TypeError);
  for (const release of a.evidence.releases) {
    assert.match(release.packageHash, /^[a-f0-9]{64}$/);
    assert.equal(Object.keys(release.sourceHashes).length, 5);
  }
  for (const saved of a.evidence.snapshots) assert.equal(saved.hash, hashValue(saved.state));
  for (const observation of [a.baseline, a.candidate, a.codeOnly]) {
    assert.ok(a.evidence.snapshots.some((saved) => saved.id === observation.identity.snapshotId && saved.hash === observation.identity.snapshotHash));
  }
  const baseline = a.evidence.snapshots.find((item) => item.id === 'baseline-ready');
  const candidate = a.evidence.snapshots.find((item) => item.id === 'candidate-after-failure');
  assert.equal(baseline.state.schema, 1);
  assert.ok(baseline.state.checkpoint);
  assert.equal(candidate.state.schema, 2);
  assert.ok(candidate.state.payload.world);
  assert.equal(candidate.state.checkpoint, undefined);
});

test('baseline and recovery apply the same legal action through the existing engine', async () => {
  const report = await runTrial(policy);
  assert.equal(report.schema, TRIAL_VERSION);
  assert.equal(report.baseline.status, 'applied');
  assert.equal(report.baseline.reason, 'pickup');
  assert.equal(report.recovered.status, 'applied');
  assert.equal(report.recovered.reason, 'pickup');
  assert.deepEqual(report.baseline.action, report.recovered.action);
  assert.equal(report.baseline.action.distanceSquared, 250 ** 2);
  assert.deepEqual(report.baseline.before, report.recovered.before);
  assert.deepEqual(report.baseline.after, report.recovered.after);
  assert.equal(report.recovered.engineDecision.reason, 'pickup');
  assert.equal(report.recovered.before.actor.cargo, false);
  assert.equal(report.recovered.after.actor.cargo, true);
  assert.equal(report.baseline.inputSeq, 4);
  assert.equal(report.recovered.inputSeq, 4);
  assert.equal(report.baseline.lineage, 'original');
  assert.equal(report.recovered.lineage, 'restored-from:baseline-ready@tick3');
  assert.notEqual(report.baseline.lineage, report.recovered.lineage);
});

test('changed configuration denies that legal position without inventing an engine decision', async () => {
  const report = await runTrial(policy);
  assert.equal(report.candidate.status, 'denied');
  assert.equal(report.candidate.reason, 'configuration-range');
  assert.deepEqual(report.candidate.action, report.baseline.action);
  assert.equal(report.candidate.after.actor.cargo, false);
  assert.equal(report.candidate.after.actor.score, report.candidate.before.actor.score);
  assert.equal(report.candidate.engineDecision, null);
  assert.equal(report.candidate.after.tick, report.candidate.before.tick + 1);
  assert.equal(report.candidate.after.lastDecision.tick, 8);
  assert.equal(report.candidate.inputSeq, 12);
  assert.equal(report.candidate.lineage, 'original');
});

test('code-only rollback rejects actual incompatible state and preserves the failed trial', async () => {
  const report = await runTrial(policy);
  assert.equal(report.codeOnly.status, 'refused');
  assert.equal(report.codeOnly.reason, 'state-schema');
  assert.equal(report.codeOnly.stateIncompatible, true);
  assert.equal(report.codeOnly.configurationIncompatible, true);
  assert.equal(report.codeOnly.identity.releaseId, report.baseline.identity.releaseId);
  assert.equal(report.codeOnly.identity.configId, report.candidate.identity.configId);
  assert.equal(report.codeOnly.identity.stateSchema, 2);
  assert.equal(report.recovered.identity.stateSchema, 1);
  assert.equal(report.candidate.after.actor.score, 1);
  assert.equal(report.recovered.after.actor.score, 0);
  assert.equal(report.codeOnly.inputSeq, null);
  assert.equal(report.codeOnly.lineage, null);
});

test('recovery reports measured loss of the post-snapshot delivery and operation history', async () => {
  const report = await runTrial(policy);
  assert.deepEqual(report.dataLoss, {
    restored: true, restoredActionApplied: true, fromTick: 12, restoredTick: 3, discardedTicks: 9, discardedRecordedOperations: 18,
    scoreBeforeRecovery: 1, scoreAtRestoredSnapshot: 0, lostScore: 1,
    acknowledgedSequences: { highestBeforeRestore: 12, restoredLastSeq: 3, reopened: '4–12' },
    discardedSuccessfulActions: [
      { lineage: 'original', inputSeq: 4, tick: 4, status: 'applied', reason: 'pickup' },
      { lineage: 'original', inputSeq: 8, tick: 8, status: 'applied', reason: 'deposit' },
    ],
    note: 'Lost actions belong to the original lineage; the restored pickup belongs to a new branch. Restoring the checkpoint does not compensate deliveries, merge later history or prevent reuse of acknowledged sequence numbers.',
  });
  assert.match(report.limitations, /not a transactionally safe production rollback/);
});

test('failed or forged selection cannot claim a successful recovery', async () => {
  const refusal = await runTrial({ selectRecovery: () => ({ ok: false, reason: 'no-compatible-snapshot' }) });
  assert.equal(refusal.recovered.status, 'refused');
  assert.equal(refusal.dataLoss.restored, false);
  assert.equal(refusal.dataLoss.restoredActionApplied, false);
  assert.equal(refusal.dataLoss.restoredTick, null);
  assert.deepEqual(refusal.dataLoss.acknowledgedSequences, { highestBeforeRestore: 12, restoredLastSeq: null, reopened: null });
  assert.equal(refusal.recovered.lineage, null);
  assert.equal(refusal.recovered.inputSeq, null);
  const forged = await runTrial({ selectRecovery(evidence) {
    return { ...policy.selectRecovery(evidence), snapshotHash: '0'.repeat(64) };
  } });
  assert.equal(forged.recovered.reason, 'identity-mismatch');
  assert.equal(forged.dataLoss.lostScore, null);
  const codeOnly = await runTrial(wrongPolicies['code-only']);
  assert.equal(codeOnly.recovered.status, 'refused');
  assert.equal(codeOnly.recovered.reason, 'state-schema');
});

test('oldest compatible selection restores different state and fails the legal action replay', async () => {
  const report = await runTrial(wrongPolicies['oldest-compatible']);
  assert.equal(report.recovered.before.tick, 2);
  assert.equal(report.recovered.before.actor.x, 1500);
  assert.equal(report.recovered.reason, 'configuration-range');
  assert.equal(report.dataLoss.discardedTicks, 10);
  assert.equal(report.dataLoss.restored, true);
  assert.equal(report.dataLoss.restoredActionApplied, false);
  assert.equal(report.recovered.lineage, 'restored-from:baseline-before-approach@tick2');
  assert.equal(report.recovered.inputSeq, 3);
  assert.deepEqual(report.dataLoss.acknowledgedSequences, { highestBeforeRestore: 12, restoredLastSeq: 2, reopened: '3–12' });
});

test('all fixture repair pointers resolve to learner sections', async () => {
  const guide = await readFile(new URL('../recovery/LEARNER.md', import.meta.url), 'utf8');
  const anchors = new Set([...guide.matchAll(/^## (.+)$/gm)].map((match) => match[1].toLowerCase().replaceAll(' ', '-')));
  for (const fixture of cases()) assert.ok(anchors.has(fixture.section), fixture.section);
  assert.ok(anchors.has('run-the-recovery-trial'));
});
