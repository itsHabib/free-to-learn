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
// The number at addr, read as 'f32' or 'i32', from the live memory.
function read(host, addr, type) {
  const m = host.memory();
  const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
  if (type === 'f32') return view.getFloat32(addr, true);
  return view.getInt32(addr, true);
}

// Press one value's keys until its slot, rounded, reads want.
function setValue(host, slot, up, down, want) {
  for (let presses = 0; presses < 200; presses++) {
    const now = read(host, slot.addr, slot.type);
    if (Math.round(now) === want) return;
    host.press(now < want ? up : down);
  }
}

function setAim(host, found, controls, angle, power) {
  const c = controls;
  setValue(host, found.angle, c.angle_up, c.angle_down, angle);
  setValue(host, found.power, c.power_up, c.power_down, power);
}
// endregion: set-aim

// region: wait-for-message
// Tick one frame at a time until the message slot holds text.
function waitForMessage(host, message) {
  let text = '';
  let frames = 0;
  while (frames < 1500 && !text) {
    host.tick(1);
    frames++;
    text = S.readCString(host.memory(), message);
  }
  if (!text) throw new Error('the shot never landed');
  return { text, frames };
}
// endregion: wait-for-message

// region: narrow-landing
// After a miss: the floats within 0.6 of where the message puts the
// landing, kept only if an earlier miss had them too. One slot left is
// the landing slot. None left keeps the earlier list as it was.
function narrowLanding(host, found, landed) {
  let near = Array.from(S.scanNear(host.memory(), landed, 0.6));
  const earlier = found.landingCandidates;
  if (earlier) near = near.filter((slot) => earlier.includes(slot));
  if (near.length === 1) {
    found.landing = { addr: near[0] * 4, type: 'f32' };
    delete found.landingCandidates;
  } else if (near.length) found.landingCandidates = near;
}
// endregion: narrow-landing

// region: test-shot
export function testShot(host, found, controls, angle, power) {
  setAim(host, found, controls, angle, power);
  const target_x = read(host, found.flag.addr, 'f32');
  const wind = read(host, found.wind.addr, 'f32');
  host.press(controls.fire);
  const { text, frames } = waitForMessage(host, found.message);
  const shot = (impact_x) => {
    return { angle, power, wind, target_x, impact_x, frames };
  };
  if (!found.landing) {
    const miss = text.match(/(SHORT|LONG) BY (\d+)/);
    // HIT! says only "within 12 paces": the flag is the best guess.
    if (!miss) return shot(target_x);
    const by = Number(miss[2]);
    const landed = miss[1] === 'SHORT' ? target_x - by : target_x + by;
    narrowLanding(host, found, landed);
    if (!found.landing) return shot(landed);
  }
  return shot(read(host, found.landing.addr, 'f32'));
}
// endregion: test-shot

// ---------- a fit by least squares ----------

// region: features
export function features(angle, power, wind) {
  // Math.cos and Math.sin take radians.
  const a = (angle * Math.PI) / 180;
  const p = power;
  const rise = p * Math.sin(a);
  return [
    1,
    Math.cos(a),
    p * p * Math.sin(2 * a),
    wind * rise ** 2,
    p * Math.cos(a),
  ];
}
// endregion: features

// region: normal-equations
// (AᵀA) c = Aᵀb as rows [entries of AᵀA | entry of Aᵀb].
function normalEquations(A, b) {
  const n = A[0].length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      row.push(A.reduce((sum, r) => sum + r[i] * r[j], 0));
    }
    row.push(A.reduce((sum, r, k) => sum + r[i] * b[k], 0));
    rows.push(row);
  }
  return rows;
}
// endregion: normal-equations

// region: least-squares
export function leastSquares(A, b) {
  const M = normalEquations(A, b);
  const n = M.length;
  // The largest number on the diagonal, its sign dropped.
  const scale = Math.max(...M.map((row, i) => Math.abs(row[i])));
  for (let c = 0; c < n; c++) {
    // The pivot row: the largest number in this column, the first of
    // equals, from this row down.
    let p = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    }
    [M[c], M[p]] = [M[p], M[c]];
    // A pivot this small means the equations have no single answer.
    if (!(Math.abs(M[c][c]) > 1e-12 * scale)) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c]; // makes row r's number here 0
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
// endregion: least-squares

// region: fit-shots
// Fit the coefficients to shots: [{ angle, power, wind, impact_x }].
export function fitShots(shots) {
  const A = shots.map((s) => features(s.angle, s.power, s.wind));
  return leastSquares(
    A,
    shots.map((s) => s.impact_x),
  );
}

export function predictFit(coef, angle, power, wind) {
  const f = features(angle, power, wind);
  return f.reduce((sum, x, i) => sum + x * coef[i], 0);
}
// endregion: fit-shots

// region: judge-fit
export function judgeFit(coef, sets, within = ACCEPT_WITHIN) {
  const { fitOn, heldOut } = sets;
  if (!coef) {
    const fitWorst = Infinity;
    return { verdict: 'send back', fitWorst, heldWorst: Infinity };
  }
  const miss = (s) =>
    Math.abs(predictFit(coef, s.angle, s.power, s.wind) - s.impact_x);
  // The worst miss on a list; 0 for an empty list.
  const worst = (shots) => Math.max(0, ...shots.map(miss));
  const fitWorst = worst(fitOn);
  const heldWorst = worst(heldOut);
  const ok = fitWorst <= within && heldWorst <= within;
  return { verdict: ok ? 'accept' : 'send back', fitWorst, heldWorst };
}
// endregion: judge-fit

// region: nearest
export function nearest(shots, state) {
  let best = null;
  for (const s of shots) {
    const miss = Math.abs(s.impact_x - state.target_x);
    // Strictly closer, so the first of equals stays.
    if (!best || miss < best.miss) {
      best = { angle: s.angle, power: s.power, miss };
    }
  }
  return best ? { angle: best.angle, power: best.power } : null;
}
// endregion: nearest

// ---------- searching for a setting ----------

// region: search-order
// The angles in the order search tries them.
function anglesIn(order) {
  const angles = [];
  const { angle_min, angle_max } = LIMITS;
  for (let a = angle_min; a <= angle_max; a++) angles.push(a);
  if (order !== 'middle') return angles;
  // 45 first, then outwards, the lower of each pair first.
  const away = (a) => Math.abs(a - 45);
  return angles.sort((a, b) => away(a) - away(b) || a - b);
}
// endregion: search-order

// region: setting
// One setting as search compares it, or null when it can't be: no
// prediction, a landing that is not a finite number, or no flag.
function setting(predict, at, angle, power) {
  const r = predict(angle, power);
  const t = r ? at(r.frames) : null;
  if (!r || typeof t !== 'number' || !Number.isFinite(r.x)) return null;
  const { x, frames } = r;
  // side: -1 short of where the flag will be, +1 beyond it.
  const side = Math.sign(x - t);
  return { angle, power, x, frames, miss: Math.abs(x - t), side };
}
// endregion: setting

// region: settings-at
// Every setting predicted at one angle, in the order predicted: the
// powers every 10, then the halving of each gap of 10 whose ends fall
// on opposite sides of the flag. Each power is predicted once.
function settingsAt(predict, at, angle) {
  const seen = new Map();
  const row = (power) => {
    if (seen.has(power)) return seen.get(power);
    const s = setting(predict, at, angle, power);
    seen.set(power, s);
    return s;
  };
  const { power_min, power_max } = LIMITS;
  for (let p = power_min; p <= power_max; p += 10) row(p);
  for (let p = power_min; p < power_max; p += 10) {
    let lo = p;
    let hi = p + 10;
    if (!row(lo) || !row(hi) || row(lo).side === row(hi).side) continue;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1; // the middle power, rounded down
      if (row(mid) && row(mid).side === row(lo).side) lo = mid;
      else hi = mid;
    }
  }
  return [...seen.values()];
}
// endregion: settings-at

// region: search
export function search(predict, at, options = {}) {
  const { enough = 0.5, order = 'middle' } = options;
  let best = null;
  for (const angle of anglesIn(order)) {
    for (const s of settingsAt(predict, at, angle)) {
      if (s && (!best || s.miss < best.miss)) best = s;
    }
    if (best && best.miss <= enough) break; // the first good angle
  }
  if (!best) return null;
  const { angle, power, x, frames, miss } = best;
  return { angle, power, x, frames, miss };
}
// endregion: search
