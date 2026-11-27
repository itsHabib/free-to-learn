// The memory watch on a level 2 movie, frames FIRST to LAST: the input, then x and vx in pixels.
//   node examples/06-watch.mjs ./work [MOVIE] [FIRST] [LAST]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADDR } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';

const work = resolve(process.argv[2] ?? './work');
const tas = await import(pathToFileURL(join(work, 'tas.mjs')).href);
const movie = process.argv[3] ?? join(work, 'movies', 'level2.movie');
const first = Number(process.argv[4] ?? 62);
const last = Number(process.argv[5] ?? 70);
const { inputs } = tas.readMovie(readFileSync(movie, 'utf8'));
const fields = [
  { name: 'x', addr: ADDR.X, type: 'u16' },
  { name: 'vx', addr: ADDR.VX, type: 's16' },
];
console.log('frame  input      x px  vx px');
for (const row of tas.watch(loadLevel('level2'), inputs, fields).slice(first, last + 1)) {
  const input = row.frame ? tas.formatInput(inputs[row.frame - 1]) : '';
  console.log(`${String(row.frame).padStart(5)}  ${input.padEnd(5)}  ${(row.x / 16).toFixed(1).padStart(8)}  ${(row.vx / 16).toFixed(1).padStart(5)}`);
}
