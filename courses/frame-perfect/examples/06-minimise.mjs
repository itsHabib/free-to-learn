// Minimises work/movies/level2.movie while Kettle still goes through the wall at column 34 (272 px) in one
// frame, and
// saves the result as work/movies/level2-clip.movie unless that file already exists.
//   node examples/06-minimise.mjs ./work
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TILE } from '../game/core.mjs';
import { clipsThrough } from '../game/fixtures.mjs';
import { loadLevel } from '../game/levels.mjs';

const work = resolve(process.argv[2] ?? './work');
const tas = await import(pathToFileURL(join(work, 'tas.mjs')).href);
const level = loadLevel('level2');
const { inputs } = tas.readMovie(readFileSync(join(work, 'movies', 'level2.movie'), 'utf8'));

let replays = 0;
const clips = (movie) => {
  replays++;
  return clipsThrough(level, 34 * TILE, movie);
};
const presses = (movie) => movie.reduce((n, i) => n + (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1), 0);

const small = tas.minimise(inputs, clips);
console.log(`before: ${presses(inputs)} presses. after: ${presses(small)} presses, found in ${replays} replays`);
const kept = small.map((input, i) => (input ? `${i + 1}${tas.formatInput(input)}` : '')).filter(Boolean);
for (let i = 0; i < kept.length; i += 8) console.log(kept.slice(i, i + 8).join(' '));

const file = join(work, 'movies', 'level2-clip.movie');
if (existsSync(file)) console.log(`${file} already exists, so it was left as it is.`);
else {
  writeFileSync(file, tas.writeMovie({ header: { game: '1.0', level: 'level2', rerecords: 0 }, inputs: small }));
  console.log('Saved it as movies/level2-clip.movie.');
}
