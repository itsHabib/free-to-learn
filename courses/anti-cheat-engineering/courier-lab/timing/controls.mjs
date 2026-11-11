import { predictTiming, predictWithDefect } from './policy.mjs';

/** Independent interval calculation: count eligible ticks instead of stepping. */
export function predictByIntervals(record) {
  const rows = [];
  const actors = [];
  let tick = 0;
  let previous = record.startMs;
  let carry = 0;
  let overrunCount = 0;
  for (const event of record.actions) {
    let result = null;
    let elapsedClock = null;
    const found = actors.findIndex((actor) => actor.connection === event.id);
    if (event.type === 'join') actors.push({ id: `actor-${actors.length + 1}`, connection: event.id, connected: true, lastSeq: 0, expiresAt: 0, x: 1000, delta: 0 });
    if (event.type === 'disconnect' || event.type === 'resume') actors[found].connected = event.type === 'resume';
    if (event.type === 'input') {
      const current = actors[found];
      const status = !current.connected ? 'offline' : event.seq > current.lastSeq ? 'admitted' : 'stale';
      result = { status, tick, seq: event.seq };
      if (status === 'admitted') actors[found] = { ...current, lastSeq: event.seq, expiresAt: tick + 4, delta: { E: 250, W: -250, idle: 0 }[event.move] };
    }
    if (event.type === 'sample') {
      const milliseconds = event.nowMs - previous + carry;
      const quota = Math.trunc(milliseconds / 50);
      const processed = Math.min(5, quota);
      carry = milliseconds % 50;
      previous = event.nowMs;
      if (quota > processed) overrunCount += 1;
      elapsedClock = { ticks: processed, dropped: quota - processed, overruns: overrunCount, remainder: carry };
      for (const current of actors) {
        const eligible = Math.max(0, Math.min(tick + processed, current.expiresAt) - tick);
        current.x += eligible * current.delta;
      }
      tick += processed;
    }
    rows.push({ label: event.label, tick, actors: actors.map(({ delta, ...actor }) => ({ ...actor })), receipt: result, clock: elapsedClock });
  }
  return { ok: true, checkpoints: rows };
}

export const correctPolicies = {
  'tick-by-tick': { predictTiming },
  'interval-intersection': { predictTiming: predictByIntervals },
};

export const wrongPolicies = Object.fromEntries([
  'client-time-authority', 'duplicate-renews', 'stale-replaces-intent',
  'expire-early', 'expire-late', 'unbounded-catch-up', 'discard-fraction',
  'disconnect-clears-intent', 'resume-resets-state', 'rejoin-reuses-actor',
  'movement-at-receipt',
].map((defect) => [defect, { predictTiming: (record) => predictWithDefect(record, defect) }]));
