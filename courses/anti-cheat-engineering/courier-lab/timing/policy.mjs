/** Pure prediction for validated, unobstructed owner-clock investigations. */
export function predictTiming(record) {
  return predictWithDefect(record);
}

function moveActors(actors, initialTick, ticks, defect) {
  for (let count = 1; count <= ticks; count += 1) {
    for (const actor of actors) {
      const end = actor.expiresAt + (defect === 'expire-early' ? -1 : defect === 'expire-late' ? 1 : 0);
      if (initialTick + count > end) continue;
      actor.x += actor.move === 'E' ? 250 : actor.move === 'W' ? -250 : 0;
    }
  }
}

/** Author calibration entry point; learner preparation copies template.mjs only. */
export function predictWithDefect(record, defect = '') {
  let now = record.startMs;
  let remainder = 0;
  let tick = 0;
  let overruns = 0;
  const actors = [];
  const checkpoints = [];
  for (const action of record.actions) {
    let receipt = null;
    let clock = null;
    const actor = actors.find((item) => item.connection === action.id);
    if (action.type === 'join') {
      if (defect === 'rejoin-reuses-actor' && actors.length) {
        actors[0].connection = action.id;
        actors[0].connected = true;
      } else actors.push({ id: `actor-${actors.length + 1}`, connection: action.id, connected: true, lastSeq: 0, expiresAt: 0, x: 1000, move: 'idle' });
    }
    if (action.type === 'disconnect') {
      actor.connected = false;
      if (defect === 'disconnect-clears-intent') actor.move = 'idle';
    }
    if (action.type === 'resume') {
      actor.connected = true;
      if (defect === 'resume-resets-state') Object.assign(actor, { lastSeq: 0, expiresAt: 0, x: 1000, move: 'idle' });
    }
    if (action.type === 'input') {
      const newer = action.seq > actor.lastSeq || defect === 'stale-replaces-intent' || defect === 'duplicate-renews' && action.seq === actor.lastSeq;
      const status = !actor.connected ? 'offline' : newer ? 'admitted' : 'stale';
      receipt = { status, tick, seq: action.seq };
      if (status === 'admitted') {
        const receivedAt = defect === 'client-time-authority' ? Math.floor((action.sentAtMs ?? now) / 50) : tick;
        Object.assign(actor, { lastSeq: action.seq, expiresAt: receivedAt + 4, move: action.move });
        if (defect === 'movement-at-receipt') actor.x += action.move === 'E' ? 250 : action.move === 'W' ? -250 : 0;
      }
    }
    if (action.type === 'sample') {
      const elapsed = action.nowMs - now + remainder;
      const due = Math.floor(elapsed / 50);
      const ticks = defect === 'unbounded-catch-up' ? due : Math.min(due, 5);
      const dropped = due - ticks;
      remainder = defect === 'discard-fraction' ? 0 : elapsed - due * 50;
      now = action.nowMs;
      if (dropped > 0) overruns += 1;
      clock = { ticks, dropped, overruns, remainder };
      moveActors(actors, tick, ticks, defect);
      tick += ticks;
    }
    checkpoints.push({
      label: action.label, tick,
      actors: actors.map(({ move, ...item }) => ({ ...item })), receipt, clock,
    });
  }
  return { ok: true, checkpoints };
}
