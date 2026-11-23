// Lesson 2 checks: ridged in project/world-02.html, and atollHeight in project/atoll.js.
// The contract and the new application are required. The comparison with stage 2 is a note, never a failure.
import { nodeRun, jscRun, jscPresent, differing, fingerprint, GRID, SEED } from './engines.mjs';
import { stream } from './geometry.mjs';
import { landPath, ruleFault, declarations } from './rule.mjs';

export const title = 'Land from a seed';

// ------------------------------------------------------------------ ridged

function ridgedRule({ mine, course }) {
  mine.call('ridged', 0.3, 0.7, 5, [0, 0]); // stops here with "not written yet"
  const message = ruleFault(landPath(mine.source, 2, course.names));
  return message ? { message } : null;
}

// Points spread over noise space, for the range and detail checks.
function points(n, seed) {
  const r = stream(seed);
  return Array.from({ length: n }, () => [r() * 40 - 20, r() * 40 - 20]);
}

function ridgedRange({ mine }) {
  const D = [0, 0];
  for (const s of [10, 41, 2026]) {
    for (const [x, y] of points(3000, s)) {
      const v = mine.call('ridged', x, y, s, D);
      if (typeof v !== 'number' || !Number.isFinite(v)) return { message: `ridged(${x.toFixed(3)}, ${y.toFixed(3)}, ${s}, D) returned ${v}: it must return a finite number.` };
      if (v < 0 || v > 1) return { message: `ridged(${x.toFixed(3)}, ${y.toFixed(3)}, ${s}, D) returned ${v}, ${v > 1 ? 'above 1' : 'below 0'}. Each octave adds at most its amplitude, so dividing the sum by the total of the amplitudes keeps ridged between 0 and 1.` };
    }
  }
  return null;
}

// How steep ridged is over a short step, 1/512 of a noise cell, against how much it changes over a whole cell.
// Each finer octave adds steepness at short range; with every octave at one size, ridged is as smooth as one
// noise and the ratio falls by about half.
export const STEP = 1 / 512;
export function detailRatio(call) {
  const D = [0, 0];
  let fine = 0;
  let coarse = 0;
  for (const [x, y] of points(2000, 77)) {
    const v = call(x, y, 10, D);
    fine += Math.abs(call(x + STEP, y, 10, D) - v) / STEP;
    coarse += Math.abs(call(x + 1, y, 10, D) - v);
  }
  return fine / coarse;
}
// Stage 2's ridged gives 7.5 and three octaves 5.3; two octaves give 4.5, one 3.5, and one size for all six 3.6.
export const DETAIL_LEAST = 4.8;

function ridgedDetail({ mine }) {
  const ratio = detailRatio((...a) => mine.call('ridged', ...a));
  if (ratio >= DETAIL_LEAST) return null;
  return { message: `ridged has no finer octaves: its steepness over a short step is ${ratio.toFixed(2)} times its change over a whole noise cell, and finer octaves bring that to ${DETAIL_LEAST} or more. Each octave must double the point's distance from the origin (stage 2 also turns it), so the next noise is finer.` };
}

function ridgedRuns({ file, label }) {
  const a = nodeRun(file, label);
  const b = nodeRun(file, label);
  const grid = differing(a.grid, b.grid);
  const land = differing(a.land, b.land);
  if (grid || land) return { message: `two runs of the same code disagree: ridged differs on ${grid} of ${GRID * GRID} points and the island for seed ${SEED} on ${land.toLocaleString('en-US')} of ${a.land.length.toLocaleString('en-US')} heights. Something in it changes from run to run, such as Math.random.` };
  const other = nodeRun(file, label, SEED + 1);
  if (fingerprint(other.land) === fingerprint(a.land)) return { message: `seeds ${SEED} and ${SEED + 1} give the same island: ridged must use its seed argument s.` };
  return null;
}

function ridgedEngines({ file, label }) {
  if (!jscPresent()) return { skipped: 'JavaScriptCore is not on this computer (it ships with macOS); 2.ridged-runs compared Node with itself' };
  const n = nodeRun(file, label);
  const j = jscRun(file);
  const grid = differing(n.grid, j.grid);
  const land = fingerprint(n.land) !== j.land;
  if (!grid && !land) return null;
  return { message: `Node and JavaScriptCore disagree: ridged differs on ${grid} of ${GRID * GRID} points${land ? `, and the island for seed ${SEED} differs too` : `; stored as 32-bit heights, the island for seed ${SEED} happens to match, but erosion in lesson 5 would make the difference grow`}. 2.ridged-rule names what to look for.` };
}

// ------------------------------------------------------------------ the atoll (new application)

export const ATOLL_SEEDS = [7, 8, 2026];
export const ATOLL = { lagoon: [-15, 0], ringShare: 0.75, highest: 40, open: 1.6, deep: -20 };

function ringPoints(P, k, n = 64) {
  // Angles without trigonometry: points on a square's outline, pushed out to the circle.
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 8 - 4;
    const [x, z] = t < -2 ? [-1, t + 3] : t < 0 ? [t + 1, 1] : t < 2 ? [1, 1 - t] : [3 - t, -1];
    const len = Math.sqrt(x * x + z * z);
    out.push([(x / len) * k * P.R, (z / len) * k * P.R]);
  }
  return out;
}

function atollShape({ map }) {
  const D = [0, 0];
  for (const seed of ATOLL_SEEDS) {
    const P = map.call('islandParams', seed);
    const at = (x, z) => map.call('atollHeight', x, z, P, D);
    const h0 = at(0, 0);
    if (!Number.isFinite(h0) || h0 <= ATOLL.lagoon[0] || h0 >= ATOLL.lagoon[1]) return { message: `seed ${seed}: atollHeight(0, 0, P, D) is ${h0}. The middle of an atoll is a shallow lagoon: between ${ATOLL.lagoon[0]} m and ${ATOLL.lagoon[1]} m.` };
    const ring = ringPoints(P, 1).map(([x, z]) => at(x, z));
    const dry = ring.filter((h) => h > 0).length;
    if (dry < ATOLL.ringShare * ring.length) return { message: `seed ${seed}: only ${dry} of ${ring.length} points on the circle of radius P.R (${P.R.toFixed(0)} m) are above the sea. An atoll is a ring of land: at least ${ATOLL.ringShare * 100}% of that circle must be dry.` };
    let top = -Infinity;
    for (let x = -1.4 * P.R; x <= 1.4 * P.R; x += P.R / 20) for (let z = -1.4 * P.R; z <= 1.4 * P.R; z += P.R / 20) top = Math.max(top, at(x, z));
    if (top > ATOLL.highest) return { message: `seed ${seed}: the atoll rises to ${top.toFixed(1)} m. An atoll is low coral and sand: nothing higher than ${ATOLL.highest} m.` };
    const out = ringPoints(P, ATOLL.open).map(([x, z]) => at(x, z));
    const shallow = out.filter((h) => !(h < ATOLL.deep)).length;
    if (shallow) return { message: `seed ${seed}: ${shallow} of ${out.length} points on the circle of radius ${ATOLL.open} P.R are not deeper than ${ATOLL.deep} m. Outside the ring the sea floor falls away.` };
  }
  return null;
}

function atollRule({ map, scriptSource }) {
  map.call('atollHeight', 0, 0, map.call('islandParams', 7), [0, 0]); // stops here with "not written yet"
  const message = ruleFault(declarations(scriptSource));
  if (message) return { message };
  if (!/\bridged\s*\(/.test(scriptSource)) return { message: 'atoll.js does not call ridged. The atoll is built from the same functions: use ridged for the ring\'s rough top.' };
  const D = [0, 0];
  const P = map.call('islandParams', 7);
  const r = stream(5);
  for (let k = 0; k < 200; k++) {
    const x = (r() - 0.5) * 1600, z = (r() - 0.5) * 1600;
    const a = map.call('atollHeight', x, z, P, D), b = map.call('atollHeight', x, z, P, [0, 0]);
    if (!Object.is(a, b)) return { message: `atollHeight(${x.toFixed(1)}, ${z.toFixed(1)}, P, D) gave ${a}, then ${b}: the same point must give the same height.` };
  }
  return null;
}

// ------------------------------------------------------------------ the cases

export const cases = [
  { id: '2.ridged-rule', part: 'contract', uses: ['ridged'], title: 'everything that shapes the land keeps the determinism rule', run: ridgedRule },
  { id: '2.ridged-range', part: 'contract', uses: ['ridged'], title: 'ridged returns a number from 0 to 1', run: ridgedRange },
  { id: '2.ridged-detail', part: 'contract', uses: ['ridged'], title: 'each octave is finer than the one before', run: ridgedDetail },
  { id: '2.ridged-runs', part: 'contract', uses: ['ridged'], title: 'Node twice: the same seed gives the same island, another seed another island', run: ridgedRuns },
  { id: '2.ridged-engines', part: 'contract', uses: ['ridged'], title: 'Node and JavaScriptCore give the same island (on a Mac)', run: ridgedEngines },
  { id: '2.atoll-shape', part: 'application', uses: ['atollHeight'], title: 'a shallow lagoon, a ring of low land at P.R, deep sea outside', run: atollShape },
  { id: '2.atoll-rule', part: 'application', uses: ['atollHeight'], title: 'atoll.js keeps the determinism rule and uses ridged', run: atollRule },
];

// ------------------------------------------------------------------ the note

export function note({ mine, course }) {
  const D = [0, 0];
  const pts = points(4000, 9);
  const differ = pts.filter(([x, y]) => !Object.is(mine.call('ridged', x, y, 10, D), course.call('ridged', x, y, 10, D))).length;
  const lines = [differ ? `ridged differs from stage 2's on ${differ} of ${pts.length} points (a correct version that adds in another order can differ in the last bits)` : `ridged matches stage 2's on all ${pts.length} points`];
  const changed = ['noiseD', 'hash2', 'islandParams', 'landHeight', 'fillLand', 'aim', 'boxHidden'].filter((name) => { try { return mine.text(name) !== course.text(name); } catch { return true; } });
  lines.push(changed.length ? `${changed.join(', ')} ${changed.length > 1 ? 'differ' : 'differs'} from stage 2` : 'the rest of the pure code matches stage 2');
  return lines;
}
