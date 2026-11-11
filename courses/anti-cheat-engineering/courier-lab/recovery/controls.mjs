import { selectRecovery } from './policy.mjs';
const copy = (value) => JSON.parse(JSON.stringify(value));

/** Independently select by scanning and retaining the best compatible identity. */
export function selectByScan(evidence) {
  let target;
  for (const release of evidence.releases) if (release.id === evidence.targetReleaseId) target = release;
  if (!target) return { ok: false, reason: 'unknown-target' };
  const settings = evidence.configurations.find((config) => config.id === target.configId);
  if (!settings || settings.hash !== target.configHash || settings.stateSchema !== target.stateSchema
    || settings.releaseId !== target.id) return { ok: false, reason: 'configuration-mismatch' };
  let best;
  for (const saved of evidence.snapshots) {
    if (saved.configId !== settings.id || saved.configHash !== settings.hash || saved.stateSchema !== target.stateSchema) continue;
    if (!best || saved.ordinal > best.ordinal || (saved.ordinal === best.ordinal && saved.id < best.id)) best = saved;
  }
  if (!best) return { ok: false, reason: 'no-compatible-snapshot' };
  return { ok: true, releaseId: target.id, packageHash: target.packageHash, configId: settings.id,
    configHash: settings.hash, snapshotId: best.id, snapshotHash: best.hash };
}

export const correctPolicies = { 'filter-and-sort': { selectRecovery }, 'single-scan': { selectRecovery: selectByScan } };

function overrideSnapshot(evidence, choose) {
  const result = selectRecovery(evidence);
  if (!result.ok) return result;
  const saved = choose(evidence, result);
  return saved ? { ...result, snapshotId: saved.id, snapshotHash: saved.hash } : result;
}

function rewrite(evidence, edit) {
  const changed = copy(evidence);
  edit(changed);
  return selectRecovery(changed);
}

export const wrongPolicies = {
  'code-only': { selectRecovery(evidence) {
    const result = selectRecovery(evidence);
    if (!result.ok) return result;
    const candidate = evidence.releases.at(-1);
    const saved = [...evidence.snapshots].sort((a, b) => b.ordinal - a.ordinal)[0];
    return { ...result, configId: candidate.configId, configHash: candidate.configHash, snapshotId: saved.id, snapshotHash: saved.hash };
  } },
  'newest-without-compatibility': { selectRecovery: (evidence) => overrideSnapshot(evidence,
    (e) => [...e.snapshots].sort((a, b) => b.ordinal - a.ordinal)[0]) },
  'oldest-compatible': { selectRecovery: (evidence) => overrideSnapshot(evidence,
    (e, result) => e.snapshots.filter((saved) => saved.configId === result.configId && saved.configHash === result.configHash
      && saved.stateSchema === e.releases.find((release) => release.id === result.releaseId).stateSchema).sort((a, b) => a.ordinal - b.ordinal)[0]) },
  'ignore-declared-target': { selectRecovery: (evidence) => selectRecovery({ ...evidence, targetReleaseId: evidence.releases.at(-1).id }) },
  'ignore-config-hash': { selectRecovery: (evidence) => rewrite(evidence, (e) => {
    const release = e.releases.find((item) => item.id === e.targetReleaseId);
    if (!release) return;
    e.snapshots.forEach((saved) => { if (saved.configId === release.configId) saved.configHash = release.configHash; });
  }) },
  'ignore-state-schema': { selectRecovery: (evidence) => rewrite(evidence, (e) => {
    const release = e.releases.find((item) => item.id === e.targetReleaseId);
    if (!release) return;
    e.snapshots.forEach((saved) => { if (saved.configId === release.configId) saved.stateSchema = release.stateSchema; });
  }) },
  'invent-missing-configuration': { selectRecovery: (evidence) => rewrite(evidence, (e) => {
    const release = e.releases.find((item) => item.id === e.targetReleaseId);
    if (release && !e.configurations.some((item) => item.id === release.configId)) e.configurations.push({
      id: release.configId, hash: release.configHash, releaseId: release.id, stateSchema: release.stateSchema,
    });
  }) },
  'fall-back-from-unknown-target': { selectRecovery: (evidence) => selectRecovery({ ...evidence,
    targetReleaseId: evidence.releases.some((item) => item.id === evidence.targetReleaseId) ? evidence.targetReleaseId : evidence.releases[0].id }) },
  'rewrite-original-state': { selectRecovery(evidence) {
    evidence.snapshots.sort((a, b) => b.ordinal - a.ordinal);
    evidence.snapshots[0].stateSchema = evidence.releases[0].stateSchema;
    return selectRecovery(evidence);
  } },
  'last-array-entry-on-tie': { selectRecovery: (evidence) => overrideSnapshot(evidence, (e, result) => {
    const selected = e.snapshots.find((item) => item.id === result.snapshotId);
    return e.snapshots.findLast((item) => item.ordinal === selected.ordinal && item.configId === result.configId);
  }) },
  'locale-collation-on-tie': { selectRecovery: (evidence) => overrideSnapshot(evidence, (e, result) => {
    const release = e.releases.find((item) => item.id === result.releaseId);
    return e.snapshots.filter((item) => item.stateSchema === release.stateSchema
      && item.configId === result.configId && item.configHash === result.configHash)
      .sort((left, right) => right.ordinal - left.ordinal || left.id.localeCompare(right.id))[0];
  }) },
};
