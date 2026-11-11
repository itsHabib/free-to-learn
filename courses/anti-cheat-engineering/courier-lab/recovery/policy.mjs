/** Select identities only. Never rewrite state to make a snapshot appear compatible. */
export function selectRecovery(evidence) {
  const release = evidence.releases.find((item) => item.id === evidence.targetReleaseId);
  if (!release) return { ok: false, reason: 'unknown-target' };
  const config = evidence.configurations.find((item) => item.id === release.configId);
  if (!config || config.hash !== release.configHash || config.releaseId !== release.id
    || config.stateSchema !== release.stateSchema) return { ok: false, reason: 'configuration-mismatch' };
  const snapshots = evidence.snapshots.filter((item) => item.stateSchema === release.stateSchema
    && item.configId === config.id && item.configHash === config.hash);
  snapshots.sort((left, right) => right.ordinal - left.ordinal || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const snapshot = snapshots[0];
  if (!snapshot) return { ok: false, reason: 'no-compatible-snapshot' };
  return { ok: true, releaseId: release.id, packageHash: release.packageHash,
    configId: config.id, configHash: config.hash, snapshotId: snapshot.id, snapshotHash: snapshot.hash };
}
