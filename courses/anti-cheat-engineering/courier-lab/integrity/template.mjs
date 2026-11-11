/** Pure policy. Read LEARNER.md for input shapes, decisions and refusal reasons. */
export function checkPackage({ manifest, observed, supported } = {}) {
  // TODO: validate the reference before trusting its paths or release.
  // TODO: compare complete inventories before comparing each file's SHA-256.
  // Keep this function independent of the filesystem and do not mutate its inputs.
  return { ok: false, reason: 'schema' };
}
