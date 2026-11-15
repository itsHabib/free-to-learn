// Module 3: fire test shots, fit an aim to them, judge the fit on shots it never
// saw, and search for the setting that lands where the flag will be.
// Every function throws "not written yet" until you write it. API.md has the details.
import * as S from './scan.mjs';

export const LIMITS = { angle_min: 5, angle_max: 85, power_min: 10, power_max: 100 };
// Fires one shot. A shot that misses leads code to the landing slot in memory
// (the flag plus or minus the miss in the message); once one slot is left, the
// landing is read straight from it and kept in found.landing. Until then a
// miss is placed from the message, to within half a pace, and a hit can only
// be placed "within 12 paces of the flag": its impact_x is the flag's position.
// So make sure the slot is known before a shot that matters can hit.
export function testShot(host, found, controls, angle, power) {
  throw new Error('not written yet: testShot in learn.mjs');
}
// ---------- a fit by least squares ----------

// Five numbers for a shot, from the range of a shell fired in a vacuum: landing
// x = c0 + c1 cos(a) + c2 p² sin(2a) + c3 wind (p sin a)² + c4 p cos(a).
export function features(angle, power, wind) {
  throw new Error('not written yet: features in learn.mjs');
}
// Solve A c = b in the least-squares sense: the normal equations (AᵀA) c = Aᵀb,
// by Gaussian elimination with the largest pivot in each column. null if singular.
export function leastSquares(A, b) {
  throw new Error('not written yet: leastSquares in learn.mjs');
}
// Fit the coefficients to shots: [{ angle, power, wind, impact_x }].
export function fitShots(shots) {
  throw new Error('not written yet: fitShots in learn.mjs');
}
export function predictFit(coef, angle, power, wind) {
  throw new Error('not written yet: predictFit in learn.mjs');
}

export const ACCEPT_WITHIN = 12;
// Accept a fit only if it predicts the shots it was fitted to and the shots held
// back from it, each within `within` paces. Returns { verdict, fitWorst, heldWorst }.
export function judgeFit(coef, { fitOn, heldOut }, within = ACCEPT_WITHIN) {
  throw new Error('not written yet: judgeFit in learn.mjs');
}
// The crude aim with no fit at all: fire again whichever practice shot landed
// closest to where the flag is now. It ignores the wind.
export function nearest(shots, state) {
  throw new Error('not written yet: nearest in learn.mjs');
}
// ---------- searching for a setting ----------

// The whole-number setting that lands where the flag will be. predict(angle,
// power) gives { x, frames } (frames null if the predictor can't say); at(frames)
// gives where the flag will be when a shot of that flight time lands, or null.
// Angles are tried in `order` ('middle': 45 first, then outwards; 'low': 5
// upwards). For each angle, powers every 10, then each gap where the landing
// passes the flag is halved down to neighbouring whole powers. The search stops at
// the first setting within `enough` paces. Returns { angle, power, x, frames, miss } or null.
export function search(predict, at, { enough = 0.5, order = 'middle' } = {}) {
  throw new Error('not written yet: search in learn.mjs');
}
