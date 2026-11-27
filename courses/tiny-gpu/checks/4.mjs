// Checks for unit 4: the browser's GPU as the oracle (Node side).
// Sections (headings in lessons/04.md):
//   Diffing two pictures
//   Nearest sampling
//   Repeat wrapping
//   Bilinear filtering
//   Textures in the pipeline
// The WebGL comparison itself runs in the browser (lab compare 4).
import { compareOwners, compareRgb } from './1.mjs';

export const title = "The browser's GPU as the oracle";

const show = (xs) => `[${xs.map((x) => +Number(x).toFixed(4)).join(', ')}]`;
const toImage = (im) => ({ w: im.w, h: im.h, ids: Int32Array.from(im.ids), rgba: Uint8Array.from(im.rgba) });

function texturesOf(fx) {
  const out = {};
  for (const [name, t] of Object.entries(fx.textures)) {
    out[name] = { w: t.w, h: t.h, data: Uint8Array.from(t.data) };
  }
  return out;
}

const RULES = {
  nearest: 'nearest sampling picks texel (floor(u * w), floor(v * h)), wrapped',
  linear: 'bilinear filtering steps back half a texel (x = u * w - 0.5), takes the four texels around (x, y), wrapped, and weights them by (1 - fx)(1 - fy), fx(1 - fy), (1 - fx)fy and fx fy',
};

function sampleCase(id, section, list, lead, tol) {
  return {
    id,
    section,
    uses: [['texture.mjs', 'sample']],
    run: async (gpu, ctx) => {
      const fx = ctx.fixture('4-sample');
      const textures = texturesOf(fx);
      for (const { tex, u, v, mode, want } of fx[list]) {
        const t = textures[tex];
        const got = gpu.texture.sample(t, u, v, mode);
        const ok = Array.isArray(got) && got.length === 4
          && got.every((x, k) => Math.abs(x - want[k]) <= tol);
        if (!ok) {
          return { message: `${lead}: ${RULES[mode]}, as RGBA floats 0..1. On the ${t.w} x ${t.h} texture "${tex}" at (u, v) = (${u}, ${v}) with '${mode}' it returned ${Array.isArray(got) ? show(got) : JSON.stringify(got)}, expected ${show(want)}.` };
        }
      }
      return null;
    },
  };
}

function diffCase(id, plant, focus) {
  return {
    id,
    section: 'Diffing two pictures',
    uses: [['diff.mjs', 'diffImages']],
    run: async (gpu, ctx) => {
      const p = ctx.fixture('4-diff')[plant];
      const got = gpu.diff.diffImages(toImage(p.mine), toImage(p.theirs), Uint8Array.from(p.ties));
      const keys = ['coverage', 'onTies', 'maxLevel', 'overOne'];
      const bad = !got || keys.some((k) => got[k] !== p.want[k]);
      if (!bad) return null;
      return { message: `diffImages counts pixels whose triangle ids differ (coverage), how many of those are marked as ties (onTies), and, only where both pictures drew the same triangle, the largest r, g or b difference (maxLevel) and the pixels more than 1 level off (overOne). ${focus} Planted in an 8 x 8 picture: ${p.what}. Yours returned ${JSON.stringify(got)}, expected ${JSON.stringify(p.want)}.` };
    },
  };
}

export const cases = [
  diffCase('4.diff-coverage', 'coverage', 'A colour difference on a pixel both pictures gave to the same triangle is not a coverage mismatch.'),
  diffCase('4.diff-ties', 'ties', 'onTies counts only coverage mismatches that sit on a marked tie pixel.'),
  diffCase('4.diff-levels', 'levels', 'Colour is not compared on pixels owned by different triangles, nor on background both left empty.'),
  sampleCase('4.nearest', 'Nearest sampling', 'nearest', 'Nearest sampling must be exact', 1e-12),
  sampleCase('4.wrap', 'Repeat wrapping', 'wrap', 'Outside 0..1, and at the edges for bilinear, texels must repeat: texel -1 is the last one, texel w the first', 1e-9),
  sampleCase('4.linear', 'Bilinear filtering', 'linear', 'Bilinear filtering must match the rule', 1e-9),
  {
    id: '4.courtyard',
    section: 'Textures in the pipeline',
    uses: [['texture.mjs', 'sample']],
    run: async (gpu, ctx) => {
      const fx = ctx.fixture('4-courtyard');
      for (const want of Object.values(fx.stops)) {
        const scene = ctx.scenes.courtyard({ width: fx.size, height: fx.size, stop: want.stop });
        const { image } = gpu.pipeline.render(scene, { stage: 4, filter: want.filter });
        const where = `camera stop "${want.stop}", ${fx.size} x ${fx.size}, stage 4, '${want.filter}' sampling`;
        const ids = compareOwners(`The textured courtyard (${where}) must keep unit 3's coverage`, image.ids, want, fx.size);
        if (ids) return { message: ids };
        const rgb = compareRgb(`The textured courtyard (${where}): colour = vertex colour times the texture`, image, want.rgb, 1);
        if (rgb) return { message: rgb };
      }
      return null;
    },
  },
];
