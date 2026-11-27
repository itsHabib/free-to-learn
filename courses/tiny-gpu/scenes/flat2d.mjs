// Supplied: 2D scenes for units 1 and 3. Window coordinates (origin
// bottom-left, y up), in pixels; every vertex sits on the 1/16 pixel
// grid unless the scene says otherwise. The first five were first
// drawn with y pointing down, so they are turned upright here
// (y -> 64 - y); the pixel counts in the lessons are for these.

// An integer generator (a linear congruential one): same seed,
// same numbers.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const PALETTE = [
  [0.91, 0.55, 0.45], [0.47, 0.71, 0.86], [0.96, 0.78, 0.42],
  [0.55, 0.8, 0.6], [0.72, 0.6, 0.86], [0.95, 0.66, 0.73],
  [0.52, 0.78, 0.78], [0.86, 0.74, 0.58],
];

const q16 = (v) => Math.round(v * 16) / 16;
const up = ([x, y]) => [x, 64 - y]; // first drawn with y down

// tris: list of [[x, y], [x, y], [x, y]] (or with z, w per vertex).
export function flatScene(name, tris, opts = {}) {
  const { width = 64, height = 64, clear = [0.97, 0.96, 0.93] } = opts;
  return {
    name, width, height, clear,
    tris: tris.map((t, id) => ({
      id,
      v: t.map((p) => ({ p, c: PALETTE[id % PALETTE.length] })),
    })),
  };
}

export function oneTriangle() {
  const t = [[5.3, 4.7], [58.2, 20.9], [18.6, 59.1]];
  return flatScene('one-triangle',
    [t.map(([x, y]) => up([q16(x), q16(y)]))]);
}

// Two triangles sharing a diagonal through 49 pixel centres.
export function sharedDiagonal() {
  return flatScene('shared-diagonal', [
    [[8.5, 8.5], [56.5, 8.5], [56.5, 56.5]].map(up),
    [[8.5, 8.5], [56.5, 56.5], [8.5, 56.5]].map(up),
  ]);
}

// Eight triangles around a vertex on a pixel centre.
export function fan8() {
  const ring = [[60.5, 32.5], [52.5, 52.5], [32.5, 60.5], [12.5, 52.5],
    [4.5, 32.5], [12.5, 12.5], [32.5, 4.5], [52.5, 12.5]];
  const tris = ring.map((p, i) =>
    [[32.5, 32.5], p, ring[(i + 1) % ring.length]].map(up));
  return flatScene('fan-8', tris);
}

// A 4 x 4 grid of quads, every edge through pixel centres.
export function quadGrid() {
  const tris = [];
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const x0 = 4.5 + gx * 14, y0 = 4.5 + gy * 14;
      const x1 = x0 + 14, y1 = y0 + 14;
      tris.push([[x0, y0], [x1, y0], [x1, y1]].map(up),
        [[x0, y0], [x1, y1], [x0, y1]].map(up));
    }
  }
  return flatScene('quad-grid', tris);
}

// A jittered 7 x 7 grid, triangulated, inside the square 2..62.
// Shared vertices are identical, so the mesh is watertight: every
// pixel whose centre is inside the square belongs to exactly one
// triangle. flip: reverse the winding of a seeded half of them.
export function mesh2d(seed, opts = {}) {
  const { grain = 16, flip = false } = opts;
  const r = seeded(seed);
  const n = 7;
  const pts = [];
  const jit = (k) => (k === 0 || k === n ? 0 : (r() - 0.5) * 5);
  const snap = (v) => Math.round(v * grain) / grain;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = snap(2 + (i * 60) / n + jit(i));
      const y = snap(2 + (j * 60) / n + jit(j));
      pts.push(up([x, y]));
    }
  }
  const at = (i, j) => pts[j * (n + 1) + i];
  const tris = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = at(i, j), b = at(i + 1, j);
      const c = at(i, j + 1), d = at(i + 1, j + 1);
      if ((i + j) % 2) tris.push([a, b, d], [a, d, c]);
      else tris.push([a, b, c], [b, d, c]);
    }
  }
  const flips = seeded(seed * 7919 + 1);
  const out = tris.map((t) =>
    (flip && flips() < 0.5 ? [t[0], t[2], t[1]] : t));
  return flatScene(`mesh-${seed}${flip ? '-flipped' : ''}`, out);
}

// The pixels mesh2d must cover: centres inside the square 2..62.
export const MESH_INSIDE = { x0: 2, y0: 2, x1: 62, y1: 62 };

// Rightmost and topmost vertices in the right or top half of a
// pixel: a bounding box that rounds its maximum down loses them.
export function bboxEdges() {
  return flatScene('bbox-edges', [
    [[3.25, 3.25], [40.75, 10.5], [12.5, 30.875]],
    [[44.0625, 5.5], [60.9375, 20.25], [50.5, 61.8125]],
    [[6.5, 40.25], [30.5, 34.5], [20.125, 60.6875]],
  ]);
}

// Vertices off the 1/16 grid: x = 20.52 snaps to 20.5, onto the
// centres of column 20. Unsnapped, the edge misses those centres.
export function offGrid() {
  return flatScene('off-grid', [
    [[20.52, 6.47], [50.31, 6.47], [20.52, 50.53]],
    [[50.31, 6.47], [50.31, 50.53], [20.52, 50.53]],
    [[8.03, 56.5], [30.47, 56.5], [8.03, 60.97]],
  ]);
}

// Transfer item: six triangles around a vertex on a pixel centre.
export function hexFan() {
  const c = [32.5, 32.5];
  const ring = [[52.5, 32.5], [42.5, 50.5], [22.5, 50.5], [12.5, 32.5],
    [22.5, 14.5], [42.5, 14.5]];
  return flatScene('hex-fan',
    ring.map((p, i) => [c, p, ring[(i + 1) % ring.length]]));
}

export function tieScenes() {
  return {
    'one-triangle': oneTriangle(),
    'shared-diagonal': sharedDiagonal(),
    'fan-8': fan8(),
    'quad-grid': quadGrid(),
    'bbox-edges': bboxEdges(),
  };
}

// ---- unit 3: 2D scenes with depth and clip w ---------------------
// p = [x, y, z, w]: window position, window depth z, clip w.

function shadedScene(name, tris) {
  return {
    name, width: 64, height: 64, clear: [0.97, 0.96, 0.93],
    tris: tris.map((t, id) => ({
      id,
      v: t.map(([x, y, z, w, r, g, b]) => ({
        p: [x, up([0, y])[1], z, w], c: [r, g, b],
      })),
    })),
  };
}

const RGB = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const COLOUR_TRI = [[5.3, 4.7], [58.2, 20.9], [18.6, 59.1]];

// One triangle, red, green and blue corners, w = 1 everywhere.
export function colourTriangle() {
  return shadedScene('colour-affine', [COLOUR_TRI.map(([x, y], k) =>
    [q16(x), q16(y), 0.5, 1, ...RGB[k]])]);
}

// The same triangle on screen with w = 1, 6 and 2.5: the green corner
// is six times further away, so it covers less of the triangle.
export function perspectiveTriangle() {
  const w = [1, 6, 2.5];
  return shadedScene('colour-perspective',
    [COLOUR_TRI.map(([x, y], k) =>
      [q16(x), q16(y), 0.5, w[k], ...RGB[k]])]);
}

// Two triangles passing through each other (depth LESS decides).
export function depthPair() {
  return shadedScene('depth-pair', [
    [[4.25, 6.5, 0.1, 1, 1, 0, 0], [60.75, 10.5, 0.9, 1, 1, 0, 0],
      [20.5, 60.25, 0.5, 1, 1, 0, 0]],
    [[6.5, 58.5, 0.8, 1, 0, 1, 0], [58.5, 50.25, 0.2, 1, 0, 1, 0],
      [34.5, 3.5, 0.5, 1, 0, 1, 0]],
  ]);
}

// One triangle drawn twice at equal depth: red first, then green.
export function coplanarPair() {
  const t = [[4.5, 4.5, 0.37], [60.5, 9.5, 0.61], [12.5, 58.5, 0.13]];
  return shadedScene('coplanar-pair', [
    t.map((p) => [...p, 1, 1, 0, 0]),
    t.map((p) => [...p, 1, 0, 1, 0]),
  ]);
}
