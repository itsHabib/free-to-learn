export const TICK_MS = 50;
export const MAX_CATCH_UP_TICKS = 5;

function checkTime(time) {
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
    throw new TypeError('Clock time must be a finite, non-negative number.');
  }
}

/** Convert monotonic millisecond readings into bounded simulation work. */
export function createClock(startTime = 0) {
  checkTime(startTime);
  let previousTime = startTime;
  let remainder = 0;
  let overruns = 0;

  return {
    sample(now) {
      checkTime(now);
      if (now < previousTime) throw new RangeError('Clock time cannot go backwards.');

      const elapsed = now - previousTime + remainder;
      const due = Math.floor(elapsed / TICK_MS);
      if (!Number.isSafeInteger(due)) throw new RangeError('Clock interval is too large.');

      const ticks = Math.min(due, MAX_CATCH_UP_TICKS);
      const dropped = due - ticks;
      previousTime = now;
      remainder = elapsed - due * TICK_MS;
      if (dropped > 0) overruns += 1;
      return { ticks, dropped, overruns, remainder };
    },
  };
}
