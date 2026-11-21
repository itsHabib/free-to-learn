// Unit 15 end checkpoint: courier/rewind.mjs with every walked-through region filled.
// examples/start-unit15.mjs copies it into a project as courier/rewind.mjs. It imports
// nothing, so it works from either folder. The two numbers below are public/courier.mjs's
// TICK_MS and RTT_SAMPLES.

const TICK_MS = 50;
const RTT_SAMPLES = 20;

// region: position-at
export function positionAt(history, tick) {
  if (!Number.isInteger(tick) || tick < 0) return null;
  const slot = history.slots[tick % history.size];
  return slot && slot.tick === tick ? { x: slot.x, y: slot.y } : null;
}
// endregion: position-at

// region: measure-rtt
export function measureRtt(samples) {
  const recent = samples.slice(-RTT_SAMPLES);
  return recent.length ? Math.max(...recent) / TICK_MS : 0;
}
// endregion: measure-rtt

// region: judge-interact
export function judgeInteract(args) {
  const { seen, now, window, rtt, history, target, range, readyAt } = args;
  const read = args.positionAt ?? positionAt;
  if (seen > now) return { accept: false, at: now, reason: 'future' };
  if (now < readyAt) return { accept: false, at: now, reason: 'cooldown' };
  const allowed = Math.min(window, Math.ceil(rtt) + 1);
  let at = Math.max(seen, now - allowed);
  let spot = read(history, at);
  if (!spot) {
    at = now;
    spot = read(history, now);
  }
  if (!spot) return { accept: false, at, reason: 'range' };
  const dx = spot.x - target.x;
  const dy = spot.y - target.y;
  const inRange = dx * dx + dy * dy <= range * range;
  return { accept: inRange, at, reason: inRange ? 'ok' : 'range' };
}
// endregion: judge-interact

// region: tally
export function tally(outcomes) {
  const row = {
    honest: 0,
    legit: 0,
    legitRate: 0,
    naive: 0,
    naiveCheats: 0,
    slow: 0,
    slowCheats: 0,
  };
  for (const o of outcomes) {
    const cheat = o.accepted && !o.inRangeNow;
    if (o.who === 'honest') {
      row.honest += 1;
      if (!o.accepted && o.inRangeAtSeen) row.legit += 1;
    } else if (o.who === 'naiveFaker') {
      row.naive += 1;
      if (cheat) row.naiveCheats += 1;
    } else if (o.who === 'slowPongFaker') {
      row.slow += 1;
      if (cheat) row.slowCheats += 1;
    }
  }
  row.legitRate = row.honest ? row.legit / row.honest : 0;
  return row;
}
// endregion: tally

// region: pick-window
export function pickWindow(rows, budget) {
  let best = null;
  for (const row of rows) {
    if (row.legitRate > budget) continue;
    const fewer = !best || row.slowCheats < best.slowCheats;
    const tie = best && row.slowCheats === best.slowCheats;
    if (fewer || (tie && row.window < best.window)) best = row;
  }
  return best ? best.window : null;
}
// endregion: pick-window
