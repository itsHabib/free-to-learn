// Checks for unit 1: edge functions and the fill rule.
// Sections (headings in lessons/01.md):
//   Pixels and their centres (a case's message names it when rasterize samples corners)
//   The edge function
//   Walking the bounding box
//   The tie rule
//   Watertight meshes
//   Winding order
//   Snapping to the subpixel grid
// The helpers exported below are shared by checks 2 to 4 and by the
// fixture tools; they hold no reference implementation.
import { createHash } from 'node:crypto';

export const title = 'Edge functions and the fill rule';

// ---- shared helpers ----------------------------------------------

export function hash(view) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

// Run-length list [value, count, value, count, ...].
export function rle(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (out.length && out[out.length - 2] === arr[i]) out[out.length - 1]++;
    else out.push(arr[i], 1);
  }
  return out;
}

export function unrle(list, n) {
  const out = new Int32Array(n);
  let at = 0;
  for (let k = 0; k < list.length; k += 2) {
    out.fill(list[k], at, at + list[k + 1]);
    at += list[k + 1];
  }
  return out;
}

export const fmt = (n) => Number(n).toLocaleString('en-US');
export const px = (i, W) => `(${i % W}, ${Math.floor(i / W)})`;

const ownerWord = (v) =>
  v === -1 ? 'no triangle' : v === -2 ? 'two or more triangles' : `triangle ${v}`;

// Pixel owners from the learner's rasterize: -1 none, the triangle id
// when exactly one triangle covers it, -2 when two or more do.
export function coverage(gpu, scene, rect) {
  const { rasterize, snap2, fullRect } = gpu.raster;
  const W = scene.width;
  const H = scene.height;
  const owner = new Int32Array(W * H).fill(-1);
  const count = new Uint8Array(W * H);
  const box = rect ?? fullRect(W, H);
  let stray = null;
  for (const t of scene.tris) {
    rasterize(snap2(t.v.map((v) => v.p)), box, (x, y) => {
      const ok = Number.isInteger(x) && Number.isInteger(y)
        && x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
      if (!ok) return void (stray ??= { x, y, id: t.id });
      const i = y * W + x;
      count[i] = Math.min(255, count[i] + 1);
      owner[i] = count[i] > 1 ? -2 : t.id;
    });
  }
  return { owner, count, stray, W, H };
}

export function strayMessage(scene, cov) {
  if (!cov.stray) return null;
  const { x, y, id } = cov.stray;
  return {
    message: `rasterize must emit only pixels inside the rectangle it is given. On the "${scene.name}" scene it emitted pixel (${x}, ${y}) for triangle ${id}, outside 0..${cov.W - 1} by 0..${cov.H - 1}.`,
  };
}

// Compare an owner buffer with a stored { covered, hash, rle }.
export function compareOwners(what, owner, want, W) {
  if (hash(owner) === want.hash) return null;
  const exp = unrle(want.rle, owner.length);
  let i = 0;
  while (i < owner.length && owner[i] === exp[i]) i++;
  const covered = owner.reduce((n, v) => n + (v !== -1 ? 1 : 0), 0);
  let differ = 0;
  for (let k = 0; k < owner.length; k++) if (owner[k] !== exp[k]) differ++;
  return `${what}: ${fmt(differ)} pixels differ from the expected picture (yours covers ${fmt(covered)}, expected ${fmt(want.covered)}). First difference at pixel ${px(i, W)}: yours has ${ownerWord(owner[i])}, expected ${ownerWord(exp[i])}.`;
}

// The r, g, b bytes of an image, for storing and comparing colour.
export function rgbOf(image) {
  const n = image.w * image.h;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) out.set(image.rgba.subarray(i * 4, i * 4 + 3), i * 3);
  return out;
}

// Compare colour with stored base64 RGB bytes, allowing tol levels.
export function compareRgb(what, image, wantB64, tol) {
  const want = Buffer.from(wantB64, 'base64');
  const got = rgbOf(image);
  let over = 0;
  let max = 0;
  let first = -1;
  for (let i = 0; i < got.length / 3; i++) {
    let gap = 0;
    for (let k = 0; k < 3; k++) gap = Math.max(gap, Math.abs(got[i * 3 + k] - want[i * 3 + k]));
    max = Math.max(max, gap);
    if (gap > tol) {
      over++;
      if (first < 0) first = i;
    }
  }
  if (!over) return null;
  const at = (b) => `[${b[first * 3]}, ${b[first * 3 + 1]}, ${b[first * 3 + 2]}]`;
  return `${what}: ${fmt(over)} pixels differ by more than ${tol} level${tol === 1 ? '' : 's'} (largest difference ${max} of 255). First at pixel ${px(first, image.w)}: yours ${at(got)}, expected ${at(want)}.`;
}

export function notNumber(fn, got) {
  return typeof got !== 'number' || Number.isNaN(got)
    ? `${fn} should return a number; it returned ${JSON.stringify(got)}`
    : null;
}

// ---- cases ---------------------------------------------------------

// Does rasterize test each pixel at its corner instead of its centre? Two tiny triangles
// tell: one around the centre of pixel (5, 5) and one around its corner (80, 80) in
// subpixels. Sampled at centres, only the first draws (5, 5); at corners, only the second.
export function samplesCorners(gpu) {
  const drawn = (tri) => {
    const got = [];
    try {
      gpu.raster.rasterize(tri, gpu.raster.fullRect(64, 64), (x, y) => got.push(`${x},${y}`));
    } catch {
      return null;
    }
    return got.join(' ');
  };
  return drawn([[84, 85], [92, 85], [88, 92]]) === '' && drawn([[76, 77], [84, 77], [80, 84]]) === '5,5';
}
export const CORNERS = {
  section: 'Pixels and their centres',
  message: 'rasterize tests each pixel at its corner (x * SUB, y * SUB) instead of its centre (x * SUB + SUB / 2, y * SUB + SUB / 2): a tiny triangle around the centre of pixel (5, 5) drew nothing, and one around the pixel\'s corner drew it. Every edge then sits half a pixel off.',
};

// Pixels whose centre lies exactly on an edge of one of the scene's triangles (a tie),
// from the snapped corners: edge values are cross products, exact in integers.
function tieMask(gpu, scene) {
  const { snap2, SUB } = gpu.raster;
  const sub = SUB ?? 16;
  const W = scene.width;
  const mask = new Uint8Array(W * scene.height);
  for (const t of scene.tris) {
    const v = snap2(t.v.map((x) => x.p));
    for (let y = 0; y < scene.height; y++) {
      for (let x = 0; x < W; x++) {
        const p = [x * sub + sub / 2, y * sub + sub / 2];
        for (let k = 0; k < 3; k++) {
          const a = v[k], b = v[(k + 1) % 3];
          const e = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
          const within = Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
          if (e === 0 && within) mask[y * W + x] = 1;
        }
      }
    }
  }
  return mask;
}

const sceneCase = (id, section, builder, why, opts = {}) => ({
  id,
  section,
  uses: [['raster.mjs', 'rasterize'], ['raster.mjs', 'owns'], ['raster.mjs', 'edge']],
  run: async (gpu, ctx) => {
    const scene = ctx.scenes[builder]();
    const want = ctx.fixture('1-coverage').scenes[scene.name];
    const cov = coverage(gpu, scene);
    const stray = strayMessage(scene, cov);
    if (stray) return stray;
    let owner = cov.owner;
    if (opts.skipTies) {
      // Tie pixels belong to the tie rule's cases: here they take the expected owner, so
      // only a pixel whose centre is clear of every edge can fail.
      if (hash(owner) === want.hash) return null;
      const exp = unrle(want.rle, owner.length);
      const ties = tieMask(gpu, scene);
      owner = owner.map((v, i) => (ties[i] ? exp[i] : v));
    }
    const diff = compareOwners(`${why} ("${scene.name}" scene${opts.skipTies ? ', pixels whose centres sit on no edge' : ''})`, owner, want, scene.width);
    if (!diff) return null;
    if (samplesCorners(gpu)) return { ...CORNERS, message: `${CORNERS.message} ${diff}` };
    return { message: diff };
  },
});

export const cases = [
  {
    id: '1.edge-values',
    section: 'The edge function',
    uses: [['raster.mjs', 'edge']],
    run: async (gpu, ctx) => {
      for (const { a, b, p, want } of ctx.fixture('1-edge').edge) {
        const got = gpu.raster.edge(a, b, p);
        const bad = notNumber('edge', got);
        if (bad) return { message: bad };
        if (got !== want) {
          const side = want > 0 ? 'left of' : want < 0 ? 'right of' : 'on';
          return { message: `edge(a, b, p) must be twice the signed area of a, b, p, exact in integers, positive when p is left of a -> b (y up). For a = [${a}], b = [${b}], p = [${p}] (p is ${side} the line) it returned ${got}, expected ${want}.` };
        }
      }
      return null;
    },
  },
  {
    id: '1.owns-directions',
    section: 'The tie rule',
    uses: [['raster.mjs', 'owns']],
    run: async (gpu, ctx) => {
      for (const { a, b, want, name } of ctx.fixture('1-edge').owns) {
        const got = gpu.raster.owns(a, b);
        if (got !== want) {
          return { message: `owns(a, b) decides whether a pixel centre exactly on edge a -> b of a counter-clockwise triangle belongs to it: nudge the centre right by a tiny e and up by e * e and see whether it lands inside. For the edge from [${a}] to [${b}] (${name}) it returned ${JSON.stringify(got)}, expected ${want}.` };
        }
      }
      return null;
    },
  },
  {
    id: '1.zero-area',
    section: 'The edge function',
    uses: [['raster.mjs', 'rasterize']],
    run: async (gpu) => {
      const flat = [
        [[16, 16], [320, 160], [624, 304]],
        [[100, 100], [100, 100], [500, 40]],
      ];
      for (const tri of flat) {
        let n = 0;
        const got = gpu.raster.rasterize(tri, gpu.raster.fullRect(64, 64), () => n++);
        if (n !== 0 || got !== 0) {
          return { message: `A triangle with zero area must emit nothing and return 0. For the points ${JSON.stringify(tri)} (subpixels) rasterize emitted ${n} pixels and returned ${JSON.stringify(got)}.` };
        }
      }
      return null;
    },
  },
  sceneCase('1.one-triangle', 'Walking the bounding box', 'oneTriangle',
    'A single triangle must cover exactly the pixels whose centres are inside it'),
  sceneCase('1.bbox-edges', 'Walking the bounding box', 'bboxEdges',
    'The bounding box must include the column and row of a vertex that sits in the right or top half of a pixel', { skipTies: true }),
  {
    id: '1.rect-and-count',
    section: 'Walking the bounding box',
    uses: [['raster.mjs', 'rasterize']],
    run: async (gpu, ctx) => {
      const scene = ctx.scenes.oneTriangle();
      const W = scene.width;
      const rect = { x0: 9, y0: 13, x1: 41, y1: 37 };
      const exp = unrle(ctx.fixture('1-coverage').scenes[scene.name].rle, W * W);
      const tri = gpu.raster.snap2(scene.tris[0].v.map((v) => v.p));
      const seen = new Set();
      let stray = null;
      const got = gpu.raster.rasterize(tri, rect, (x, y) => {
        if (x < rect.x0 || x >= rect.x1 || y < rect.y0 || y >= rect.y1) stray ??= [x, y];
        seen.add(y * W + x);
      });
      if (stray) {
        return { message: `rasterize must stay inside rect (x ${rect.x0}..${rect.x1 - 1}, y ${rect.y0}..${rect.y1 - 1}; x1 and y1 are exclusive). On "one-triangle" it emitted pixel (${stray}).` };
      }
      let want = 0;
      for (let y = rect.y0; y < rect.y1; y++) {
        for (let x = rect.x0; x < rect.x1; x++) {
          const i = y * W + x;
          if (exp[i] !== -1) want++;
          if ((exp[i] !== -1) !== seen.has(i)) {
            return { message: `Inside rect (x ${rect.x0}..${rect.x1 - 1}, y ${rect.y0}..${rect.y1 - 1}) rasterize must emit the same pixels as without it. On "one-triangle", pixel (${x}, ${y}) should ${exp[i] !== -1 ? '' : 'not '}be emitted.` };
          }
        }
      }
      if (got !== want) {
        return { message: `rasterize must return the number of pixels it emitted. On "one-triangle" inside rect it emitted ${want} and returned ${JSON.stringify(got)}.` };
      }
      return null;
    },
  },
  {
    id: '1.visit-order',
    section: 'Walking the bounding box',
    uses: [['raster.mjs', 'rasterize']],
    run: async (gpu, ctx) => {
      const scene = ctx.scenes.oneTriangle();
      const tri = gpu.raster.snap2(scene.tris[0].v.map((v) => v.p));
      let last = null;
      let bad = null;
      gpu.raster.rasterize(tri, gpu.raster.fullRect(64, 64), (x, y) => {
        if (last && !bad && (y < last[1] || (y === last[1] && x <= last[0]))) bad = [last, [x, y]];
        last = [x, y];
      });
      if (!bad) return null;
      return { message: `rasterize must visit pixels row by row from the bottom (y = 0), left to right within a row. On "one-triangle" it emitted (${bad[0]}) and then (${bad[1]}).` };
    },
  },
  {
    id: '1.seam-once',
    section: 'The tie rule',
    uses: [['raster.mjs', 'rasterize'], ['raster.mjs', 'owns']],
    run: async (gpu, ctx) => {
      const scene = ctx.scenes.sharedDiagonal();
      const want = ctx.fixture('1-coverage').scenes[scene.name];
      const cov = coverage(gpu, scene);
      const stray = strayMessage(scene, cov);
      if (stray) return stray;
      const twice = cov.count.findIndex((n) => n > 1);
      if (twice >= 0) {
        const n = cov.count.filter((c) => c > 1).length;
        return { message: `Two triangles sharing an edge must not both draw a pixel whose centre lies on that edge. On "shared-diagonal" (a square cut along its diagonal) ${n} pixels were drawn twice, first at ${px(twice, scene.width)}: both edges claimed the tie.` };
      }
      const covered = cov.count.reduce((n, c) => n + (c ? 1 : 0), 0);
      if (covered !== want.covered) {
        return { message: `Every pixel centre on a shared edge must belong to exactly one of the two triangles. On "shared-diagonal" your triangles cover ${fmt(covered)} pixels, expected ${fmt(want.covered)}: ${fmt(want.covered - covered)} tie pixels were claimed by neither.` };
      }
      return null;
    },
  },
  sceneCase('1.shared-diagonal', 'The tie rule', 'sharedDiagonal',
    'Tie pixels on the diagonal and on the outer edges must go to the edges the nudge rule picks'),
  sceneCase('1.fan', 'The tie rule', 'fan8',
    'A vertex on a pixel centre shared by eight triangles must belong to exactly the one the nudge rule picks'),
  sceneCase('1.quad-grid', 'The tie rule', 'quadGrid',
    'Horizontal and vertical edges through pixel centres must follow the nudge rule'),
  {
    id: '1.mesh-once',
    section: 'Watertight meshes',
    uses: [['raster.mjs', 'rasterize'], ['raster.mjs', 'owns']],
    run: async (gpu, ctx) => {
      const box = ctx.scenes.MESH_INSIDE;
      for (const seed of [1, 2, 3, 4, 5]) {
        const scene = ctx.scenes.mesh2d(seed);
        const cov = coverage(gpu, scene);
        const stray = strayMessage(scene, cov);
        if (stray) return stray;
        const W = scene.width;
        for (let i = 0; i < cov.count.length; i++) {
          const x = i % W;
          const y = Math.floor(i / W);
          const inside = x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
          const want = inside ? 1 : 0;
          if (cov.count[i] !== want) {
            return { message: `A watertight mesh must cover every pixel inside it exactly once and nothing outside. In the seeded mesh "${scene.name}" (${scene.tris.length} triangles filling the square ${box.x0}..${box.x1}) pixel ${px(i, W)} was covered ${cov.count[i]} times, expected ${want}.` };
          }
        }
      }
      return null;
    },
  },
  {
    id: '1.winding',
    section: 'Winding order',
    uses: [['raster.mjs', 'rasterize']],
    run: async (gpu, ctx) => {
      const { rasterize, snap2, fullRect, edge } = gpu.raster;
      const scenes = [ctx.scenes.oneTriangle(), ctx.scenes.fan8(), ctx.scenes.mesh2d(3, { flip: true })];
      for (const scene of scenes) {
        for (const t of scene.tris) {
          const tri = snap2(t.v.map((v) => v.p));
          const area2 = Math.abs(edge(tri[0], tri[1], tri[2]));
          const a = new Map();
          rasterize(tri, fullRect(64, 64), (x, y, w0, w1, w2) => a.set(y * 64 + x, [w0, w1, w2]));
          const back = [tri[0], tri[2], tri[1]];
          const b = new Map();
          rasterize(back, fullRect(64, 64), (x, y, w0, w1, w2) => b.set(y * 64 + x, [w0, w2, w1]));
          const where = `triangle ${t.id} of "${scene.name}"`;
          if (a.size !== b.size || [...a.keys()].some((k) => !b.has(k))) {
            return { message: `Winding order must not change coverage. ${where} covers ${a.size} pixels as given and ${b.size} with two vertices swapped.` };
          }
          for (const [i, w] of a) {
            const sum = w[0] + w[1] + w[2];
            if (w.some((v) => v < 0) || sum !== area2) {
              return { message: `emit must receive three weights, all >= 0, summing to twice the triangle's area in subpixels squared (${area2}). For ${where} at pixel ${px(i, 64)} it received ${w.join(', ')}.` };
            }
            const v = b.get(i);
            if (v[0] !== w[0] || v[1] !== w[1] || v[2] !== w[2]) {
              return { message: `emit's weights must follow the caller's vertex order: w0 belongs to the first vertex given, whatever the winding. For ${where} at pixel ${px(i, 64)}, weights given as listed were ${w.join(', ')}; with vertices 1 and 2 swapped they came back as ${[v[0], v[2], v[1]].join(', ')} (expected ${[w[0], w[2], w[1]].join(', ')}).` };
            }
          }
        }
      }
      return null;
    },
  },
  sceneCase('1.off-grid', 'Snapping to the subpixel grid', 'offGrid',
    'Vertices must be snapped to the 1/16 pixel grid before the edge functions run'),
];
