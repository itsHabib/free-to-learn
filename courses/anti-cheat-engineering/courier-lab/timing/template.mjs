/** Input is a validated bounded timing record; return predicted checkpoints. */
export function predictTiming(record) {
  // TODO: track the owner clock, per-connection actor state and input receipts.
  // Do not use client sentAtMs to grant movement or extend its active window.
  return { ok: true, checkpoints: [] };
}
