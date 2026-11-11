/** Return a compatible release/configuration/snapshot identity tuple or a refusal. */
export function selectRecovery(evidence) {
  // TODO: find the declared target and its exact versioned configuration.
  // TODO: choose the newest compatible snapshot; break equal ordinals by ascending ID.
  // TODO: return only the required identity fields, without changing the evidence.
  return { ok: false, reason: 'no-compatible-snapshot' };
}
