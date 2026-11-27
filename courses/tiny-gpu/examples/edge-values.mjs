// Edge values at two pixel centres of one triangle, from your own
// edge and owns in project/gpu/raster.mjs (or FOLDER/gpu/).
// Run from the course folder: node examples/edge-values.mjs [FOLDER]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Your project's code: ./project, or the folder you name.
const dir = process.argv[2] ?? 'project';
const load = (f) => import(pathToFileURL(resolve(dir, 'gpu', f)).href);
const { SUB, edge, owns } = await load('raster.mjs');

// region: trace
// Corners at pixels (1, 1), (11, 3) and (4, 9), counter-clockwise,
// in 1/16 pixel units.
const v0 = [1 * SUB, 1 * SUB];
const v1 = [11 * SUB, 3 * SUB];
const v2 = [4 * SUB, 9 * SUB];
const centre = (x, y) => [x * SUB + SUB / 2, y * SUB + SUB / 2];

for (const [x, y] of [
  [4, 3],
  [3, 1],
]) {
  const p = centre(x, y);
  const w = [edge(v1, v2, p), edge(v2, v0, p), edge(v0, v1, p)];
  console.log(`pixel (${x}, ${y}), centre [${p}]: w = ${w.join(', ')}`);
}
console.log(`twice the area: ${edge(v0, v1, v2)}`);
try {
  console.log(`edge v0 -> v1 owns its ties: ${owns(v0, v1)}`);
} catch (e) {
  if (!/not written yet/.test(e.message)) throw e;
  console.log('owns: not written yet (you write it in "The tie rule")');
}
// endregion: trace
