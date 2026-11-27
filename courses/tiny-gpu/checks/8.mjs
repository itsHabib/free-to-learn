// Checks for unit 8: tiled rendering. Fixtures from
// tools/fixtures/u8.mjs; the picture checks are properties: drawn
// tile by tile, every scene must come out exactly as drawn whole.
// Sections (headings in lessons/08.md):
//   Binning triangles               8.bin-lists
//   A triangle bigger than a tile   8.bin-big-triangle
//   The fill rule at a tile edge    8.tile-edges
//   Same picture, tile by tile      8.course-scenes
//   Colour once, depth never        8.tiled-traffic
//   Counting the traffic            8.overdraw-ratio


import { needsSupplied } from './supplied.mjs';

export const title = 'Tiled rendering';

const js = (x) => JSON.stringify(x);
const total = (b) => b.depth + b.color + b.bins + b.tex;
const at = (i, w) => `(${i % w}, ${Math.floor(i / w)})`;

function binCase(id, section, list, rule) {
  return {
    id,
    section,
    uses: [['tiles.mjs', 'bin']],
    run: async (gpu, ctx) => {
      for (const c of ctx.fixture('8-bins')[list]) {
        let got;
        try {
          got = gpu.tiles.bin(structuredClone(c.tris), c.W, c.H, c.size);
        } catch (e) {
          if (/not written yet/.test(e.message)) throw e;
          return { message: `bin threw on "${c.name}" (${c.W} x ${c.H}, ` +
            `tiles of ${c.size}): ${e.message}. A screen this size has ` +
            `${Math.ceil(c.W / c.size)} x ${Math.ceil(c.H / c.size)} ` +
            'tiles: round the tile counts up, so a partial tile at the ' +
            'right or top edge still has a list.' };
        }
        const tilesX = Math.ceil(c.W / c.size);
        const n = Array.isArray(got) ? got.length : -1;
        if (n !== c.want.length) {
          return { message: `bin returns one list per tile: a ${c.W} x ` +
            `${c.H} screen in ${c.size}-pixel tiles has ` +
            `${c.want.length}; for "${c.name}" yours returned ` +
            `${n < 0 ? js(got) : n}.` };
        }
        for (let t = 0; t < n; t++) {
          if (js(got[t]) === js(c.want[t])) continue;
          return { message: `${rule} "${c.name}" (${c.W} x ${c.H}, ` +
            `tiles of ${c.size}; triangles in subpixels ` +
            `${js(c.tris)}): tile (${t % tilesX}, ` +
            `${Math.floor(t / tilesX)}) got ${js(got[t])}, expected ` +
            `${js(c.want[t])}.` };
        }
      }
      return null;
    },
  };
}

// The text of a difference, carrying the pixel it is at (x, y) as .at.
const where = (i, w, text) => Object.assign(new String(text), { at: [i % w, Math.floor(i / w)] });

// Draws a scene whole (immediate) and tile by tile with the learner's
// code; returns null or what differs (a string; .at, the pixel, when there is one).
function compareModes(gpu, scene) {
  const a = gpu.pipeline.render(scene, { stage: 8 });
  const b = gpu.pipeline.render(scene, { stage: 8, mode: 'tiled' });
  const { ids, rgba, w } = a.image;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== b.image.ids[i]) {
      const word = (v) => (v < 0 ? 'no triangle' : `triangle ${v}`);
      return where(i, w, `pixel ${at(i, w)} (tile (${Math.floor((i % w) / 16)}, ` +
        `${Math.floor(Math.floor(i / w) / 16)})) shows ` +
        `${word(b.image.ids[i])} tiled, ${word(ids[i])} drawn whole`);
    }
  }
  for (let i = 0; i < rgba.length; i++) {
    if (rgba[i] !== b.image.rgba[i]) {
      return where(i >> 2, w, `pixel ${at(i >> 2, w)} has colour ` +
        `${js([...b.image.rgba.subarray(i & ~3, (i & ~3) + 3)])} tiled, ` +
        `${js([...rgba.subarray(i & ~3, (i & ~3) + 3)])} drawn whole`);
    }
  }
  for (const k of ['shaded', 'warps', 'issues']) {
    if (a.counts[k] !== b.counts[k]) {
      return `counts.${k} is ${b.counts[k]} tiled, ${a.counts[k]} ` +
        'drawn whole: each tile shades the same fragments in the ' +
        'same order';
    }
  }
  return null;
}

function sceneList(ctx) {
  const s = ctx.scenes;
  const list = [s.courtyard()];
  for (const stop of Object.keys(s.courtyardStops)) {
    list.push(s.courtyard({ width: 64, height: 64, stop }));
  }
  list.push(...Object.values(s.tieScenes()), s.colourTriangle(),
    s.perspectiveTriangle(), s.depthPair(), s.coplanarPair(),
    s.overdrawScene(), s.floorScene({ turn: 90 }), s.hallScene(1));
  return list;
}

export const cases = [
  binCase('8.bin-lists', 'Binning triangles', 'lists',
    'A triangle goes into every tile its pixel bounding box overlaps: ' +
    'the box rasterize walks (floor of the smallest x and y, ceil of ' +
    'the largest, in pixels), clamped to the screen, and the lists ' +
    'keep draw order.'),
  binCase('8.bin-big-triangle', 'A triangle bigger than a tile', 'big',
    'A triangle can cover a tile that none of its corners is in: bin ' +
    'by the bounding box, not by where the corners fall.'),
  {
    id: '8.tile-edges',
    section: 'The fill rule at a tile edge',
    uses: [['tiles.mjs', 'renderTile']],
    run: async (gpu, ctx) => {
      const list = [1, 2, 3, 4, 5, 6].map((n) =>
        ctx.scenes.tileBorderScene(n));
      list.push(...[3, 8].map((n) => ctx.scenes.mesh2d(n)));
      for (const scene of list) {
        const bad = compareModes(gpu, scene);
        if (bad) {
          // A first difference away from every tile edge has another cause than the
          // scissor: most often a tile that keeps the last tile's depths.
          const inside = bad.at && ![0, 15].includes(bad.at[0] % 16)
            && ![0, 15].includes(bad.at[1] % 16);
          const clear = inside ? ' That pixel is inside its tile, away ' +
            'from the tile\'s edges: does each tile start from depth 1 ' +
            '(chip.depth.fill(1)) and no triangle before it draws its ' +
            'list?' : '';
          return { ...(inside ? { section: 'Same picture, tile by tile' } : {}),
            message: 'A tile draws only its own pixels, x0 <= x ' +
            '< x0 + 16 and the same in y, and the fill rule decides the ' +
            `pixels on its edges as it does anywhere. "${scene.name}" ` +
            `(triangles across tile edges): ${bad}.${clear}` };
        }
      }
      return null;
    },
  },
  {
    id: '8.course-scenes',
    section: 'Same picture, tile by tile',
    uses: [['tiles.mjs', 'renderTile']],
    run: async (gpu, ctx) => {
      for (const scene of sceneList(ctx)) {
        const bad = compareModes(gpu, scene);
        if (bad) {
          return { message: 'Drawn tile by tile, a scene must come out ' +
            'exactly as drawn whole: each tile starts with depth 1, no ' +
            'triangle and the clear colour, and draws its list in ' +
            `order. "${scene.name}" (${scene.width} x ${scene.height}): ` +
            `${bad}.` };
        }
      }
      return null;
    },
  },
  {
    id: '8.tiled-traffic',
    section: 'Colour once, depth never',
    uses: [['tiles.mjs', 'bin'], ['tiles.mjs', 'renderTile']],
    run: needsSupplied(async (gpu, ctx) => {
      const want = ctx.fixture('8-traffic').courtyard;
      const scene = ctx.scenes.courtyard({ width: want.size,
        height: want.size });
      const { bytes } = gpu.pipeline.render(scene,
        { stage: 8, mode: 'tiled' }).counts;
      const got = { depth: bytes.depth, color: bytes.color,
        bins: bytes.bins };
      const exp = { depth: want.bytes.depth, color: want.bytes.color,
        bins: want.bytes.bins };
      if (js(got) === js(exp)) return null;
      return { message: 'Tiled, the framebuffer gets each pixel\'s colour ' +
        `once (${want.size} x ${want.size} x 4 bytes), depth never ` +
        'leaves the chip, and binning costs what the bin lists say. ' +
        `The courtyard, ${want.size} x ${want.size}: bytes ${js(got)}, ` +
        `expected ${js(exp)}.` };
    }),
  },
  {
    id: '8.overdraw-ratio',
    section: 'Counting the traffic',
    uses: [['tiles.mjs', 'bin'], ['tiles.mjs', 'renderTile']],
    run: needsSupplied(async (gpu, ctx) => {
      const fx = ctx.fixture('8-traffic').overdraw;
      const scene = ctx.scenes.overdrawScene();
      const a = gpu.pipeline.render(scene, { stage: 8 }).counts.bytes;
      const b = gpu.pipeline.render(scene,
        { stage: 8, mode: 'tiled' }).counts.bytes;
      const ratio = total(a) / total(b);
      if (ratio >= fx.gate) return null;
      return { message: 'On the overdraw scene, about six layers deep, ' +
        `the immediate renderer must move at least ${fx.gate} times the ` +
        `bytes of the tiled one. Immediate ${total(a)} bytes, tiled ` +
        `${total(b)} (${js(b)}): ratio ${ratio.toFixed(2)} (measured ` +
        `${fx.measured}).` };
    }),
  },
];
