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
  throw new Error('not written yet: moverOf in race.mjs');
}
// endregion: mover-of
// Where the flag will be for the next `frames` frames: copy memory, run the mover
// a frame at a time, and decode the flag after each. path[0] is now. An entry is
// null from the first frame the mover can't work out.
// region: flag-path
function call(name, args) {
  throw new Error('not written yet: call in race.mjs');
}

export function flagPath(bytes, mover, flag, frames) {
  throw new Error('not written yet: flagPath in race.mjs');
}
// endregion: flag-path

// The longest surprise, in frames, that your sweep showed still hits 9 of 10:
// the largest unplanned delay that did, less the 1 frame the plan counts. Set it
// from your own sweep in module 07 (node lab.mjs sweep ./work).
export const FRAME_BUDGET = 1;
// Is the flag's path right? look() reads the state now; pathNow(frames) predicts
// from memory as it is. Predict, let the game run, and compare frame by frame.
// region: judge-round
function judgeRound(host, look, pathNow, frames, r) {
  throw new Error('not written yet: judgeRound in race.mjs');
}
// endregion: judge-round
// region: judge-motion
export function judgeMotion(host, look, pathNow, opts = {}) {
  throw new Error('not written yet: judgeMotion in race.mjs');
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
  throw new Error('not written yet: lead in race.mjs');
}
// endregion: lead
// Fire only a plan that lands within 2 paces of where the flag will be.
// region: ready
export function ready(plan) {
  throw new Error('not written yet: ready in race.mjs');
}
// endregion: ready
