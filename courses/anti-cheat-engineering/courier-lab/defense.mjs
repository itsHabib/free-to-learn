const WINDOW_TICKS = 20;
const MAX_OBSERVATIONS = 128;
const MAX_FINDINGS = 128;
const RANGE_SQUARED = 62_500;
const DISTANT_SQUARED = 250_000;

/** Teaching policy: an interaction needs elapsed cooldown and server-known proximity. */
export function interactionDenial(actor, target, tick, { omitProximity = false } = {}) {
  if (tick < actor.nextInteractTick) return 'cooldown';
  const distanceSquared = (actor.x - target.x) ** 2 + (actor.y - target.y) ** 2;
  // LAB_PROXIMITY_GUARD
  if (distanceSquared > RANGE_SQUARED && !omitProximity) return 'range';
  return null;
}

export function createDetector() {
  return {
    buckets: Array.from({ length: WINDOW_TICKS }, () => ({ tick: -1, observations: [] })),
    findings: [],
  };
}

/** Retire observations even when no interaction takes place during a tick. */
export function expireObservations(detector, tick) {
  for (const bucket of detector.buckets) {
    if (bucket.tick > tick - WINDOW_TICKS) continue;
    bucket.tick = -1;
    bucket.observations.length = 0;
  }
}

/** Advisory only: three range denials farther than 500 mm within 20 ticks. */
export function observeDenial(detector, tick, reason, distanceSquared) {
  if (reason !== 'range' || !(distanceSquared > DISTANT_SQUARED)) return;
  expireObservations(detector, tick);
  const bucket = detector.buckets[tick % WINDOW_TICKS];
  if (bucket.tick !== tick) {
    bucket.tick = tick;
    bucket.observations.length = 0;
  }
  // The engine consumes at most one interaction per actor per tick. Keep the
  // detector bounded even if this helper is called repeatedly by an owner test.
  if (bucket.observations.length > 0) return;
  bucket.observations.push({ tick, reason });
  const count = detector.buckets.reduce((total, item) => total + item.observations.length, 0);
  if (count > MAX_OBSERVATIONS) throw new Error('detector observation bound exceeded');
  if (count < 3 || detector.findings.at(-1)?.tick === tick) return;
  detector.findings.push({ kind: 'repeated-invalid-action', tick });
  if (detector.findings.length > MAX_FINDINGS) detector.findings.shift();
}
