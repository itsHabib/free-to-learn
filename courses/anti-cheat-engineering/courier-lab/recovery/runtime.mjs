import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createWorld, join, admit, advance, canonical } from '../engine.mjs';
import { capture, restore, RUNTIME_RELEASE } from '../telemetry/runtime.mjs';

export const TRIAL_VERSION = 'courier-recovery-trial-v2';
export const RECOVERY_LIMIT = 'Owned local deterministic trial only. Restoring an older snapshot discards later state and actions, and reopens acknowledged sequence numbers. No recovery epoch or retained sequence floor is implemented. This is not a transactionally safe production rollback or a deployment.';

const copy = (value) => JSON.parse(JSON.stringify(value));
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const hashValue = (value) => createHash('sha256').update(stableJson(value)).digest('hex');

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

async function packages() {
  const paths = ['../engine.mjs', '../admission.mjs', '../defense.mjs', '../telemetry/runtime.mjs', './runtime.mjs'];
  const files = await Promise.all(paths.map(async (path) => [path, createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex')]));
  const sourceHashes = Object.fromEntries(files);
  const make = (id, stateSchema, configId) => ({ id, stateSchema, configId,
    packageHash: hashValue({ id, stateSchema, runtimeRelease: RUNTIME_RELEASE, sourceHashes }), sourceHashes });
  return [make('courier-baseline', 1, 'range-250-v1'), make('courier-candidate', 2, 'range-100-v2')];
}

function configuration(release, range) {
  const body = { id: release.configId, releaseId: release.id, stateSchema: release.stateSchema, maxInteractionDistanceMm: range };
  return { ...body, hash: hashValue(body) };
}

function encodeState(world, stateSchema) {
  const checkpoint = capture(world);
  if (stateSchema === 1) return { schema: 1, checkpoint };
  if (stateSchema === 2) return { schema: 2, payload: { world: checkpoint } };
  throw new Error('Unsupported state schema.');
}

function snapshot(id, ordinal, world, release, config, eventIndex) {
  const state = encodeState(world, release.stateSchema);
  return { id, ordinal, stateSchema: release.stateSchema, configId: config.id, configHash: config.hash,
    hash: hashValue(state), state, eventIndex };
}

function identities(release, config, saved) {
  return { releaseId: release.id, packageHash: release.packageHash, configId: config.id,
    configHash: config.hash, snapshotId: saved.id, snapshotHash: saved.hash, stateSchema: saved.stateSchema };
}

function decode(release, config, saved) {
  // Check state first so a code-only rollback visibly fails on the incompatible state, too.
  if (saved.stateSchema !== release.stateSchema || saved.state.schema !== release.stateSchema) throw new Error('state-schema');
  if (hashValue(saved.state) !== saved.hash) throw new Error('snapshot-hash');
  if (config.id !== release.configId || config.hash !== release.configHash || config.releaseId !== release.id
    || config.stateSchema !== release.stateSchema) throw new Error('configuration-mismatch');
  const { hash, ...body } = config;
  if (hashValue(body) !== hash || saved.configId !== config.id || saved.configHash !== hash) throw new Error('configuration-mismatch');
  const checkpoint = release.stateSchema === 1 ? saved.state.checkpoint : saved.state.payload?.world;
  return restore(checkpoint);
}

function state(world) {
  const observed = canonical(world);
  return { tick: observed.tick, actor: observed.actors[0].actor, lastDecision: observed.actors[0].lastDecision };
}

function move(world, direction) {
  const actor = world.actors[0];
  admit(world, actor.id, { v: 1, seq: actor.lastSeq + 1, move: direction, interact: false });
  advance(world, 1);
}

/** A deliberately narrow configuration gate around the unchanged real game. */
function attempt(world, config, phase, identity, lineage = 'original') {
  const before = state(world);
  const actor = world.actors[0];
  const target = actor.cargo ? { x: 1000, y: 1000 } : world.core;
  const distanceSquared = (actor.x - target.x) ** 2 + (actor.y - target.y) ** 2;
  const configured = distanceSquared <= config.maxInteractionDistanceMm ** 2;
  // The fixed trial action is idle + interact, so the gate and engine see the same position.
  const inputSeq = actor.lastSeq + 1;
  admit(world, actor.id, { v: 1, seq: inputSeq, move: 'idle', interact: configured });
  advance(world, 1);
  const after = state(world);
  const decision = after.lastDecision?.tick === after.tick ? after.lastDecision : null;
  return { phase, lineage, inputSeq, identity, action: { move: 'idle', interact: true, distanceSquared, baselineRadiusMm: 250 },
    status: configured ? decision?.status ?? 'no-decision' : 'denied',
    reason: configured ? decision?.reason ?? 'no-decision' : 'configuration-range',
    before, after, engineDecision: decision };
}

/** Build immutable versioned evidence using actual owned movement, pickup and delivery. */
export async function createTrialEvidence() {
  const releases = await packages();
  const configurations = [configuration(releases[0], 250), configuration(releases[1], 100)];
  for (let index = 0; index < releases.length; index += 1) releases[index].configHash = configurations[index].hash;
  const [baselineRelease, candidateRelease] = releases;
  const [baselineConfig, candidateConfig] = configurations;
  const world = createWorld(0);
  join(world);
  move(world, 'E');
  move(world, 'E');
  const older = snapshot('baseline-before-approach', 1, world, baselineRelease, baselineConfig, world.history.length);
  move(world, 'E');
  const ready = snapshot('baseline-ready', 2, world, baselineRelease, baselineConfig, world.history.length);
  const baseline = attempt(world, baselineConfig, 'baseline', identities(baselineRelease, baselineConfig, ready));
  move(world, 'W');
  move(world, 'W');
  move(world, 'W');
  const delivery = attempt(world, baselineConfig, 'post-snapshot-delivery', identities(baselineRelease, baselineConfig, ready));
  move(world, 'E');
  move(world, 'E');
  move(world, 'E');
  const live = state(world);
  const converted = snapshot('candidate-converted', 3, world, candidateRelease, candidateConfig, world.history.length);
  const candidateWorld = decode(candidateRelease, candidateConfig, converted);
  const candidate = attempt(candidateWorld, candidateConfig, 'candidate', identities(candidateRelease, candidateConfig, converted));
  const incompatible = snapshot('candidate-after-failure', 4, candidateWorld, candidateRelease, candidateConfig,
    world.history.length + candidateWorld.history.length);
  const evidence = { targetReleaseId: baselineRelease.id, releases, configurations, snapshots: [incompatible, older, ready, converted] };
  const codeOnly = { phase: 'code-only', lineage: null, inputSeq: null, identity: identities(baselineRelease, candidateConfig, incompatible),
    status: 'refused', reason: null, stateIncompatible: incompatible.stateSchema !== baselineRelease.stateSchema,
    configurationIncompatible: candidateConfig.hash !== baselineRelease.configHash };
  try { decode(baselineRelease, candidateConfig, incompatible); }
  catch (error) { codeOnly.reason = error.message; }
  return freeze({ evidence, baseline, candidate, codeOnly, live,
    postSnapshotActions: [baseline, delivery].map((observation) => ({ lineage: observation.lineage, inputSeq: observation.inputSeq, tick: observation.after.tick,
      status: observation.status, reason: observation.reason })),
    current: candidate.after, currentEventIndex: incompatible.eventIndex,
    action: { move: 'idle', interact: true, baselineRadiusMm: 250 }, limitations: RECOVERY_LIMIT });
}

function recoveryRefusal(reason, identity) {
  return { phase: 'recovered', lineage: null, inputSeq: null, status: 'refused', reason, ...(identity ? { identity } : {}) };
}

function recover(selection, trial) {
  if (selection?.ok !== true) return recoveryRefusal(selection?.reason ?? 'invalid-selection');
  const { evidence } = trial;
  const release = evidence.releases.find((item) => item.id === selection.releaseId && item.packageHash === selection.packageHash);
  const config = evidence.configurations.find((item) => item.id === selection.configId && item.hash === selection.configHash);
  const saved = evidence.snapshots.find((item) => item.id === selection.snapshotId && item.hash === selection.snapshotHash);
  if (!release || !config || !saved || release.id !== evidence.targetReleaseId) return recoveryRefusal('identity-mismatch');
  try {
    const world = decode(release, config, saved);
    return attempt(world, config, 'recovered', identities(release, config, saved), `restored-from:${saved.id}@tick${world.tick}`);
  } catch (error) {
    return recoveryRefusal(error.message, identities(release, config, saved));
  }
}

/** No files, deployment or existing sessions change. Policy sees frozen detached evidence. */
export async function runTrial(candidatePolicy) {
  if (typeof candidatePolicy?.selectRecovery !== 'function') throw new Error('Export selectRecovery(evidence).');
  const trial = await createTrialEvidence();
  let selection;
  try { selection = await candidatePolicy.selectRecovery(freeze(copy(trial.evidence))); }
  catch (error) { selection = { ok: false, reason: 'policy-error', error: String(error?.message ?? error) }; }
  const recovered = recover(selection, trial);
  const saved = trial.evidence.snapshots.find((item) => item.id === selection?.snapshotId && item.hash === selection?.snapshotHash);
  const restoredTick = recovered.before?.tick;
  const highestBeforeRestore = trial.current.actor.lastSeq;
  const restoredLastSeq = recovered.before?.actor.lastSeq ?? null;
  const reopened = restoredLastSeq !== null && restoredLastSeq < highestBeforeRestore
    ? `${restoredLastSeq + 1}\u2013${highestBeforeRestore}` : null;
  const dataLoss = {
    restored: restoredTick !== undefined, restoredActionApplied: recovered.status === 'applied',
    fromTick: trial.current.tick, restoredTick: restoredTick ?? null,
    discardedTicks: restoredTick === undefined ? null : trial.current.tick - restoredTick,
    discardedRecordedOperations: restoredTick === undefined ? null : trial.currentEventIndex - saved.eventIndex,
    scoreBeforeRecovery: trial.current.actor.score, scoreAtRestoredSnapshot: recovered.before?.actor.score ?? null,
    lostScore: restoredTick === undefined ? null : trial.current.actor.score - recovered.before.actor.score,
    acknowledgedSequences: { highestBeforeRestore, restoredLastSeq, reopened },
    discardedSuccessfulActions: restoredTick === undefined ? [] : trial.postSnapshotActions.filter((item) => item.status === 'applied' && item.tick > restoredTick),
    note: 'Lost actions belong to the original lineage; the restored pickup belongs to a new branch. Restoring the checkpoint does not compensate deliveries, merge later history or prevent reuse of acknowledged sequence numbers.',
  };
  return { schema: TRIAL_VERSION, baseline: trial.baseline, candidate: trial.candidate, codeOnly: trial.codeOnly,
    recovered, selection, identities: copy(trial.evidence), dataLoss, limitations: RECOVERY_LIMIT };
}
