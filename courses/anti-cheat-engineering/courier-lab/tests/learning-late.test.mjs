import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as integrity from '../learning/units/integrity.mjs';
import * as telemetry from '../learning/units/telemetry.mjs';
import * as evaluation from '../learning/units/evaluation.mjs';
import * as retention from '../learning/units/retention.mjs';
import * as recovery from '../learning/units/recovery.mjs';
import * as capstone from '../learning/units/capstone.mjs';

const modules = [integrity, telemetry, evaluation, retention, recovery, capstone];
const project = new URL('../', import.meta.url);
const seeds = Array.from({ length: 128 }, (_, i) => `independent-${i * 7919 + 17}`);

// These oracles intentionally do not import the generators' helpers or their policy code.
function packageDecision({ manifest, observed, supported }) {
  if (!supported.some((r) => r === manifest.release)) return { ok: false, reason: 'unsupported-release' };
  const paths = observed.map((f) => f.path);
  if (paths.length !== manifest.files.length || manifest.files.some((f) => !paths.includes(f.path))) return { ok: false, reason: 'inventory' };
  for (const approved of manifest.files) {
    const actual = observed.find((f) => f.path === approved.path);
    if (actual.sha256.toLowerCase() !== approved.sha256.toLowerCase()) return { ok: false, reason: 'digest' };
  }
  return { ok: true, reason: 'verified' };
}
function replayReason({ record: r, engineRelease }) {
  if (r.schema !== 1) return 'schema';
  if (r.runtimeRelease !== engineRelease) return 'incompatible';
  if (!r.complete || !Array.isArray(r.events) || r.events.length > 256) return 'incomplete';
  if (r.endIndex - r.startIndex !== r.events.length) return 'sequence';
  for (let i = 0; i < r.events.length; i += 1) if (r.events[i].index - r.startIndex !== i + 1) return 'sequence';
  let total = r.checkpoint.score;
  for (const e of r.events) total += e.event.add;
  return total === r.final.score ? 'reproduced' : 'final';
}
function flag(signals, s, inclusive = false) {
  // Count at every integer tick rather than using the implementation's eligible-endpoint scan.
  const last = Math.max(0, ...signals.map((x) => x.tick));
  for (let end = 0; end <= last; end += 1) {
    let count = 0;
    for (const x of signals) {
      if (x.reason !== 'range' || x.distanceSquared <= s.minDistanceMm * s.minDistanceMm) continue;
      if (x.tick <= end && (inclusive ? x.tick >= end - s.windowTicks : x.tick > end - s.windowTicks)) count += 1;
    }
    if (count >= s.threshold) return true;
  }
  return false;
}
function metrics(cases, settings) {
  const cells = [0, 0, 0, 0]; // tp, fp, tn, fn
  for (const c of cases) cells[flag(c.signals, settings) ? (c.label ? 0 : 1) : (c.label ? 3 : 2)] += 1;
  const [tp, fp, tn, fn] = cells;
  return { total: cases.length, tp, fp, tn, fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, falsePositiveRate: fp + tn ? fp / (fp + tn) : null };
}
function kept(events, s) {
  const eligible = [];
  for (const event of events) if (event.tick <= s.nowTick && s.nowTick - event.tick < s.maxAgeTicks) eligible.push(event);
  const output = [];
  for (let i = Math.max(0, eligible.length - s.maxEvents); i < eligible.length; i += 1) {
    const e = eligible[i];
    output.push({ tick: e.tick, actorId: e.actorId, reason: e.reason, distanceSquared: e.distanceSquared });
  }
  return output;
}
function selected(e) {
  const r = e.releases.find((x) => e.targetReleaseId === x.id);
  if (!r) return { ok: false, reason: 'unknown-target' };
  const c = e.configurations.find((x) => r.configId === x.id);
  if (!c || [c.hash !== r.configHash, c.releaseId !== r.id, c.stateSchema !== r.stateSchema].some(Boolean)) return { ok: false, reason: 'configuration-mismatch' };
  let best;
  for (const s of e.snapshots) {
    if (s.configId !== c.id || s.configHash !== c.hash || s.stateSchema !== r.stateSchema) continue;
    if (!best || s.ordinal > best.ordinal || (s.ordinal === best.ordinal && s.id < best.id)) best = s;
  }
  if (!best) return { ok: false, reason: 'no-compatible-snapshot' };
  return { ok: true, releaseId: r.id, packageHash: r.packageHash, configId: c.id, configHash: c.hash, snapshotId: best.id, snapshotHash: best.hash };
}
function repairProjection({ state, actorId, request }) {
  const a = state.actors.find((x) => x.id === actorId);
  const c = state.config;
  const existing = a.receipts.find((r) => r.requestId === request.requestId);
  let reason = existing ? (existing.stationId === request.stationId ? 'duplicate' : 'conflict') : null;
  const s = state.stations.find((x) => x.id === request.stationId);
  const refusals = [
    [!s, 'station'], [a.receipts.length >= c.receiptLimit, 'history-full'],
    [s && Math.hypot(a.x - s.x, a.y - s.y) > c.rangeMm, 'range'],
    [a.energy >= c.energyCap, 'full'], [a.credits < c.repairCost, 'funds'],
  ];
  if (!reason) reason = refusals.find(([fails]) => fails)?.[1] ?? 'repaired';
  if (reason !== 'repaired') return { reason, receipt: reason === 'duplicate' ? existing : null, energy: a.energy, credits: a.credits, receiptCount: a.receipts.length };
  const energy = Math.min(c.energyCap, a.energy + c.repairEnergy);
  const credits = a.credits - c.repairCost;
  return { reason, receipt: { requestId: request.requestId, stationId: request.stationId, energyAdded: energy - a.energy, creditsSpent: c.repairCost, energy, credits }, energy, credits, receiptCount: a.receipts.length + 1 };
}
function expectedFor(id, section, x) {
  if (id === 'integrity') {
    if (section !== 'trust') return packageDecision(x);
    const assurance = x.packageCanWriteApproval ? 'untrusted-reference' : x.plugins.some((p) => p.approvedHash !== p.observedHash) ? 'unapproved-bytes' : 'matching-only';
    return { start: assurance === 'matching-only', assurance };
  }
  if (id === 'telemetry') {
    if (section === 'checkpoint') return x.checkpoint.score + x.additions.reduce((a, b) => a + b, 0);
    const reason = replayReason(x);
    return section === 'sequence' ? { ok: reason === 'reproduced', reason } : { reason, claim: reason === 'reproduced' ? 'consistent-only' : 'not-reproduced' };
  }
  if (id === 'evaluation') {
    if (section === 'window') return { flagged: flag(x.signals, x.settings) };
    if (section === 'metrics') return metrics(x.cases, x.settings);
    return { report: x.changedSettingsUsingThatFeedback ? 'revision' : 'first-committed-evaluation', twinFlagged: flag(x.twinSignals, x.settings), twinFlagsMustMatch: true, automationIdentifiable: false };
  }
  if (id === 'retention') {
    const retained = kept(x.events, x.settings);
    if (section === 'window') return { actorIds: retained.map((e) => e.actorId) };
    if (section === 'projection') return retained;
    const needed = x.events.filter((e) => e.tick <= x.settings.nowTick && x.settings.nowTick - e.tick < x.detectorWindowTicks);
    const missingCount = needed.filter((e) => !retained.some((r) => r.actorId === e.actorId)).length;
    return { canReconstructWindow: missingCount === 0, missingCount, otherExportRemains: x.separateExport !== x.deletedExport };
  }
  if (id === 'recovery') {
    if (section !== 'loss') {
      const answer = selected(x);
      return section === 'tuple' && answer.ok ? { ok: true, reason: 'compatible' } : answer;
    }
    const seq = [];
    for (let i = x.restoredLastSeq + 1; i <= x.highestBeforeRestore; i += 1) seq.push(i);
    return { reopenedStart: seq[0] ?? null, reopenedEnd: seq.at(-1) ?? null, reopenedCount: seq.length, lostScore: x.scoreBeforeRestore - x.restoredScore, sameActionWorks: x.actionAppliedAfterRestore, allAcknowledgedPreserved: seq.length === 0 };
  }
  if (x.experiment === 'matching-replies-hidden-state') {
    const duplicate = x.priorReceipts.filter((r) => r.actorId === x.actorId).some((r) => r.requestId === x.request.requestId);
    return {
      probe: 'actor-state', when: x.snapshotBefore === null ? 'before-and-after' : 'after',
      operation: duplicate ? 'duplicate' : 'new', creditsDelta: duplicate ? 0 : -x.config.repairCost,
      energyInvariant: duplicate ? 'unchanged' : 'add-up-to-cap', receiptCountDelta: duplicate ? 0 : 1,
      receiptIdentity: duplicate ? 'preserve-existing' : 'record-request', replyAloneSuffices: false,
    };
  }
  if (section !== 'observe') return repairProjection(x);
  const added = Math.min(x.config.repairEnergy, x.config.energyCap - x.before.energy);
  const energy = x.before.energy + added;
  const credits = x.before.credits - x.config.repairCost;
  const receiptMatches = x.observed.receipt.energyAdded === added && x.observed.receipt.creditsSpent === x.config.repairCost && x.observed.receipt.energy === energy && x.observed.receipt.credits === credits;
  return { energyMatches: x.observed.energy === energy, creditsMatch: x.observed.credits === credits, receiptMatches };
}

function assertCompletionWork(id, section, x) {
  assert.ok(Array.isArray(x.completedSteps) && x.completedSteps.length > 0);
  const shown = x.completedSteps.join('\n');
  const includes = (fragment) => assert.ok(shown.includes(String(fragment)), `missing correct partial result: ${fragment}`);
  switch (`${id}:${section}`) {
    case 'integrity:reference':
      includes(JSON.stringify([...x.manifest.files].map((f) => f.path).sort()));
      includes(`contains ${x.manifest.files.length} paths`);
      break;
    case 'integrity:compare':
      includes(JSON.stringify(x.observed.map((f) => ({ path: f.path, sha256: f.sha256.toLocaleLowerCase('en-US') }))));
      break;
    case 'integrity:trust':
      includes(`coreMatches=${x.coreMatches}`);
      includes(`giving ${x.plugins[0].approvedHash === x.plugins[0].observedHash}`);
      assert.ok(x.plugins.length > 1, 'at least one extension remains to be checked');
      break;
    case 'telemetry:checkpoint':
      assert.ok(x.additions.length > 1, 'a later operation remains after the supplied calculation');
      includes(`register is ${x.checkpoint.score + x.additions[0]}`);
      includes(`remaining ${x.additions.length - 1} operations`);
      break;
    case 'telemetry:sequence':
      includes(`${x.record.startIndex} + ${x.record.events.length} = ${x.record.endIndex}`);
      includes(`should be ${x.record.startIndex + 1}`);
      break;
    case 'telemetry:claim': {
      let subtotal = 0;
      for (const entry of x.record.events) subtotal += entry.event.add;
      includes(`sum to ${subtotal}`);
      includes('excludes the saved checkpoint');
      break;
    }
    case 'evaluation:window':
    case 'evaluation:claim': {
      const signals = section === 'window' ? x.signals : x.twinSignals;
      const minSquared = x.settings.minDistanceMm * x.settings.minDistanceMm;
      const ticks = [];
      for (const s of signals) if (s.reason === 'range' && s.distanceSquared > minSquared) ticks.push(s.tick);
      includes(`${minSquared} mm²`);
      includes(JSON.stringify(ticks));
      break;
    }
    case 'evaluation:metrics': {
      assert.ok(x.cases.length >= 2, 'later cases remain for the learner');
      const first = x.cases[0];
      const flagged = flag(first.signals, x.settings);
      const cell = flagged ? first.label ? 'tp' : 'fp' : first.label ? 'fn' : 'tn';
      includes(`flagged=${flagged}`);
      includes(`contributes one ${cell}`);
      includes(`other ${x.cases.length - 1} cases`);
      break;
    }
    case 'retention:window': {
      const eligible = x.events.filter((e) => x.settings.nowTick - e.tick < x.settings.maxAgeTicks && e.tick <= x.settings.nowTick);
      includes(JSON.stringify(eligible.map((e) => e.actorId)));
      includes('Apply the count bound next');
      break;
    }
    case 'retention:projection': {
      const selectedIds = kept(x.events, x.settings).map((e) => e.actorId);
      const positions = x.events.flatMap((e, i) => selectedIds.includes(e.actorId) ? [i] : []);
      includes(JSON.stringify(positions));
      includes('Build new four-field records');
      break;
    }
    case 'retention:evidence':
      includes(`export age edge is ${x.settings.nowTick - x.settings.maxAgeTicks}`);
      includes(`detector's old edge is ${x.settings.nowTick - x.detectorWindowTicks}`);
      break;
    case 'recovery:tuple': {
      const r = x.releases.find((v) => v.id === x.targetReleaseId);
      includes(r ? JSON.stringify({ id: r.id, stateSchema: r.stateSchema, configId: r.configId, configHash: r.configHash }) : 'no matching release');
      break;
    }
    case 'recovery:selection': {
      const r = x.releases.find((v) => v.id === x.targetReleaseId);
      const c = r && x.configurations.find((v) => v.id === r.configId);
      const partial = r && c ? x.snapshots.filter((s) => s.stateSchema === r.stateSchema && s.configId === c.id && s.configHash === c.hash) : [];
      includes(JSON.stringify(partial.map((s) => ({ id: s.id, ordinal: s.ordinal }))));
      includes('does not validate the configuration');
      break;
    }
    case 'recovery:loss':
      includes(`${x.scoreBeforeRestore} − ${x.restoredScore} = ${x.scoreBeforeRestore - x.restoredScore}`);
      includes('Complete the reopened sequence interval');
      break;
    case 'capstone:identity': {
      const actor = x.state.actors.find((a) => a.id === x.actorId);
      let position = -1;
      actor.receipts.forEach((r, i) => { if (r.requestId === x.request.requestId) position = i; });
      includes(`index ${position}`);
      includes("Another actor's receipt list was excluded");
      break;
    }
    case 'capstone:transaction': {
      const actor = x.state.actors.find((a) => a.id === x.actorId);
      includes(`${x.state.config.energyCap} − ${actor.energy} = ${x.state.config.energyCap - actor.energy}`);
      includes('complete all ordered admission checks');
      break;
    }
    case 'capstone:observe': {
      const gap = x.config.energyCap - x.before.energy;
      const addition = gap < x.config.repairEnergy ? gap : x.config.repairEnergy;
      includes(`${x.config.energyCap} − ${x.before.energy} = ${gap}`);
      includes(`min(${x.config.repairEnergy}, gap) = ${addition}`);
      break;
    }
    default: assert.fail('completion family has no independent scaffold check');
  }
}

for (const module of modules) {
  const { unit, makeItem } = module;
  test(`${unit.id}: sections, references, objectives and milestones are present`, () => {
    assert.ok(unit.sections.length >= 2 && unit.sections.length <= 4);
    assert.equal(unit.masterySlots.length, 3);
    assert.equal(unit.support.hints.length, 3);
    assert.ok(unit.support.milestones.length >= 3);
    for (const section of unit.sections) {
      assert.ok(section.paragraphs.length >= 2);
      assert.ok(section.worked.steps.length >= 3);
      assert.ok(section.worked.answer);
      assert.ok(section.completion.missing);
      assert.ok(unit.objectives.some((o) => section.objectiveIds.includes(o.id)));
      assert.ok(existsSync(fileURLToPath(new URL(section.source.path, project))));
    }
  });
  for (const mode of ['practice', 'completion', 'mastery']) {
    const keys = mode === 'mastery' ? unit.masterySlots : unit.sections.map((s) => s.id);
    keys.forEach((key, index) => {
      test(`${unit.id} ${mode}/${key}: 128 independently recomputed instances`, () => {
        const distinct = new Set();
        const section = unit.sections[index].id;
        for (const seed of seeds) {
          const item = makeItem({ mode, key, seed });
          assert.deepEqual(item, makeItem({ mode, key, seed }), 'same seed is reproducible');
          assert.deepEqual(item.expected, expectedFor(unit.id, section, item.inputs));
          if (mode === 'completion') assertCompletionWork(unit.id, section, item.inputs);
          if (mode !== 'completion') assert.equal(Object.hasOwn(item.inputs, 'completedSteps'), false);
          assert.equal(item.hints.length, mode === 'mastery' ? 0 : 3);
          assert.ok(item.explanation.length > 80);
          const objectiveIds = unit.id === 'capstone' && mode === 'mastery' && key === 'transfer'
            ? ['capstone.identity', 'capstone.transaction', 'capstone.observe'] : unit.sections[index].objectiveIds;
          assert.deepEqual(item.objectiveIds, objectiveIds);
          assert.ok(item.source.anchor && existsSync(fileURLToPath(new URL(item.source.path, project))));
          distinct.add(JSON.stringify(item.inputs));
        }
        assert.ok(distinct.size >= 60, `fresh inputs: ${distinct.size}/128`);
      });
    });
  }
  test(`${unit.id}: invalid routes fail explicitly`, () => {
    assert.throws(() => makeItem({ mode: 'solution', key: unit.sections[0].id, seed: 1 }), /mode/);
    assert.throws(() => makeItem({ mode: 'practice', key: 'absent', seed: 1 }), /key/);
  });
}

test('generated cases expose plausible wrong answers, including boundary and trust errors', () => {
  const caught = new Set();
  for (const seed of seeds) {
    const i = integrity.makeItem({ mode: 'mastery', key: 'refusal', seed });
    if (i.expected.reason === 'unsupported-release') caught.add('release-before-digest');
    const trust = integrity.makeItem({ mode: 'mastery', key: 'transfer', seed });
    if (!trust.expected.start && trust.inputs.coreMatches) caught.add('core-match-approves-all');
    const t = telemetry.makeItem({ mode: 'mastery', key: 'boundary', seed });
    if (t.expected !== t.inputs.additions.reduce((a, b) => a + b, 0)) caught.add('reset-checkpoint');
    const seq = telemetry.makeItem({ mode: 'mastery', key: 'refusal', seed });
    if (seq.expected.reason === 'sequence') caught.add('final-equality-hides-gap');
    const e = evaluation.makeItem({ mode: 'mastery', key: 'boundary', seed });
    if (e.expected.flagged !== flag(e.inputs.signals, e.inputs.settings, true)) caught.add('inclusive-old-edge');
    const m = evaluation.makeItem({ mode: 'mastery', key: 'counts', seed });
    if (Object.values(m.expected).includes(null)) caught.add('undefined-rate-is-zero');
    if (m.inputs.cases.reduce((n, c) => n + c.signals.length, 0) !== m.expected.total) caught.add('signal-count-is-case-count');
    const r = retention.makeItem({ mode: 'mastery', key: 'boundary', seed });
    const wrongTail = r.inputs.events.slice(-r.inputs.settings.maxEvents).filter((x) => x.tick <= r.inputs.settings.nowTick && x.tick > r.inputs.settings.nowTick - r.inputs.settings.maxAgeTicks).map((x) => x.actorId);
    if (JSON.stringify(wrongTail) !== JSON.stringify(r.expected.actorIds)) caught.add('count-before-age');
    const recover = recovery.makeItem({ mode: 'mastery', key: 'newest', seed });
    if (recover.expected.ok && recover.expected.snapshotId !== 'future') caught.add('newest-incompatible');
    if (recover.expected.snapshotId === 'Z-ready') caught.add('wrong-string-tie');
    const repair = capstone.makeItem({ mode: 'mastery', key: 'identity', seed });
    if (repair.expected.reason === 'duplicate') {
      caught.add('range-before-duplicate');
      assert.equal(repair.expected.credits, repair.inputs.state.actors[0].credits);
      assert.notEqual(repair.expected.credits, repair.inputs.state.actors[0].credits - repair.inputs.state.config.repairCost);
      caught.add('charge-duplicate');
    }
    const atomic = capstone.makeItem({ mode: 'mastery', key: 'atomic', seed });
    if (atomic.expected.reason === 'range') {
      assert.equal(atomic.expected.credits, atomic.inputs.state.actors[0].credits);
      caught.add('debit-before-refusal');
    }
    if (atomic.expected.reason === 'repaired' && atomic.inputs.state.actors[0].x === atomic.inputs.state.config.rangeMm) caught.add('exclude-range-edge');
    const observe = capstone.makeItem({ mode: 'mastery', key: 'transfer', seed });
    if (Object.values(observe.expected).includes(false)) caught.add('reason-only-test');
  }
  assert.deepEqual([...caught].sort(), ['release-before-digest', 'core-match-approves-all', 'reset-checkpoint', 'final-equality-hides-gap', 'inclusive-old-edge', 'undefined-rate-is-zero', 'signal-count-is-case-count', 'count-before-age', 'newest-incompatible', 'wrong-string-tie', 'range-before-duplicate', 'charge-duplicate', 'debit-before-refusal', 'exclude-range-edge', 'reason-only-test'].sort());
});

test('capstone transfer chooses a sufficient observation experiment when replies are identical', () => {
  const branches = new Set();
  for (const seed of seeds) {
    const item = capstone.makeItem({ mode: 'mastery', key: 'transfer', seed });
    const x = item.inputs;
    const currentReceipts = x.priorReceipts.filter((r) => r.actorId === x.actorId).map(({ actorId, ...receipt }) => receipt);
    const repeated = currentReceipts.some((r) => r.requestId === x.request.requestId);
    const before = x.snapshotBefore ?? { energy: x.config.energyCap - 1, credits: x.config.repairCost + 9, receipts: currentReceipts };
    const correct = structuredClone(before);
    if (!repeated) {
      const addition = Math.min(x.config.repairEnergy, x.config.energyCap - before.energy);
      correct.energy += addition;
      correct.credits -= x.config.repairCost;
      correct.receipts.push({ ...x.request, energyAdded: addition, creditsSpent: x.config.repairCost, energy: correct.energy, credits: correct.credits });
    }
    const matchesInvariant = (after) => {
      const energy = item.expected.energyInvariant === 'unchanged' ? before.energy : Math.min(x.config.energyCap, before.energy + x.config.repairEnergy);
      const previousKept = before.receipts.every((r, i) => JSON.stringify(r) === JSON.stringify(after.receipts[i]));
      const newReceipt = after.receipts.at(-1);
      const receiptIdentity = item.expected.receiptIdentity === 'preserve-existing'
        ? previousKept
        : previousKept && newReceipt?.requestId === x.request.requestId && newReceipt.stationId === x.request.stationId && newReceipt.energyAdded === energy - before.energy && newReceipt.creditsSpent === x.config.repairCost;
      return after.energy === energy && after.credits - before.credits === item.expected.creditsDelta && after.receipts.length - before.receipts.length === item.expected.receiptCountDelta && receiptIdentity;
    };
    assert.equal(matchesInvariant(correct), true, 'the independently simulated correct transaction satisfies the chosen experiment');
    const incorrect = repeated ? { ...structuredClone(before), credits: before.credits - x.config.repairCost } : structuredClone(before);
    assert.equal(matchesInvariant(incorrect), false, 'a hidden duplicate debit or missing new transaction is exposed even with the same POST reply');
    assert.equal(item.expected.probe, 'actor-state');
    assert.equal(item.expected.when, x.snapshotBefore ? 'after' : 'before-and-after');
    assert.equal(item.expected.replyAloneSuffices, false);
    assert.ok(x.availableProbes.some((p) => p.id === item.expected.probe));
    const scope = !repeated && x.priorReceipts.some((r) => r.requestId === x.request.requestId) ? 'other-actor-id' : repeated ? 'duplicate' : 'fresh-id';
    branches.add(`${scope}:${item.expected.when}`);
    assert.notDeepEqual(item.expected, { ...item.expected, probe: 'repair-reply', replyAloneSuffices: true });
    assert.notDeepEqual(item.expected, { ...item.expected, when: x.snapshotBefore ? 'before-and-after' : 'after' });
  }
  assert.deepEqual([...branches].sort(), ['duplicate:after', 'duplicate:before-and-after', 'fresh-id:after', 'fresh-id:before-and-after', 'other-actor-id:after', 'other-actor-id:before-and-after'].sort());
});
