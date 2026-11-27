// Checks for unit 7: memory transactions, coalescing and the texture
// cache. Fixtures from tools/fixtures/u7.mjs.
// Sections (headings in lessons/07.md):
//   Counting transactions          7.segments
//   Only active lanes count        7.active-lanes
//   A small cache                  7.cache-hits
//   Which line leaves              7.cache-lru
//   A tiled texture layout         7.texel-address
//   Same picture, any layout       7.layout-picture
//   Coalescing the framebuffer     7.framebuffer-bytes
//   The turned floor               7.floor-misses
//   A layout for any direction     7.turned-wall


import { needsSupplied } from './supplied.mjs';

export const title = 'Memory transactions and the texture cache';

const js = (x) => JSON.stringify(x);
const bits = (m) => (m >>> 0).toString(2).padStart(8, '0');
const sameImage = (a, b) => {
  for (let i = 0; i < a.ids.length; i++) {
    if (a.ids[i] !== b.ids[i]) return { i, what: 'triangle' };
  }
  for (let i = 0; i < a.rgba.length; i++) {
    if (a.rgba[i] !== b.rgba[i]) return { i: i >> 2, what: 'colour' };
  }
  return null;
};
const at = (i, w) => `(${i % w}, ${Math.floor(i / w)})`;

function transactionCase(id, section, masked, rule) {
  return {
    id,
    section,
    uses: [['memory.mjs', 'transactions']],
    run: async (gpu, ctx) => {
      for (const t of ctx.fixture('7-memory').transactions) {
        if (t.masked !== masked) continue;
        const got = gpu.memory.transactions([...t.addr], t.mask);
        if (got === t.want) continue;
        return { message: `${rule} For "${t.name}": addresses ` +
          `${js(t.addr)} (lane 0 first), mask ${bits(t.mask)} (lane 0 ` +
          `is the last bit): transactions returned ${js(got)}, ` +
          `expected ${t.want}.` };
      }
      return null;
    },
  };
}

function cacheCase(id, section, list, rule) {
  return {
    id,
    section,
    uses: [['memory.mjs', 'TextureCache']],
    run: async (gpu, ctx) => {
      for (const c of ctx.fixture('7-memory')[list]) {
        const cache = new gpu.memory.TextureCache({ ...c.config });
        const returns = c.seq.map((a) => cache.access(a));
        const got = { hits: cache.hits, misses: cache.misses,
          bytes: cache.bytes };
        const k = returns.findIndex((r, n) => r !== c.returns[n]);
        if (k < 0 && js(got) === js(c.want)) continue;
        const cfg = `${c.config.sets} set${c.config.sets > 1 ? 's' : ''} ` +
          `of ${c.config.ways}`;
        const first = k < 0 ? '' : ` The first wrong answer is access ` +
          `${k + 1} (byte ${c.seq[k]}, line ${Math.floor(c.seq[k] / 32)}): ` +
          `it returned ${js(returns[k])}, expected ${c.returns[k]}.`;
        // A line touched before in the same set: whether it is still there depends on
        // which line left the set since, so the replacement order is the likely cause.
        const line = k < 0 ? null : Math.floor(c.seq[k] / 32);
        const again = k > 0 && c.seq.slice(0, k).some((a) => Math.floor(a / 32) === line);
        const evict = again && list !== 'lru' ? ` Line ${line} was read ` +
          'earlier, so the answer depends on which line left its set ' +
          'since: a full set evicts its least recently used line, and a ' +
          'hit makes a line the most recently used again.' : '';
        return { ...(evict ? { section: 'Which line leaves' } : {}),
          message: `${rule} "${c.name}", a cache of ${cfg} ` +
          `lines, accesses to bytes ${js(c.seq)}: yours counted ` +
          `${js(got)}, expected ${js(c.want)}.${first}${evict}` };
      }
      return null;
    },
  };
}

function render(gpu, scene, opts) {
  return gpu.pipeline.render(scene, { stage: 7, ...opts });
}

export const cases = [
  transactionCase('7.segments', 'Counting transactions', false,
    'A warp costs one transaction per distinct 32-byte segment ' +
    '(Math.floor(address / 32)) its lanes touch, not one per address.'),
  transactionCase('7.active-lanes', 'Only active lanes count', true,
    'Only lanes whose bit is set in the mask make a request; the ' +
    'others cost nothing.'),
  cacheCase('7.cache-hits', 'A small cache', 'cache',
    'access(addr) returns true and counts a hit only when line ' +
    'Math.floor(addr / 32) is already in set line % sets; otherwise ' +
    'it counts a miss and 32 bytes from memory and brings the line in.'),
  cacheCase('7.cache-lru', 'Which line leaves', 'lru',
    'A full set evicts its least recently used line: the one whose ' +
    'last access, hit or miss, is oldest.'),
  {
    id: '7.texel-address',
    section: 'A tiled texture layout',
    uses: [['memory.mjs', 'texelAddress']],
    run: async (gpu, ctx) => {
      for (const a of ctx.fixture('7-memory').addresses) {
        const got = gpu.memory.texelAddress({ ...a.tex }, a.x, a.y,
          a.layout);
        if (got === a.want) continue;
        const rule = a.layout === 'linear'
          ? "'linear' stores row after row, 4 bytes a texel"
          : "'tiled' stores blocks of 4 x 2 texels, 32 bytes each, the " +
            'blocks row after row; inside a block the bottom four ' +
            'texels come first';
        return { message: `${rule}. Texel (${a.x}, ${a.y}) of a ` +
          `${a.tex.w} x ${a.tex.h} texture, '${a.layout}': your ` +
          `texelAddress returned ${js(got)}, expected ${a.want}.` };
      }
      return null;
    },
  },
  {
    id: '7.layout-picture',
    section: 'Same picture, any layout',
    uses: [['memory.mjs', 'texelAddress']],
    run: async (gpu, ctx) => {
      const list = [ctx.scenes.floorScene({ turn: 90 }),
        ctx.scenes.courtyard({ width: 64, height: 64 })];
      for (const scene of list) {
        const before = gpu.pipeline.render(scene, { stage: 6 }).image;
        for (const layout of ['linear', 'tiled']) {
          const im = render(gpu, scene, { layout }).image;
          const d = sameImage(im, before);
          if (!d) continue;
          return { message: `Where a texture sits in memory must not ` +
            `change what it shows. "${scene.name}" at stage 7 with ` +
            `layout '${layout}' differs from stage 6 (no memory) at ` +
            `pixel ${at(d.i, im.w)} (${d.what}): every texel must be ` +
            'read from the address texelAddress gives for it.' };
        }
      }
      return null;
    },
  },
  {
    id: '7.framebuffer-bytes',
    section: 'Coalescing the framebuffer',
    uses: [['memory.mjs', 'transactions']],
    run: needsSupplied(async (gpu, ctx) => {
      const scene = ctx.scenes.courtyard({ width: 64, height: 64 });
      for (const want of ctx.fixture('7-scenes').framebuffer) {
        const { counts } = render(gpu, scene, { block: want.block });
        const got = { warps: counts.warps, depth: counts.bytes.depth,
          color: counts.bytes.color };
        const exp = { warps: want.warps, depth: want.depth,
          color: want.color };
        if (js(got) === js(exp)) continue;
        return { message: 'Per block, the pipeline counts the depth ' +
          'reads of the covered lanes and the depth and colour writes ' +
          'of the lanes that passed, each as transactions x 32 bytes. ' +
          `The courtyard, 64 x 64, ${want.block.join(' x ')} blocks: ` +
          `${js(got)}, expected ${js(exp)}.` };
      }
      return null;
    }),
  },
  {
    id: '7.floor-misses',
    section: 'The turned floor',
    uses: [['memory.mjs', 'TextureCache'], ['memory.mjs', 'texelAddress']],
    run: needsSupplied(async (gpu, ctx) => {
      const fx = ctx.fixture('7-scenes');
      for (const want of fx.floors) {
        const scene = ctx.scenes.floorScene({ turn: want.turn });
        const { counts } = render(gpu, scene, { layout: want.layout });
        const got = { hits: counts.cache.hits,
          misses: counts.cache.misses, tex: counts.bytes.tex };
        const exp = { hits: want.hits, misses: want.misses,
          tex: want.tex };
        if (js(got) === js(exp)) continue;
        return { message: `Each warp's texture reads go to the cache ` +
          `(${fx.cacheConfig.sets} sets of ${fx.cacheConfig.ways}) as ` +
          'the distinct lines they touch, first touched first. ' +
          `"${scene.name}", layout '${want.layout}': ${js(got)}, ` +
          `expected ${js(exp)}.` };
      }
      return null;
    }),
  },
  {
    id: '7.turned-wall',
    section: 'A layout for any direction',
    uses: [['memory.mjs', 'TextureCache'], ['memory.mjs', 'texelAddress']],
    run: needsSupplied(async (gpu, ctx) => {
      const fx = ctx.fixture('7-scenes');
      const scene = ctx.scenes.floorScene({ turn: 90 });
      const miss = (layout) =>
        render(gpu, scene, { layout }).counts.cache.misses;
      const linear = miss('linear');
      const tiled = miss('tiled');
      const ratio = linear / tiled;
      if (ratio >= fx.wallGate) return null;
      return { message: 'On the floor turned a quarter turn, row-major ' +
        `texels must miss at least ${fx.wallGate} times as often as ` +
        `tiled ones. Yours: ${linear} misses linear, ${tiled} tiled, ` +
        `ratio ${ratio.toFixed(2)} (measured ${fx.wall}).` };
    }),
  },
];
