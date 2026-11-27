// One point in front of the eye and one behind it, through your own
// transform and toWindow, then a triangle through your clipNear.
// Run from the course folder: node examples/clip-trace.mjs [FOLDER]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Your project's code: ./project, or the folder you name.
const dir = process.argv[2] ?? 'project';
const load = (f) => import(pathToFileURL(resolve(dir, 'gpu', f)).href);
const { perspective } = await load('matrix.mjs');
const { clipNear, toWindow, transform } = await load('vertex.mjs');

const W = 160;
const H = 120;
const SUB = 16;
const fixed = (xs) => xs.map((x) => x.toFixed(3)).join(', ');

// region: trace
// The camera at the origin, looking down -z: camera space is world
// space, so the perspective matrix is all there is.
const m = perspective(60, W / H, 0.1, 100);

function trace(name, p) {
  const c = transform(m, p);
  const win = toWindow(c, W, H);
  console.log(`${name} [${p}]`);
  console.log(`  clip     ${fixed(c)}`);
  console.log(`  z + w    ${(c[2] + c[3]).toFixed(3)}`);
  console.log(`  x / w    ${(c[0] / c[3]).toFixed(3)}`);
  console.log(`  window x ${(win.x / SUB).toFixed(2)} pixels`);
}
// endregion: trace

// region: front
trace('ahead', [1, 0, -5]); // 5 m in front, 1 m to the right
// endregion: front
// region: behind
trace('behind', [1, 0, 2]); // 2 m behind, 1 m to the right
// endregion: behind

// region: clip
const tri = [
  [1, 0, -5],
  [1, 0, 2],
  [-1, 0, -5],
].map((p) => ({ c: transform(m, p), a: [] }));
const pieces = clipNear(tri);
console.log(`clipNear: ${pieces.length} triangles`);
for (const piece of pieces) {
  const d = piece.map((v) => (v.c[2] + v.c[3]).toFixed(3));
  console.log(`  z + w at the corners: ${d.join(', ')}`);
}
// endregion: clip
