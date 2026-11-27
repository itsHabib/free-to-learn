// The overdraw scene drawn immediately and tile by tile, through your
// own bin and renderTile and the supplied pipeline (project/gpu/, or
// FOLDER/gpu/). Run from the course folder:
//   node examples/overdraw-traffic.mjs [FOLDER]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { overdrawScene } from '../scenes/overdraw.mjs';

// Your project's code: ./project, or the folder you name.
const dir = process.argv[2] ?? 'project';
const load = (f) => import(pathToFileURL(resolve(dir, 'gpu', f)).href);
const { render } = await load('pipeline.mjs');

// region: run
const scene = overdrawScene();
console.log('mode       depth      colour     bins       total');
for (const mode of ['immediate', 'tiled']) {
  const b = render(scene, { stage: 8, mode }).counts.bytes;
  const total = b.depth + b.color + b.bins + b.tex;
  const cells = [b.depth, b.color, b.bins, total];
  const row = cells.map((n) => String(n).padEnd(11)).join('');
  console.log(`${mode.padEnd(11)}${row}`.trimEnd());
}
// endregion: run
