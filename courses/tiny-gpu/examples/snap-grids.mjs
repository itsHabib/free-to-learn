// Two corners snapped to the 1/16 pixel grid and to the 1/256 grid,
// with your own snap2 and setSubpixelBits (project/gpu/raster.mjs, or
// FOLDER/gpu/). Run from the course folder:
//   node examples/snap-grids.mjs [FOLDER]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Your project's code: ./project, or the folder you name.
const dir = process.argv[2] ?? 'project';
const load = (f) => import(pathToFileURL(resolve(dir, 'gpu', f)).href);
const raster = await load('raster.mjs');

// region: snap
// A corner of a 2D tie scene, on the 1/16 grid, and a courtyard
// corner after the divide, which lands anywhere.
const corners = [
  [20.5, 7.25],
  [37.41361, 12.08173],
];
for (const bits of [4, 8]) {
  raster.setSubpixelBits(bits);
  const step = raster.SUB;
  const toPixels = ([x, y]) => [x / step, y / step];
  const snapped = raster.snap2(corners).map(toPixels);
  console.log(`grid 1/${step}:`);
  for (const [x, y] of snapped) console.log(`  ${x}, ${y}`);
}
raster.setSubpixelBits(4);
// endregion: snap
