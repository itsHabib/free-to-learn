// Lesson 1's new application: which triangle owns a pixel whose
// centre is a vertex shared by several triangles.
// Section: a heading in lessons/01.md.
import { learnerFile } from './transfer-common.mjs';

export const title = 'A vertex shared by six triangles';
const SECTION = 'A vertex shared by six triangles';

const showPts = (pts) => pts.map((p) => `[${p}]`).join(' ');

export const cases = [
  {
    id: 't1.vertex-owner',
    section: SECTION,
    run: async (gpu, ctx) => {
      const got = await learnerFile(ctx, 1, 'vertexOwner');
      if (got.error) return { message: got.error };
      for (const { name, c, ring, want } of ctx.fixture('transfer').t1) {
        const k = got.fn(c.slice(), ring.map((p) => p.slice()));
        if (k !== want) {
          return { message: `vertexOwner(c, ring) must return the index k of the one triangle (c, ring[k], ring[k + 1]) that owns the pixel whose centre is c, by the tie rule: the nudge right by e and up by e * e. Fan "${name}": c = [${c}], ring = ${showPts(ring)} (subpixels, counter-clockwise). It returned ${JSON.stringify(k)}, expected ${want}.` };
        }
      }
      return null;
    },
  },
];
