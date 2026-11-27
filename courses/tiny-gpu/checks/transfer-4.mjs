// Lesson 4's new application: which corners land elsewhere when a
// second GPU snaps to another grid.
// Section: a heading in lessons/04.md.
import { learnerFile } from './transfer-common.mjs';

export const title = 'A second GPU';
const SECTION = 'A second GPU';

export const cases = [
  {
    id: 't4.moved-vertices',
    section: SECTION,
    run: async (gpu, ctx) => {
      const got = await learnerFile(ctx, 4, 'movedVertices');
      if (got.error) return { message: got.error };
      for (const { name, points, from, to, want } of ctx.fixture('transfer').t4) {
        const r = got.fn(points.map((p) => p.slice()), from, to);
        if (JSON.stringify(r) !== JSON.stringify(want)) {
          return { message: `movedVertices(points, fromBits, toBits) must list, in order, the indices of the corners whose x or y snaps to a different place on a grid of 2 ** toBits steps a pixel than on 2 ** fromBits, each snapped with Math.round as snap2 does. Case "${name}" (from ${from} to ${to} bits), points ${JSON.stringify(points)}: it returned ${JSON.stringify(r)}, expected ${JSON.stringify(want)}.` };
        }
      }
      return null;
    },
  },
];
