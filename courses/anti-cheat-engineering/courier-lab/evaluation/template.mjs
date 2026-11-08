/** Inputs are validated and sorted. Return an advisory Boolean, never a ban. */
export function classify(signals, settings) {
  // TODO: count only range denials farther than minDistanceMm.
  // TODO: test every interval (latest-windowTicks, latest], with a strict left edge.
  return false;
}

/** Return {decisions,metrics}; preserve case order and count each case once. */
export function evaluate(cases, settings) {
  // TODO: predict using only signals and settings, then score against labels.
  // TODO: return null for a rate whose denominator is zero.
  return { decisions: [], metrics: {} };
}
