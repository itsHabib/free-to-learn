// Checks for unit 3: perspective-correct interpolation and depth.
// Sections (headings in lessons/03.md):
//   Smooth colour
//   Perspective-correct interpolation
//   The depth buffer
//   Equal depth keeps the first draw
//   Occlusion in the courtyard
import { compareOwners, compareRgb, fmt } from './1.mjs';

export const title = 'Perspective-correct interpolation and depth';

const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const show = (xs) => `[${xs.map((x) => +Number(x).toPrecision(6)).join(', ')}]`;
const usesInterp = [['interp.mjs', 'interpolate'], ['interp.mjs', 'depthTest']];

function flatScene(gpu, ctx, make) {
  const scene = ctx.scenes[make]();
  const want = ctx.fixture('3-scenes').flat[scene.name];
  const { image } = gpu.pipeline.render(scene, { stage: 3 });
  return { scene, want, image };
}

function colourCase(id, section, make, why) {
  return {
    id,
    section,
    uses: usesInterp,
    run: async (gpu, ctx) => {
      const { scene, want, image } = flatScene(gpu, ctx, make);
      const cov = compareOwners(`The "${scene.name}" triangle's coverage changed`, image.ids, want, scene.width);
      if (cov) return { message: cov };
      const diff = compareRgb(`${why} ("${scene.name}", stage 3, colour = round(c * 255))`, image, want.rgb, 0);
      return diff ? { message: diff } : null;
    },
  };
}

// colour: when the nearest triangle owns every pixel but colours differ, the cause is
// interpolation, not occlusion; { section, lead } says so in the message.
function stopCase(id, section, stops, why, colour = null) {
  return {
    id,
    section,
    uses: usesInterp,
    run: async (gpu, ctx) => {
      const fx = ctx.fixture('3-scenes');
      for (const stop of stops) {
        const scene = ctx.scenes.courtyard({ width: fx.size, height: fx.size, stop });
        const { image } = gpu.pipeline.render(scene, { stage: 3 });
        const where = `camera stop "${stop}", ${fx.size} x ${fx.size}, stage 3`;
        const ids = compareOwners(`${why} (${where}): the nearest triangle must own each pixel`, image.ids, fx.stops[stop], fx.size);
        if (ids) return { message: ids };
        const rgb = compareRgb(`${colour ? colour.lead : why} (${where}): colour`, image, fx.stops[stop].rgb, 1);
        if (rgb) return colour ? { section: colour.section, message: rgb } : { message: rgb };
      }
      return null;
    },
  };
}

export const cases = [
  {
    id: '3.interp-values',
    section: 'Perspective-correct interpolation',
    uses: [['interp.mjs', 'interpolate']],
    run: async (gpu, ctx) => {
      for (const { name, v, w, want } of ctx.fixture('3-interp').cases) {
        const got = gpu.interp.interpolate(structuredClone(v), [...w], v[0].a.length);
        if (!got || typeof got.z !== 'number' || !Array.isArray(got.attrs)) {
          return { message: `interpolate(v, w, n) must return { z, attrs }. For the case "${name}" it returned ${JSON.stringify(got)}.` };
        }
        if (!close(got.z, want.z, 1e-12)) {
          return { message: `Depth is z / w, which is linear on the screen: interpolate it with the screen weights (each edge value divided by the sum of the three), with no 1/w correction. Case "${name}" (edge values [${w}], vertex z ${show(v.map((x) => x.z))}, clip 1/w ${show(v.map((x) => x.invW))}): z = ${got.z}, expected ${want.z}.` };
        }
        const ok = got.attrs.length === want.attrs.length
          && got.attrs.every((x, k) => close(x, want.attrs[k], 1e-9));
        if (!ok) {
          return { message: `Attributes must be interpolated perspective-correctly: weight each vertex by b_i * (1/w_i), sum, and divide by the sum of those weights. Case "${name}" (edge values [${w}], clip 1/w ${show(v.map((x) => x.invW))}): attrs = ${show(got.attrs)}, expected ${show(want.attrs)}.` };
        }
      }
      return null;
    },
  },
  colourCase('3.colour-affine', 'Smooth colour', 'colourTriangle',
    'With w = 1 at every corner, colour must blend by the screen weights'),
  colourCase('3.colour-perspective', 'Perspective-correct interpolation', 'perspectiveTriangle',
    'With w = 1, 6 and 2.5 at the corners, colour must be interpolated perspective-correctly'),
  stopCase('3.floor-straight', 'Perspective-correct interpolation', ['low'],
    'The checker floor seen from low down must keep straight lines'),
  {
    id: '3.depth-test',
    section: 'The depth buffer',
    uses: [['interp.mjs', 'depthTest']],
    run: async (gpu) => {
      const depth = new Float32Array([1, 0.5, 0.25]);
      const steps = [
        [0, 0.75, true, 'nearer than the cleared 1'],
        [1, 0.5, false, 'exactly equal to the stored 0.5'],
        [2, 0.375, false, 'further than the stored 0.25'],
        [0, 0.625, true, 'nearer than the 0.75 just stored'],
      ];
      for (const [i, z, want, why] of steps) {
        const before = depth[i];
        const got = gpu.interp.depthTest(depth, i, z);
        const stored = depth[i];
        const wantStored = want ? Math.fround(z) : before;
        if (got !== want || stored !== wantStored) {
          return { message: `depthTest(depth, i, z) is LESS: when z is strictly nearer than depth[i] it stores z and returns true; otherwise it returns false and leaves depth[i] alone. With depth[${i}] = ${before} and z = ${z} (${why}) it returned ${JSON.stringify(got)} and left depth[${i}] = ${stored}; expected ${want} and ${wantStored}.` };
        }
      }
      return null;
    },
  },
  {
    id: '3.depth-float32',
    section: 'Equal depth keeps the first draw',
    uses: [['interp.mjs', 'depthTest']],
    run: async (gpu) => {
      const depth = new Float32Array([1]);
      const first = gpu.interp.depthTest(depth, 0, 0.1);
      const second = gpu.interp.depthTest(depth, 0, 0.1);
      if (first === true && second === false) return null;
      return { message: `The depth buffer holds float32 numbers, so compare Math.fround(z) with what is stored. Drawing z = 0.1 twice on a cleared buffer: the first call must return true and the second false (0.1 is stored as ${Math.fround(0.1)}, a little more than 0.1, so a float64 compare lets the second draw win). Yours returned ${JSON.stringify(first)} then ${JSON.stringify(second)}.` };
    },
  },
  {
    id: '3.depth-pair',
    section: 'The depth buffer',
    uses: usesInterp,
    run: async (gpu, ctx) => {
      const { scene, want, image } = flatScene(gpu, ctx, 'depthPair');
      const diff = compareOwners('Where two triangles pass through each other, the nearer one (smaller z) must own each pixel ("depth-pair", red drawn first, green second)', image.ids, want, scene.width);
      return diff ? { message: diff } : null;
    },
  },
  {
    id: '3.equal-depth',
    section: 'Equal depth keeps the first draw',
    uses: usesInterp,
    run: async (gpu, ctx) => {
      const { scene, want, image } = flatScene(gpu, ctx, 'coplanarPair');
      const second = image.ids.filter((id) => id === 1).length;
      if (second) {
        return { message: `With LESS, a triangle drawn again at exactly the same depth must lose: "coplanar-pair" draws one triangle twice, red then green, and red must keep all ${fmt(want.covered)} pixels. Green won ${fmt(second)} of them.` };
      }
      const diff = compareOwners('The "coplanar-pair" picture', image.ids, want, scene.width);
      return diff ? { message: diff } : null;
    },
  },
  stopCase('3.courtyard', 'Occlusion in the courtyard', ['lamp-behind', 'gate'],
    'The courtyard with a depth buffer: a column in front of the lamp must hide it whatever the draw order',
    { section: 'Perspective-correct interpolation', lead: 'The nearest triangle owns every pixel, so occlusion is right, but the colours differ: look at interpolation, the perspective-correct blend of each corner\'s colour' }),
];
