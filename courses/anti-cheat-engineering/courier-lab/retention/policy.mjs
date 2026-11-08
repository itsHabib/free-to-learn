/** Retain the newest eligible denial events; inputs have already been validated. */
export function retain(events, { nowTick, maxAgeTicks, maxEvents }) {
  return events
    .filter(({ tick }) => tick > nowTick - maxAgeTicks && tick <= nowTick)
    .slice(-maxEvents)
    .map(({ tick, actorId, reason, distanceSquared }) => ({ tick, actorId, reason, distanceSquared }));
}
