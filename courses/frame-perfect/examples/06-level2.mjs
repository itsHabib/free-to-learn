// Level 2 by A* with the walking bound (astar), or by plain breadth-first search (bfs). The bfs run
// saves its movie as work/movies/level2.movie unless that file already exists.
//   node examples/06-level2.mjs ./work astar
//   node examples/06-level2.mjs ./work bfs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadLevel } from '../game/levels.mjs';

const work = resolve(process.argv[2] ?? './work');
const tas = await import(pathToFileURL(join(work, 'tas.mjs')).href);
const level = loadLevel('level2');
const n = (x) => x.toLocaleString('en-US');

if (process.argv[3] === 'astar') {
  const astar = tas.search(level, { heuristic: tas.walkingBound(level) });
  console.log(`A*, walking bound: ${astar.frames} frames, ${n(astar.expanded)} states expanded`);
  process.exit(0);
}
const bfs = tas.search(level, {});
console.log(`breadth-first:     ${bfs.frames} frames, ${n(bfs.expanded)} states expanded`);

const file = join(work, 'movies', 'level2.movie');
if (existsSync(file)) {
  console.log(`${file} already exists, so it was left as it is.`);
} else {
  mkdirSync(join(work, 'movies'), { recursive: true });
  writeFileSync(file, tas.writeMovie({ header: { game: '1.0', level: 'level2', rerecords: 0 }, inputs: bfs.inputs }));
  console.log('Saved the breadth-first movie as movies/level2.movie.');
}
