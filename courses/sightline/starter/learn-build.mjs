// Module 3: fire test shots, fit an aim to them, judge the fit on shots it never
// saw, and search for the setting that lands where the flag will be.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 03 fills the regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
import * as S from './scan.mjs';

// region: given-learn
// The whole-number settings the controls allow.
export const LIMITS = {
  angle_min: 5,
  angle_max: 85,
  power_min: 10,
  power_max: 100,
};
// A fit may miss a shot it was judged on by at most this many paces.
export const ACCEPT_WITHIN = 12;
// endregion: given-learn

// region: set-aim
function read(host, addr, type) {
  throw new Error('not written yet: read in learn.mjs');
}

function setValue(host, slot, up, down, want) {
  throw new Error('not written yet: setValue in learn.mjs');
}

function setAim(host, found, controls, angle, power) {
  throw new Error('not written yet: setAim in learn.mjs');
}
// endregion: set-aim

// region: wait-for-message
function waitForMessage(host, message) {
  throw new Error('not written yet: waitForMessage in learn.mjs');
}
// endregion: wait-for-message

// region: narrow-landing
function narrowLanding(host, found, landed) {
  throw new Error('not written yet: narrowLanding in learn.mjs');
}
// endregion: narrow-landing

// region: test-shot
export function testShot(host, found, controls, angle, power) {
  throw new Error('not written yet: testShot in learn.mjs');
}
// endregion: test-shot

// ---------- a fit by least squares ----------

// region: features
export function features(angle, power, wind) {
  throw new Error('not written yet: features in learn.mjs');
}
// endregion: features

// region: normal-equations
function normalEquations(A, b) {
  throw new Error('not written yet: normalEquations in learn.mjs');
}
// endregion: normal-equations

// region: least-squares
export function leastSquares(A, b) {
  throw new Error('not written yet: leastSquares in learn.mjs');
}
// endregion: least-squares

// region: fit-shots
export function fitShots(shots) {
  throw new Error('not written yet: fitShots in learn.mjs');
}

export function predictFit(coef, angle, power, wind) {
  throw new Error('not written yet: predictFit in learn.mjs');
}
// endregion: fit-shots

// region: judge-fit
export function judgeFit(coef, sets, within = ACCEPT_WITHIN) {
  throw new Error('not written yet: judgeFit in learn.mjs');
}
// endregion: judge-fit

// region: nearest
export function nearest(shots, state) {
  throw new Error('not written yet: nearest in learn.mjs');
}
// endregion: nearest

// ---------- searching for a setting ----------

// region: search-order
function anglesIn(order) {
  throw new Error('not written yet: anglesIn in learn.mjs');
}
// endregion: search-order

// region: setting
function setting(predict, at, angle, power) {
  throw new Error('not written yet: setting in learn.mjs');
}
// endregion: setting

// region: settings-at
function settingsAt(predict, at, angle) {
  throw new Error('not written yet: settingsAt in learn.mjs');
}
// endregion: settings-at

// region: search
export function search(predict, at, options = {}) {
  throw new Error('not written yet: search in learn.mjs');
}
// endregion: search
