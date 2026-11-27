// Module 7: hit a flag that moves while the shell is in the air.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 07 fills the regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
import { slice, overlay, apply, evaluate, placeKey } from './lift.mjs';
import { windBand } from './reader.mjs';
import { search } from './learn.mjs';

// The flag's motion: the frame function's stores that decide the flag's place.
// region: mover-of
export function moverOf(tickFn, flagRaw) {
  return slice(tickFn.stores, [placeKey(flagRaw.addr, flagRaw.offset)]);
}
// endregion: mover-of
// Where the flag will be for the next `frames` frames: copy memory, run the mover
// a frame at a time, and decode the flag after each. path[0] is now. An entry is
// null from the first frame the mover can't work out.
// region: flag-path
// The page's sin and cos, as the simulator answers them; null for any
// other import.
function call(name, args) {
  if (name.endsWith('.sin')) return Math.sin(args[0]);
  if (name.endsWith('.cos')) return Math.cos(args[0]);
  return null;
}

export function flagPath(bytes, mover, flag, frames) {
  const m = overlay(bytes); // writes stay in the copy
  const env = () => ({ load: m.load, call, memo: new Map() });
  const at = () => evaluate(flag, env());
  const path = [at()];
  for (let k = 1; k <= frames; k++) {
    // Once the flag can't be worked out, nothing after it can be.
    if (path[k - 1] === null) {
      path.push(null);
      continue;
    }
    apply(mover, m, { call });
    path.push(at());
  }
  return path;
}
// endregion: flag-path

// The longest surprise, in frames, that your sweep showed still hits 9 of 10:
// the largest unplanned delay that did, less the 1 frame the plan counts. Set it
// from your own sweep in module 07 (node lab.mjs sweep ./work).
export const FRAME_BUDGET = 1;
// Is the flag's path right? look() reads the state now; pathNow(frames) predicts
// from memory as it is. Predict, let the game run, and compare frame by frame.
// region: judge-round
// One round of the judge: { predicted, problem }. predicted counts the
// frames after the first that matched; a null entry ends the round.
function judgeRound(host, look, pathNow, frames, r) {
  let path;
  try {
    path = pathNow(frames);
  } catch (error) {
    const why = String(error?.message ?? error);
    const problem = `round ${r}: the path failed: ${why}`;
    return { predicted: 0, problem };
  }
  if (!Array.isArray(path) || path.length !== frames + 1) {
    const got = Array.isArray(path) ? path.length : typeof path;
    const want = `must have ${frames + 1} entries, got ${got}`;
    const problem = `round ${r}: a path for ${frames} frames ${want}`;
    return { predicted: 0, problem };
  }
  let predicted = 0;
  for (let k = 0; k <= frames; k++) {
    if (k > 0) host.tick(1);
    if (path[k] === null) break;
    const x = look().target_x;
    if (!(Math.abs(path[k] - x) <= 0.05)) {
      const said = `${Number(path[k]).toFixed(2)} after ${k} frames`;
      const was = `it was at ${x.toFixed(2)}`;
      const would = 'the path said the flag would be at';
      const problem = `round ${r}: ${would} ${said}; ${was}`;
      return { predicted, problem };
    }
    if (k > 0) predicted++;
  }
  return { predicted };
}
// endregion: judge-round
// region: judge-motion
export function judgeMotion(host, look, pathNow, opts = {}) {
  const { newRound = 'KeyN', rounds = 3, frames = 300 } = opts;
  const problems = [];
  let predicted = 0;
  for (let r = 1; r <= rounds && !problems.length; r++) {
    host.press(newRound);
    host.tick(2 + 7 * r); // each round caught at another moment
    const round = judgeRound(host, look, pathNow, frames, r);
    predicted += round.predicted;
    if (round.problem) problems.push(round.problem);
  }
  if (!problems.length && predicted < 20) {
    const few = `the path predicted only ${predicted} frames`;
    const late = 'it gives null too early to plan a shot';
    problems.push(`${few} over ${rounds} rounds; ${late}`);
  }
  return { ok: problems.length === 0, problems, predicted };
}
// endregion: judge-motion
// The shot to fire now so the shell lands where the flag will be. predict(angle,
// power, wind) gives { x, frames }; path[k] is where the flag will be after k
// frames (null where that can't be known); delay is how many frames pass before
// the shot leaves. With only the wind arrows, plan for the middle of the band and
// take the first setting, lowest angle first, that lands within 2 paces: the
// shortest flights give the unknown part of the wind the least time to push.
// region: lead
export function lead(state, predict, path, delay = 1) {
  const exact = typeof state.wind === 'number';
  const band = exact ? [state.wind, state.wind] : null;
  const [lo, hi] = band ?? windBand(state.wind_arrows ?? 0);
  const wind = (lo + hi) / 2;
  // A shot that flies `frames` frames leaves `delay` frames from now,
  // so it lands where the flag is delay + frames frames from now.
  const at = (frames) =>
    frames === null ? null : (path[delay + frames] ?? null);
  const opts = exact
    ? { enough: 0.5, order: 'middle' }
    : { enough: 2, order: 'low' };
  const shot = (angle, power) => predict(angle, power, wind);
  return search(shot, at, opts);
}
// endregion: lead
// Fire only a plan that lands within 2 paces of where the flag will be.
// region: ready
export function ready(plan) {
  return plan !== null && plan !== undefined && plan.miss <= 2;
}
// endregion: ready
