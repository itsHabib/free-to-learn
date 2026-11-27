// Lesson 8's new application: 20,000 one-pixel triangles, immediate
// against tiled at two tile sizes, binning counted.
// Section: a heading in lessons/08.md.
import { learnerFile } from './transfer-common.mjs';

export const title = 'Twenty thousand tiny triangles';
const SECTION = 'Twenty thousand tiny triangles';

export const cases = [
  {
    id: 't8.dust-bytes',
    section: SECTION,
    run: async (gpu, ctx) => {
      const got = await learnerFile(ctx, 8, 'dustBytes');
      if (got.error) return { message: got.error };
      const want = ctx.fixture('transfer').t8;
      const r = got.fn();
      for (const k of ['immediate', 'tiled16', 'tiled64']) {
        if (!r || r[k] !== want[k]) {
          return { message: `dustBytes() must return the bytes moved for dustScene(1) at stage 8, counting depth, colour, bins and textures: { immediate, tiled16, tiled64 }, the last two with tiles of 16 and 64 pixels. Its ${k} is ${JSON.stringify(r?.[k])}, expected ${want[k]}.` };
        }
      }
      return null;
    },
  },
];
