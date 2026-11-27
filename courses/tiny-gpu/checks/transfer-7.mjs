// Lesson 7's new application: a vertical blur's texture reads
// through the cache, row-major against tiled.
// Section: a heading in lessons/07.md.
import { learnerFile } from './transfer-common.mjs';

export const title = 'A vertical blur';
const SECTION = 'A vertical blur';

export const cases = [
  {
    id: 't7.blur-misses',
    section: SECTION,
    run: async (gpu, ctx) => {
      const got = await learnerFile(ctx, 7, 'blurMisses');
      if (got.error) return { message: got.error };
      for (const { w, h, want } of ctx.fixture('transfer').t7) {
        for (const layout of ['linear', 'tiled']) {
          const r = got.fn({ w, h }, layout);
          const exp = want[layout];
          if (!r || r.misses !== exp.misses || r.hits !== exp.hits) {
            return { message: `blurMisses(tex, layout) must count the cache misses and hits of a vertical blur over a ${w} x ${h} texture, one texel per pixel: each pixel reads the texel below, its own and the one above (rows wrap); 4 x 2 warps from the bottom row of blocks, left to right; per warp, each distinct cache line its reads touch is one access, first touched first, to a cache of CACHE's size. For layout '${layout}' it returned ${JSON.stringify(r)}, expected ${JSON.stringify(exp)}.` };
          }
        }
      }
      return null;
    },
  },
];
