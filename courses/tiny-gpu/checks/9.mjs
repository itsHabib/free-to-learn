// Checks for unit 9, the capstone: halls drawn with
// render(scene, { stage: 9, mode: 'visible' }), your renderVisible.
// The fixture holds no picture: per 16 x 16 tile, a hash of the
// triangle ids and the sum of each colour channel, for two practice
// halls and five halls the course never shows.
// Sections (headings in lessons/09.md):
//   Two halls to practise on       9.practice-halls
//   Five halls you have not seen   9.unseen-halls
//   Colour only from shadeWarp     9.colour-from-warps
//   The shading budget             9.shading-budget
//   The memory budget              9.memory-budget
import { createHash } from 'node:crypto';
import { needsSupplied } from './supplied.mjs';

export const title = 'Capstone: a hall you have not seen';

const total = (b) => b.depth + b.color + b.bins + b.tex;
const n = (x) => x.toLocaleString('en');

function tileHash(ids, W, H, T, tx, ty) {
  const out = [];
  for (let y = ty * T; y < Math.min(H, ty * T + T); y++) {
    for (let x = tx * T; x < Math.min(W, tx * T + T); x++) {
      out.push(ids[y * W + x]);
    }
  }
  const bytes = new Uint8Array(Int32Array.from(out).buffer);
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

function tileSums(rgba, W, H, T, tx, ty) {
  const s = [0, 0, 0];
  for (let y = ty * T; y < Math.min(H, ty * T + T); y++) {
    for (let x = tx * T; x < Math.min(W, tx * T + T); x++) {
      for (let c = 0; c < 3; c++) s[c] += rgba[(y * W + x) * 4 + c];
    }
  }
  return s;
}

// One render per hall per run of the checks.
const drawn = new WeakMap();
function draw(gpu, ctx, seed) {
  if (!drawn.has(gpu)) drawn.set(gpu, new Map());
  const memo = drawn.get(gpu);
  if (!memo.has(seed)) {
    const scene = ctx.scenes.hallScene(seed);
    memo.set(seed, { scene, out: gpu.pipeline.render(scene,
      { stage: 9, mode: 'visible' }) });
  }
  return memo.get(seed);
}

function fingerprints(list) {
  return async (gpu, ctx) => {
    const fx = ctx.fixture('9-halls');
    const T = fx.tile;
    for (const want of fx[list]) {
      const { scene, out } = draw(gpu, ctx, want.seed);
      const { w: W, h: H, ids, rgba } = out.image;
      const tilesX = Math.ceil(W / T);
      for (let n = 0; n < want.tiles.length; n++) {
        const tx = n % tilesX;
        const ty = Math.floor(n / tilesX);
        const where = `"${scene.name}", tile (${tx}, ${ty}) (pixels x ` +
          `${tx * T} to ${Math.min(W, tx * T + T) - 1}, y ${ty * T} to ` +
          `${Math.min(H, ty * T + T) - 1}, y up)`;
        const [hash, ...sums] = want.tiles[n];
        if (tileHash(ids, W, H, T, tx, ty) !== hash) {
          return { message: 'Every pixel must show the nearest triangle ' +
            'that covers it (depth LESS, the first drawn winning a tie), ' +
            `as unit 8's renderer finds it. In ${where} the triangle ` +
            'ids differ from the expected picture. Compare that tile ' +
            "with unit 8's tiled renderer on the same hall." };
        }
        const got = tileSums(rgba, W, H, T, tx, ty);
        const c = [0, 1, 2].find((k) =>
          Math.abs(got[k] - sums[k]) > fx.colourTolerance);
        if (c !== undefined) {
          return { message: `In ${where} the triangles are right but ` +
            `the ${['red', 'green', 'blue'][c]} levels add up to ` +
            `${got[c]}; expected ${sums[c]}, within ` +
            `${fx.colourTolerance}. Each pixel's colour is the one ` +
            'shadeWarp returned for its lane.' };
        }
      }
    }
    return null;
  };
}

const allSeeds = (fx) => [...fx.practice, ...fx.checks];

export const cases = [
  {
    id: '9.practice-halls',
    section: 'Two halls to practise on',
    uses: [['capstone.mjs', 'renderVisible']],
    run: needsSupplied(fingerprints('practice')),
  },
  {
    id: '9.unseen-halls',
    section: 'Five halls you have not seen',
    uses: [['capstone.mjs', 'renderVisible']],
    run: needsSupplied(fingerprints('checks')),
  },
  {
    id: '9.colour-from-warps',
    section: 'Colour only from shadeWarp',
    uses: [['capstone.mjs', 'renderVisible']],
    run: needsSupplied(async (gpu, ctx) => {
      for (const want of allSeeds(ctx.fixture('9-halls'))) {
        const { scene, out } = draw(gpu, ctx, want.seed);
        const { w, ids, rgba } = out.image;
        const p = out.provenance;
        for (let i = 0; i < ids.length; i++) {
          if (ids[i] < 0) continue;
          const by = p.ids[i];
          const same = by === ids[i] && [0, 1, 2, 3].every((k) =>
            rgba[i * 4 + k] === p.rgba[i * 4 + k]);
          if (same) continue;
          const xy = `(${i % w}, ${Math.floor(i / w)})`;
          const why = by < 0 ? 'no shadeWarp call shaded that pixel'
            : by !== ids[i] ? `the last shadeWarp call there shaded ` +
              `triangle ${by}`
            : `shadeWarp returned ${[...p.rgba.subarray(i * 4,
              i * 4 + 3)]} there, the picture holds ` +
              `${[...rgba.subarray(i * 4, i * 4 + 3)]}`;
          return { message: 'Every visible pixel\'s colour must come ' +
            'from a shadeWarp call for the triangle it shows. ' +
            `"${scene.name}", pixel ${xy} shows triangle ${ids[i]}, ` +
            `but ${why}.` };
        }
      }
      return null;
    }),
  },
  {
    id: '9.shading-budget',
    section: 'The shading budget',
    uses: [['capstone.mjs', 'renderVisible']],
    run: needsSupplied(async (gpu, ctx) => {
      const fx = ctx.fixture('9-halls');
      const rows = [];
      let over = null;
      for (const want of allSeeds(fx)) {
        const { scene, out } = draw(gpu, ctx, want.seed);
        const budget = Math.floor(fx.shadingBudget * want.visibleWarps);
        rows.push(`"${scene.name}": ${n(out.counts.warps)} warps, budget ` +
          `${n(budget)} (${want.visibleWarps === 1 ? '1 visible warp' : `${n(want.visibleWarps)} visible warps`})`);
        if (out.counts.warps <= budget || over) continue;
        over = `"${scene.name}" launched ` +
          `${out.counts.warps} warps; the budget is ${budget}, ` +
          `${fx.shadingBudget} x its ${want.visibleWarps} visible warps ` +
          '(for each 4 x 2 block, the number of different triangles ' +
          'seen in it, added up). That is ' +
          `${(out.counts.warps / want.visibleWarps).toFixed(2)} warps ` +
          'per visible warp.';
      }
      return over ? { message: `${over}\nEvery hall: ${rows.join('; ')}.` }
        : { pass: true, note: rows.join('\n') };
    }),
  },
  {
    id: '9.memory-budget',
    section: 'The memory budget',
    uses: [['capstone.mjs', 'renderVisible']],
    run: needsSupplied(async (gpu, ctx) => {
      const fx = ctx.fixture('9-halls');
      const rows = [];
      let over = null;
      for (const want of allSeeds(fx)) {
        const { scene, out } = draw(gpu, ctx, want.seed);
        const bytes = total(out.counts.bytes);
        const budget = fx.memoryBudget * want.tiledBytes;
        rows.push(`"${scene.name}": ${n(bytes)} bytes, budget ${n(budget)}`);
        if (bytes <= budget || over) continue;
        over = `"${scene.name}" moved ${bytes} bytes ` +
          `(${JSON.stringify(out.counts.bytes)}); the budget is ` +
          `${budget}, what unit 8's tiled renderer moves on this hall.`;
      }
      return over ? { message: `${over}\nEvery hall: ${rows.join('; ')}.` }
        : { pass: true, note: `${rows.join('\n')}\n(the budget is what unit 8's tiled renderer moves on each hall)` };
    }),
  },
];
