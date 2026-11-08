/**
 * Replay one complete, ordered window through the supplied engine facade.
 * Return { ok: true, state } or { ok: false, reason }.
 * The contract and failure reasons are in LEARNER.md.
 */
export function replayWindow(record, engine) {
  // TODO: validate schema/release, completeness and absolute event ordering.
  // TODO: restore the checkpoint and apply every event in its supplied order.
  // TODO: compare the canonical result with final before reporting success.
  return { ok: false, reason: 'incomplete' };
}
