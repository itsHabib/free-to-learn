// Lesson 4 checks: waveTile in project/world-04.html, and lagoonTile in project/lagoon.js.
// The contract and the new application are required. The comparison with stage 4 is a note, never a failure.
import { landPath, ruleFault, declarations } from './rule.mjs';

export const title = 'Water';
export const SIZE = 64; // the size most checks use; the page uses 256
export const SEED = 11;
const show = (v) => String(+v.toPrecision(4));
const NAMES = ['R, the slope across,', 'G, the slope down,', 'B, the height,', 'A, the foam breakup,'];

const rms = (list) => Math.sqrt(list.reduce((s, v) => s + v * v, 0) / list.length);
const channel = (tile, c) => Float64Array.from({ length: tile.length / 4 }, (_, i) => tile[i * 4 + c]);

function shape(call, name) {
  for (const n of [32, SIZE]) {
    const t = call(n, SEED);
    if (Object.prototype.toString.call(t) !== '[object Float32Array]') return `${name}(${n}, ${SEED}) must return a Float32Array: with only 256 levels the mirror-like water would show steps.`;
    if (t.length !== n * n * 4) return `${name}(${n}, ${SEED}) returned ${t.length} numbers; ${n} by ${n} pixels of four channels are ${n * n * 4}.`;
    const bad = t.findIndex((v) => !Number.isFinite(v));
    if (bad >= 0) return `${name}(${n}, ${SEED}): pixel ${bad >> 2}, channel ${bad & 3}, is ${t[bad]}.`;
  }
  return null;
}

// How a tile meets itself. For each pixel pair, the step between neighbours; at a seam the step across the edge is
// far larger than the steps inside. "Larger" is judged row by row against the largest step inside that channel.
export function seam(tile, n, c) {
  const v = (x, y) => tile[(y * n + x) * 4 + c];
  let inside = 0;
  const edge = { across: [], down: [] };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n - 1; x++) inside = Math.max(inside, Math.abs(v(x + 1, y) - v(x, y)), Math.abs(v(y, x + 1) - v(y, x)));
  for (let k = 0; k < n; k++) {
    edge.across.push(Math.abs(v(0, k) - v(n - 1, k)));
    edge.down.push(Math.abs(v(k, 0) - v(k, n - 1)));
  }
  return { inside, across: Math.max(...edge.across), down: Math.max(...edge.down) };
}
export const SEAM_MOST = 1.25;

function seams(call, name) {
  for (const n of [SIZE, 128]) {
    const t = call(n, SEED);
    for (const c of [2, 3]) {
      const s = seam(t, n, c);
      for (const [way, edge] of [['right', s.across], ['bottom', s.down]]) {
        if (edge > SEAM_MOST * s.inside) return `${name}(${n}, ${SEED}) has a seam at its ${way} edge: ${NAMES[c]} jumps by ${show(edge)} from the ${way} edge to the opposite one, and no two neighbours inside differ by more than ${show(s.inside)}. The tile repeats across the sea, so that jump is a line every tile. A whole number of noise cells must cross the tile in every octave.`;
      }
    }
  }
  return null;
}

// R and G are the slope of B, by the difference of the two neighbours, wrapping at the edges, times 4.
function slopes(call, name) {
  const n = SIZE;
  const t = call(n, SEED);
  const h = (x, y) => t[(((y + n) % n) * n + ((x + n) % n)) * 4 + 2];
  const tolerance = 1e-4;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const want = [(h(x + 1, y) - h(x - 1, y)) * 4, (h(x, y + 1) - h(x, y - 1)) * 4];
      for (const c of [0, 1]) {
        if (Math.abs(t[i + c] - want[c]) <= tolerance) continue;
        const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
        if (Math.abs(t[i + c] + want[c]) <= tolerance && Math.abs(want[c]) > 0.01) return `${name}(${n}, ${SEED}), pixel (${x}, ${y}): ${NAMES[c]} is ${show(t[i + c])}, the negative of B's slope there, ${show(want[c])}. The slope is the neighbour after minus the neighbour before, so light falls on the side it comes from.`;
        return `${name}(${n}, ${SEED}), pixel (${x}, ${y}): ${NAMES[c]} is ${show(t[i + c])}, and the difference of the neighbouring heights times 4 is ${show(want[c])}.${edge ? ' This pixel is on the edge, where the neighbour is on the opposite edge: wrap with (x + n) % n.' : ''}`;
      }
    }
  return null;
}

function range(call, name) {
  for (const seed of [1, SEED, 2026]) {
    const t = call(SIZE, seed);
    const b = channel(t, 2), a = channel(t, 3);
    const [lo, hi] = [Math.min(...b), Math.max(...b)];
    if (lo < -0.01 || hi > 1.6) return `${name}(${SIZE}, ${seed}): B, the height, runs from ${show(lo)} to ${show(hi)}. The shaders expect about 0 to 1: four octaves of 1 - d * d, their amplitudes 0.5 and falling.`;
    if (hi - lo < 0.05) return `${name}(${SIZE}, ${seed}): B, the height, only runs from ${show(lo)} to ${show(hi)}: there are no waves in it.`;
    if (Math.min(...a) < -0.01 || Math.max(...a) > 1.01) return `${name}(${SIZE}, ${seed}): A, the foam breakup, runs from ${show(Math.min(...a))} to ${show(Math.max(...a))}; it must stay between 0 and 1.`;
    if (Math.max(...a) - Math.min(...a) < 0.2) return `${name}(${SIZE}, ${seed}): A, the foam breakup, only runs from ${show(Math.min(...a))} to ${show(Math.max(...a))}: foam needs holes to break up.`;
  }
  return null;
}

// Fine waves against broad ones: the mean step between neighbours over the spread of the heights. Octaves of finer
// waves raise it; one octave alone is smooth at this scale.
export function fineness(tile, n) {
  const v = (x, y) => tile[(y * n + x) * 4 + 2];
  const b = channel(tile, 2);
  const mean = b.reduce((s, x) => s + x, 0) / b.length;
  let step = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) step += Math.abs(v((x + 1) % n, y) - v(x, y));
  return step / (n * n) / rms(b.map((x) => x - mean));
}
export const FINE_LEAST = 0.1; // stage 4's tile gives 0.145; one size for all four octaves gives 0.068
function octaves(call, name) {
  const f = fineness(call(128, SEED), 128);
  return f >= FINE_LEAST ? null : `${name}(128, ${SEED}) has only broad waves: neighbouring heights differ by ${show(f)} of their spread, and finer octaves bring that to ${FINE_LEAST} or more. Each octave needs twice as many cells as the one before.`;
}

function steady(call, name) {
  const a = call(SIZE, SEED), b = call(SIZE, SEED), other = call(SIZE, SEED + 1);
  const differ = a.reduce((k, v, i) => k + (Object.is(v, b[i]) ? 0 : 1), 0);
  if (differ) return `${name}(${SIZE}, ${SEED}) gave ${differ.toLocaleString('en-US')} different numbers the second time, of ${a.length.toLocaleString('en-US')}: the same seed must give the same tile.`;
  if (a.every((v, i) => v === other[i])) return `${name} gives the same tile for seeds ${SEED} and ${SEED + 1}: it must use its seed.`;
  return null;
}

const on = (fn) => ({ mine }) => { const message = fn((...a) => mine.call('waveTile', ...a), 'waveTile'); return message ? { message } : null; };
function landRule({ mine, course }) {
  mine.call('waveTile', 8, 1); // stops here with "not written yet"
  const message = ruleFault(landPath(mine.source, 4, course.names));
  return message ? { message } : null;
}

// ------------------------------------------------------------------ the lagoon tile (new application)

export const LAGOON = { slopeMost: 0.5, slopeLeast: 0.1, fineMost: 0.6 };
const slopeRms = (t) => rms([...channel(t, 0), ...channel(t, 1)]);

function lagoonTile({ map }) {
  const call = (...a) => map.call('lagoonTile', ...a);
  const message = shape(call, 'lagoonTile') ?? seams(call, 'lagoonTile') ?? slopes(call, 'lagoonTile') ?? steady(call, 'lagoonTile');
  return message ? { message } : null;
}
function lagoonCalm({ map, course }) {
  const n = 128;
  const t = map.call('lagoonTile', n, SEED), w = course.call('waveTile', n, SEED);
  const [s, sw] = [slopeRms(t), slopeRms(w)];
  if (s > LAGOON.slopeMost * sw) return { message: `lagoonTile's slopes are ${show(s / sw)} of the open sea's: a lagoon is calmer, at most ${LAGOON.slopeMost}.` };
  if (s < LAGOON.slopeLeast * sw) return { message: `lagoonTile's slopes are ${show(s / sw)} of the open sea's: at least ${LAGOON.slopeLeast} is needed, or the water is a flat sheet.` };
  const [f, fw] = [fineness(t, n), fineness(w, n)];
  if (f > LAGOON.fineMost * fw) return { message: `lagoonTile has the open sea's fine ripples, only lower: neighbouring heights differ by ${show(f / fw)} as much as the sea's, against their own spread. Sheltered water has broad, smooth waves, at most ${LAGOON.fineMost}: use fewer octaves, or fewer cells.` };
  const b = channel(t, 2);
  if (Math.min(...b) < -0.01 || Math.max(...b) > 1.6) return { message: `lagoonTile's B, the height, runs from ${show(Math.min(...b))} to ${show(Math.max(...b))}: keep it about 0 to 1, as in waveTile.` };
  const a = channel(t, 3);
  if (Math.min(...a) < -0.01 || Math.max(...a) > 1.01 || Math.max(...a) - Math.min(...a) < 0.2) return { message: `lagoonTile's A, the foam breakup, runs from ${show(Math.min(...a))} to ${show(Math.max(...a))}: between 0 and 1, and with holes, as in waveTile.` };
  return null;
}
function lagoonRule({ map, scriptSource }) {
  map.call('lagoonTile', 8, 1); // stops here with "not written yet"
  const message = ruleFault(declarations(scriptSource));
  return message ? { message } : null;
}

// ------------------------------------------------------------------ the cases

export const cases = [
  { id: '4.tile-shape', part: 'contract', uses: ['waveTile'], title: 'a Float32Array of n by n pixels, four finite numbers each', run: on(shape) },
  { id: '4.tile-seam', part: 'contract', uses: ['waveTile'], title: 'the tile meets itself at every edge', run: on(seams) },
  { id: '4.tile-slope', part: 'contract', uses: ['waveTile'], title: 'R and G are the slope of B, wrapping at the edges', run: on(slopes) },
  { id: '4.tile-range', part: 'contract', uses: ['waveTile'], title: 'B is about 0 to 1 and A between 0 and 1, both with contrast', run: on(range) },
  { id: '4.tile-octaves', part: 'contract', uses: ['waveTile'], title: 'each octave is finer than the one before', run: on(octaves) },
  { id: '4.tile-steady', part: 'contract', uses: ['waveTile'], title: 'the same seed gives the same tile, another seed another', run: on(steady) },
  { id: '4.rule', part: 'contract', uses: ['waveTile'], title: 'the land path and the tile keep the determinism rule', run: landRule },
  { id: '4.lagoon-tile', part: 'application', uses: ['lagoonTile'], title: 'the lagoon tile has no seam, and its slopes are those of its heights', run: lagoonTile },
  { id: '4.lagoon-calm', part: 'application', uses: ['lagoonTile'], title: 'it is calmer and broader than the open sea, and not flat', run: lagoonCalm },
  { id: '4.lagoon-rule', part: 'application', uses: ['lagoonTile'], title: 'lagoon.js keeps the determinism rule', run: lagoonRule },
];

export function note({ mine, course }) {
  const a = mine.call('waveTile', SIZE, SEED), b = course.call('waveTile', SIZE, SEED);
  const differ = a.reduce((k, v, i) => k + (Math.abs(v - b[i]) < 1e-6 ? 0 : 1), 0);
  const lines = [differ ? `waveTile differs from stage 4's on ${differ.toLocaleString('en-US')} of ${a.length.toLocaleString('en-US')} numbers (another correct sea would too)` : `waveTile matches stage 4's on all ${a.length.toLocaleString('en-US')} numbers`];
  lines.push(mine.text('halve') === course.text('halve') ? 'halve matches stage 4' : 'halve differs from stage 4');
  return lines;
}
