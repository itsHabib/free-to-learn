// The floor along the picture and turned a quarter turn, its texture
// stored row-major ('linear') and in 4 x 2 blocks ('tiled'), through
// your own memory.mjs and the supplied pipeline (project/gpu/, or
// FOLDER/gpu/). Run from the course folder:
//   node examples/floor-misses.mjs [FOLDER]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { floorScene } from '../scenes/floor.mjs';

// Your project's code: ./project, or the folder you name.
const dir = process.argv[2] ?? 'project';
const load = (f) => import(pathToFileURL(resolve(dir, 'gpu', f)).href);
const { render } = await load('pipeline.mjs');

// region: run
console.log('floor      layout  misses  hits    texture bytes');
for (const turn of [0, 90]) {
  for (const layout of ['linear', 'tiled']) {
    const out = render(floorScene({ turn }), { stage: 7, layout });
    const { hits, misses } = out.counts.cache;
    const row = [
      (turn ? 'turned' : 'along').padEnd(11),
      layout.padEnd(8),
      String(misses).padEnd(8),
      String(hits).padEnd(8),
      out.counts.bytes.tex,
    ];
    console.log(row.join(''));
  }
}
// endregion: run
