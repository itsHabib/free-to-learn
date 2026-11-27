// The red, green and blue triangle with w = 1, 6 and 2.5 at its
// corners: colour blended by the screen weights against your
// perspective-correct interpolate, pixel by pixel.
// Run from the course folder:
//   node examples/perspective-error.mjs [FOLDER]
import { perspectiveTriangle } from '../scenes/flat2d.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Your project's code: ./project, or the folder you name.
const dir = process.argv[2] ?? 'project';
const load = (f) => import(pathToFileURL(resolve(dir, 'gpu', f)).href);
const { fullRect, rasterize, snap2 } = await load('raster.mjs');
const { interpolate, toByte } = await load('interp.mjs');

const tri = perspectiveTriangle().tris[0];
const win = tri.v.map((v) => ({
  z: v.p[2],
  invW: 1 / v.p[3],
  a: v.c,
}));
const pts = snap2(tri.v.map((v) => v.p));

// region: compare
let pixels = 0;
let over = 0;
let worst = { gap: -1 };
rasterize(pts, fullRect(64, 64), (x, y, w0, w1, w2) => {
  const w = [w0, w1, w2];
  const sum = w0 + w1 + w2;
  // Screen weights only: what the picture would get without 1/w.
  const flat = [0, 1, 2].map((k) =>
    w.reduce((s, wi, i) => s + (wi / sum) * win[i].a[k], 0),
  );
  const right = interpolate(win, w, 3).attrs;
  const a = flat.map(toByte);
  const b = right.map(toByte);
  const gap = Math.max(...a.map((v, k) => Math.abs(v - b[k])));
  pixels++;
  if (gap > 1) over++;
  if (gap > worst.gap) worst = { gap, x, y, a, b };
});
console.log(`pixels covered: ${pixels}`);
console.log(`pixels more than 1 level apart: ${over}`);
console.log(`largest difference: ${worst.gap} levels`);
console.log(`at pixel (${worst.x}, ${worst.y}):`);
console.log(`  screen weights only  ${worst.a.join(', ')}`);
console.log(`  perspective-correct  ${worst.b.join(', ')}`);
// endregion: compare
