// Steering with the search instead of idle frames. First a search whose key keeps the random state until
// the bell rings, with the goal "the bell has rung and chose drop 3"; then a search for the rest of the
// route from that savestate, where the random state no longer matters. Saves the route as
// work/movies/bell-jumps.movie unless that file already exists.
//   node examples/07-jumps.mjs ./work
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADDR } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';

const work = resolve(process.argv[2] ?? './work');
const tas = await import(pathToFileURL(join(work, 'tas.mjs')).href);
const bell = loadLevel('bell');
const n = (x) => x.toLocaleString('en-US');

const rung = (s) => s.ram[ADDR.BELL] === 1 && s.ram[ADDR.DROP] === 3;
const first = tas.search(bell, { goal: rung, withRandom: true, budget: 1_000_000 });
console.log(`bell rung with drop 3: ${first.frames} frames, ${n(first.expanded)} states expanded`);
console.log(`  ${first.inputs.map(tas.formatInput).join(' ')}`);
const after = tas.play(bell, first.inputs).state;
const rest = tas.search(bell, { from: tas.save(after) });
console.log(`the rest: ${rest.frames} frames, ${n(rest.expanded)} states expanded`);
console.log(`whole route: ${first.frames + rest.frames} frames`);

const file = join(work, 'movies', 'bell-jumps.movie');
if (existsSync(file)) console.log(`${file} already exists, so it was left as it is.`);
else {
  mkdirSync(join(work, 'movies'), { recursive: true });
  const inputs = [...first.inputs, ...rest.inputs];
  writeFileSync(file, tas.writeMovie({ header: { game: '1.0', level: 'bell', rerecords: 0 }, inputs }));
  console.log('Saved it as movies/bell-jumps.movie.');
}
