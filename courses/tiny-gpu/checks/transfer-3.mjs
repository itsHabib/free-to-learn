// Lesson 3's new application: depth in front of the eye, for fog.
// Section: a heading in lessons/03.md.
import { learnerFile } from './transfer-common.mjs';

export const title = 'Fog from depth';
const SECTION = 'Fog from depth';

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const r6 = (x) => +Number(x).toPrecision(6);

export const cases = [
  {
    id: 't3.fog-depth',
    section: SECTION,
    run: async (gpu, ctx) => {
      const got = await learnerFile(ctx, 3, 'fogDepth');
      if (got.error) return { message: got.error };
      for (const { name, v, w, want } of ctx.fixture('transfer').t3) {
        const d = got.fn(structuredClone(v), [...w]);
        if (typeof d !== 'number' || !close(d, want)) {
          const sum = w[0] + w[1] + w[2];
          const screen = w.reduce((s, x, i) => s + (x / sum) / v[i].invW, 0);
          const hint = typeof d === 'number' && close(d, screen)
            ? ' That is w blended with the screen weights, which bends with distance the way screen-space colour did.'
            : '';
          return { message: `fogDepth(v, w) must return the distance in front of the eye (clip w) at the pixel whose edge values are w. Case "${name}": w = [${w}], vertex 1/w = [${v.map((x) => r6(x.invW))}]. It returned ${JSON.stringify(d)}, expected ${r6(want)}.${hint}` };
        }
      }
      return null;
    },
  },
];
