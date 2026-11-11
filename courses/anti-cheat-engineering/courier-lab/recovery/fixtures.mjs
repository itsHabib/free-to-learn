import { isDeepStrictEqual } from 'node:util';
import { runTrial } from './runtime.mjs';

const copy = (value) => JSON.parse(JSON.stringify(value));
const digest = (letter) => letter.repeat(64);
function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function sample() {
  return {
    targetReleaseId: 'baseline',
    releases: [
      { id: 'baseline', packageHash: digest('a'), stateSchema: 1, configId: 'baseline-config', configHash: digest('b') },
      { id: 'candidate', packageHash: digest('c'), stateSchema: 2, configId: 'candidate-config', configHash: digest('d') },
    ],
    configurations: [
      { id: 'baseline-config', hash: digest('b'), releaseId: 'baseline', stateSchema: 1, maxInteractionDistanceMm: 250 },
      { id: 'candidate-config', hash: digest('d'), releaseId: 'candidate', stateSchema: 2, maxInteractionDistanceMm: 100 },
    ],
    snapshots: [
      { id: 'older', ordinal: 1, stateSchema: 1, configId: 'baseline-config', configHash: digest('b'), hash: digest('e'), state: { untouched: 'old' } },
      { id: 'candidate-state', ordinal: 5, stateSchema: 2, configId: 'candidate-config', configHash: digest('d'), hash: digest('f'), state: { untouched: 'candidate' } },
      { id: 'ready', ordinal: 3, stateSchema: 1, configId: 'baseline-config', configHash: digest('b'), hash: digest('1'), state: { untouched: 'ready' } },
    ],
  };
}

function chosen(evidence, releaseId, snapshotId) {
  const release = evidence.releases.find((item) => item.id === releaseId);
  const saved = evidence.snapshots.find((item) => item.id === snapshotId);
  return { ok: true, releaseId, packageHash: release.packageHash, configId: release.configId,
    configHash: release.configHash, snapshotId, snapshotHash: saved.hash };
}

function fixture(name, edit, outcome, section) {
  const evidence = sample();
  edit(evidence);
  return { name, evidence, expected: typeof outcome === 'string'
    ? chosen(evidence, evidence.targetReleaseId, outcome) : outcome, section };
}

export function cases() {
  return [
    fixture('select the newest compatible baseline tuple', () => {}, 'ready', 'compatible-tuples'),
    fixture('honor a declared candidate target when its tuple is compatible', (e) => { e.targetReleaseId = 'candidate'; }, 'candidate-state', 'declared-target'),
    fixture('array order does not define snapshot age', (e) => { e.snapshots.reverse(); }, 'ready', 'snapshot-order'),
    fixture('equal ordinals use ascending snapshot ID', (e) => {
      e.snapshots.unshift({ ...e.snapshots[2], id: 'a-ready', hash: digest('2') });
    }, 'a-ready', 'snapshot-order'),
    fixture('snapshot ID ties use code-unit order rather than locale collation', (e) => {
      const ready = e.snapshots[2];
      e.snapshots[2] = { ...ready, id: 'a-ready' };
      e.snapshots.unshift({ ...ready, id: 'Z-ready', hash: digest('6') });
    }, 'Z-ready', 'snapshot-order'),
    fixture('refuse an absent declared target', (e) => { e.targetReleaseId = 'missing'; }, { ok: false, reason: 'unknown-target' }, 'declared-target'),
    fixture('refuse a missing target configuration', (e) => { e.configurations.shift(); }, { ok: false, reason: 'configuration-mismatch' }, 'compatible-tuples'),
    fixture('configuration name alone cannot replace its pinned hash', (e) => { e.configurations[0].hash = digest('9'); }, { ok: false, reason: 'configuration-mismatch' }, 'compatible-tuples'),
    fixture('configuration belongs to the target release', (e) => { e.configurations[0].releaseId = 'candidate'; }, { ok: false, reason: 'configuration-mismatch' }, 'compatible-tuples'),
    fixture('configuration schema must match the decoder', (e) => { e.configurations[0].stateSchema = 2; }, { ok: false, reason: 'configuration-mismatch' }, 'compatible-tuples'),
    fixture('no compatible state means refuse, not manufacture a snapshot', (e) => { e.snapshots = [e.snapshots[1]]; }, { ok: false, reason: 'no-compatible-snapshot' }, 'compatible-tuples'),
    fixture('a newer wrong-configuration snapshot is not compatible', (e) => {
      e.snapshots.push({ ...e.snapshots[2], id: 'wrong-config', ordinal: 10, configId: 'candidate-config', hash: digest('3') });
    }, 'ready', 'compatible-tuples'),
    fixture('a newer snapshot with the wrong configuration hash is not compatible', (e) => {
      e.snapshots.push({ ...e.snapshots[2], id: 'wrong-hash', ordinal: 10, configHash: digest('9'), hash: digest('4') });
    }, 'ready', 'compatible-tuples'),
    fixture('a newer state schema cannot be relabeled to fit the old decoder', (e) => {
      e.snapshots.push({ ...e.snapshots[2], id: 'wrong-schema', ordinal: 10, stateSchema: 2, hash: digest('5') });
    }, 'ready', 'state-compatibility'),
    fixture('unknown target wins before missing configuration', (e) => {
      e.targetReleaseId = 'missing'; e.configurations = []; e.snapshots = [];
    }, { ok: false, reason: 'unknown-target' }, 'declared-target'),
    fixture('configuration failure wins before missing snapshots', (e) => {
      e.configurations = []; e.snapshots = [];
    }, { ok: false, reason: 'configuration-mismatch' }, 'compatible-tuples'),
  ];
}

function evidence(value) {
  try { return JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? { type: 'undefined' } : item)); }
  catch { return { type: 'non-JSON result' }; }
}

/** Test immutable inputs, exact identities, refusals and the actual recovery trial. */
export async function assess(candidate) {
  if (typeof candidate?.selectRecovery !== 'function') return { passed: false, criteria: [{ name: 'export selectRecovery(evidence)', passed: false,
    error: { message: 'Export the selection function declared in the contract.', expected: 'function', actual: typeof candidate?.selectRecovery, source: 'LEARNER.md#the-contract' } }] };
  const criteria = [];
  for (const item of cases()) {
    let actual;
    try { actual = await candidate.selectRecovery(freeze(copy(item.evidence))); }
    catch (error) { actual = { threw: String(error?.message ?? error) }; }
    const passed = isDeepStrictEqual(actual, item.expected);
    const criterion = { name: item.name, passed };
    if (!passed) criterion.error = { message: `The selection violates this requirement: ${item.name}.`,
      input: item.evidence, expected: item.expected, actual: evidence(actual), source: `LEARNER.md#${item.section}` };
    criteria.push(criterion);
  }
  const trial = await runTrial(candidate);
  const expected = { status: 'applied', reason: 'pickup', snapshotId: 'baseline-ready', lostScore: 1 };
  const actual = { status: trial.recovered.status, reason: trial.recovered.reason,
    snapshotId: trial.recovered.identity?.snapshotId ?? null, lostScore: trial.dataLoss.lostScore };
  const passed = isDeepStrictEqual(actual, expected);
  const criterion = { name: 'restore the full tuple and rerun the legal action through the owned engine', passed };
  if (!passed) criterion.error = { message: 'Recovery must restore compatible code, configuration and named state, then execute the legal action.',
    expected, actual, source: 'LEARNER.md#run-the-recovery-trial' };
  criteria.push(criterion);
  return { passed: criteria.every((item) => item.passed), criteria, evidence: { trial } };
}
