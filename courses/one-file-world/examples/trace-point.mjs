// Follow one point of the ground from the world to a pixel, with stage 1's own camera functions.
// Run from the course folder: node examples/trace-point.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// Load the "(pure)" regions of the stage file, as the lab's checks do.
const stage = join(import.meta.dirname, '..', 'stages', 'world-01.html');
const html = readFileSync(stage, 'utf8');
const regions = html.matchAll(
  /\/\/ region: (.+\(pure\))\n([\s\S]*?)\/\/ endregion: \1/g,
);
const world = vm.createContext({});
vm.runInContext([...regions].map((m) => m[2]).join('\n'), world);
const { perspective, viewMatrix, mul4 } = world;

// region: trace
const width = 390;
const height = 844;
const aspect = width / height;
const tanY = (0.52 / Math.sqrt(aspect)) * 0.88; // the frame region's lens, upright
const eye = [0, 60, -420]; // the start pose: yaw 0, pitch -0.1
const view = viewMatrix(new Float32Array(16), eye, 0, -0.1, [], [], []);
const proj = perspective(new Float32Array(16), tanY, aspect, 0.6, 20000);

// m times [x, y, z, w], for 16 numbers stored column by column
const times = (m, [x, y, z, w]) =>
  [0, 1, 2, 3].map(
    (r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r] * w,
  );

const point = [20, 1, 0]; // where two ruled lines cross
const seen = times(view, [...point, 1]); // camera at 0, looking down -z
const clip = times(proj, seen); // inside the view: -w <= x, y, z <= w
const ndc = clip.slice(0, 3).map((v) => v / clip[3]); // each -1..1
const pixel = [((ndc[0] + 1) / 2) * width, ((1 - ndc[1]) / 2) * height];
const once = times(mul4(new Float32Array(16), proj, view), [...point, 1]);
// endregion: trace

const show = (v) => v.map((x) => x.toFixed(2)).join(', ');
console.log(`world point   ${show(point)}`);
console.log(`view space    ${show(seen)}`);
console.log(`clip space    ${show(clip)}`);
console.log(`divided by w  ${show(ndc)}`);
console.log(`pixel         ${show(pixel)}`);
console.log(`mul4 at once  ${show(once)}`);
