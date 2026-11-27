// Lesson 2's new application: clipping at the far plane.
// Section: a heading in lessons/02.md.
import { learnerFile } from './transfer-common.mjs';

export const title = 'A far plane';
const SECTION = 'A far plane';

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const show = (xs) => `[${xs.map((x) => +Number(x).toPrecision(6)).join(', ')}]`;
const showV = (v) => (v && v.c ? `{ c: ${show(v.c)}, a: ${show(v.a ?? [])} }` : JSON.stringify(v));
const showTris = (t) => (Array.isArray(t)
  ? `${t.length} triangle${t.length === 1 ? '' : 's'}${t.length ? `: ${t.map((x) => `(${x.map(showV).join(', ')})`).join('; ')}` : ''}`
  : JSON.stringify(t));
const same = (g, w) => g && Array.isArray(g.c) && Array.isArray(g.a)
  && g.c.length === 4 && g.a.length === w.a.length
  && g.c.every((x, i) => close(x, w.c[i])) && g.a.every((x, i) => close(x, w.a[i]));

export const cases = [
  {
    id: 't2.clip-far',
    section: SECTION,
    run: async (gpu, ctx) => {
      const got = await learnerFile(ctx, 2, 'clipFar');
      if (got.error) return { message: got.error };
      for (const { name, tri, want } of ctx.fixture('transfer').t2) {
        const out = got.fn(structuredClone(tri));
        const ok = Array.isArray(out) && out.length === want.length
          && out.every((t, k) => Array.isArray(t) && t.length === 3
            && t.every((v, j) => same(v, want[k][j])));
        if (!ok) {
          return { message: `clipFar keeps the part of a triangle on the eye's side of the far plane z = w, with the same walk (v0 -> v1 -> v2 -> v0) and the same fan as clipNear. Case "${name}", input (${tri.map(showV).join(', ')}): it returned ${showTris(out)}; expected ${showTris(want)}.` };
        }
      }
      return null;
    },
  },
];
