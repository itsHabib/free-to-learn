// Lesson 6's new application: the issue count of an escape.asm warp,
// predicted from each lane's number of turns.
// Section: a heading in lessons/06.md.
import { learnerFile } from './transfer-common.mjs';

export const title = 'An escape loop on one warp';
const SECTION = 'An escape loop on one warp';
const bits = (m) => m.toString(2).padStart(8, '0');

export const cases = [
  {
    id: 't6.predict-issues',
    section: SECTION,
    run: async (gpu, ctx) => {
      const got = await learnerFile(ctx, 6, 'predictIssues');
      if (got.error) return { message: got.error };
      for (const { name, turns, mask, want } of ctx.fixture('transfer').t6) {
        const n = got.fn([...turns], mask);
        if (n !== want) {
          return { message: `predictIssues(turns, mask) must give the issues runWarp counts for escape.asm on one warp, skipping on, where lane k leaves after turns[k] turns and only the lanes in mask (bit k = lane k) run. Case "${name}": turns ${JSON.stringify(turns)}, mask ${bits(mask)}. It returned ${JSON.stringify(n)}; runWarp counts ${want}.` };
        }
      }
      return null;
    },
  },
];
