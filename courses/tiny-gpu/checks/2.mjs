// Checks for unit 2: from 3D to the screen.
// Sections (headings in lessons/02.md):
//   Matrices and homogeneous points
//   Clipping at the near plane
//   The divide and the snap
//   The courtyard in perspective
//   Walking into a column
import { compareOwners, fmt } from './1.mjs';

export const title = 'From 3D to the screen: transform, clip, snap';

const TOL = 1e-9;
const close = (a, b, tol = TOL) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const show = (xs) => `[${xs.map((x) => +x.toPrecision(6)).join(', ')}]`;

function sameVertex(got, want) {
  if (!got || !Array.isArray(got.c) || !Array.isArray(got.a)) return false;
  if (got.c.length !== 4 || got.a.length !== want.a.length) return false;
  return got.c.every((x, i) => close(x, want.c[i]))
    && got.a.every((x, i) => close(x, want.a[i]));
}

const showVertex = (v) => (v && v.c ? `{ c: ${show(v.c)}, a: ${show(v.a ?? [])} }` : JSON.stringify(v));
const showTris = (tris) => (Array.isArray(tris)
  ? `${tris.length} triangle${tris.length === 1 ? '' : 's'}${tris.length ? `: ${tris.map((t) => `(${t.map(showVertex).join(', ')})`).join('; ')}` : ''}`
  : JSON.stringify(tris));

function renderStop(gpu, ctx, stop) {
  const { size } = ctx.fixture('2-stops');
  const scene = ctx.scenes.courtyard({ width: size, height: size, stop });
  return { scene, image: gpu.pipeline.render(scene, { stage: 2 }).image };
}

const uses2 = [['vertex.mjs', 'transform'], ['vertex.mjs', 'clipNear'], ['vertex.mjs', 'toWindow']];

function stopCase(id, section, stops, why) {
  return {
    id,
    section,
    uses: uses2,
    run: async (gpu, ctx) => {
      const fx = ctx.fixture('2-stops');
      for (const stop of stops) {
        const { image } = renderStop(gpu, ctx, stop);
        const diff = compareOwners(`${why} (camera stop "${stop}", ${fx.size} x ${fx.size}, stage 2: flat colours drawn in order)`,
          image.ids, fx.stops[stop], fx.size);
        if (diff) return { message: diff };
      }
      return null;
    },
  };
}

export const cases = [
  {
    id: '2.transform',
    section: 'Matrices and homogeneous points',
    uses: [['vertex.mjs', 'transform']],
    run: async (gpu, ctx) => {
      for (const { name, m, p, want } of ctx.fixture('2-transform').cases) {
        const got = gpu.vertex.transform(Float64Array.from(m), p);
        const ok = Array.isArray(got) && got.length === 4
          && got.every((x, i) => close(x, want[i]));
        if (!ok) {
          return { message: `transform(m, p) multiplies the column-major matrix m (row r, column c at m[c * 4 + r]) by [x, y, z, 1]. For ${name} and p = ${show(p)} it returned ${Array.isArray(got) ? show(got) : JSON.stringify(got)}, expected ${show(want)}.` };
        }
      }
      return null;
    },
  },
  {
    id: '2.clip-cases',
    section: 'Clipping at the near plane',
    uses: [['vertex.mjs', 'clipNear']],
    run: async (gpu, ctx) => {
      for (const { name, tri, want } of ctx.fixture('2-clip').cases) {
        const input = structuredClone(tri);
        const got = gpu.vertex.clipNear(input);
        const ok = Array.isArray(got) && got.length === want.length
          && got.every((t, k) => Array.isArray(t) && t.length === 3
            && t.every((vx, j) => sameVertex(vx, want[k][j])));
        if (!ok) {
          return { message: `clipNear keeps the part of a triangle where z + w >= 0, walking the edges v0 -> v1 -> v2 -> v0, and returns the kept polygon as a fan from its first corner. Case "${name}", input (${tri.map(showVertex).join(', ')}): it returned ${showTris(got)}; expected ${showTris(want)}.` };
        }
      }
      return null;
    },
  },
  {
    id: '2.to-window',
    section: 'The divide and the snap',
    uses: [['vertex.mjs', 'toWindow']],
    run: async (gpu, ctx) => {
      const { W, H, cases } = ctx.fixture('2-window');
      for (const { c, want } of cases) {
        const got = gpu.vertex.toWindow(c, W, H);
        const ok = got && got.x === want.x && got.y === want.y
          && close(got.z, want.z, 1e-12) && close(got.invW, want.invW, 1e-12);
        if (!ok) {
          return { message: `toWindow divides by w, maps x from -1..1 to 0..W and y to 0..H (here ${W} x ${H}), rounds both to the nearest 1/16 pixel (integers in subpixels), maps z to 0..1 and keeps 1 / w. For c = ${show(c)} it returned ${JSON.stringify(got)}, expected ${JSON.stringify(want)}.` };
        }
      }
      return null;
    },
  },
  {
    id: '2.behind-eye',
    section: 'Clipping at the near plane',
    uses: uses2,
    run: async (gpu, ctx) => {
      const fx = ctx.fixture('2-stops');
      for (const [stop, info] of Object.entries(fx.stops)) {
        if (!info.behind.length) continue;
        const behind = new Set(info.behind);
        const { image } = renderStop(gpu, ctx, stop);
        let n = 0;
        let first = -1;
        image.ids.forEach((id, i) => {
          if (!behind.has(id)) return;
          n++;
          if (first < 0) first = i;
        });
        if (n) {
          const id = image.ids[first];
          return { message: `A triangle wholly behind the near plane must draw nothing. From camera stop "${stop}" ${info.behind.length} triangles are wholly behind it, yet ${fmt(n)} pixels show one of them (first: pixel (${first % fx.size}, ${Math.floor(first / fx.size)}), triangle ${id}). Clip before dividing by w: a negative w flips the triangle onto the screen.` };
        }
      }
      return null;
    },
  },
  stopCase('2.stops', 'The courtyard in perspective', ['gate', 'corner', 'low', 'crate', 'lamp-behind'],
    'The courtyard must cover the same pixels with the same triangles as the reference'),
  stopCase('2.column-walk', 'Walking into a column', ['column'],
    'Standing closer to a column than the near plane, its faces must be cut at the plane, not dropped or drawn whole'),
];
