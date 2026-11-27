// Steering by idle frames in the bell room: the fewest idle frames before the plan (6 frames right, then
// 10 of jump) that make the bell choose drop 3, then a search for the rest of the route from that
// savestate. Saves the whole route as work/movies/bell.movie unless that file already exists.
//   node examples/07-steer.mjs ./work
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { R, J } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';

const work = resolve(process.argv[2] ?? './work');
const tas = await import(pathToFileURL(join(work, 'tas.mjs')).href);
const bell = loadLevel('bell');
const plan = [...new Array(6).fill(R), ...new Array(10).fill(J)];

for (const want of [0, 1, 2, 3]) {
  const idle = tas.steer(bell, plan, want)?.idle;
  console.log(`drop ${want}: ${idle} idle frame${idle === 1 ? '' : 's'}`);
}
const { inputs } = tas.steer(bell, plan, 3);
const rest = tas.search(bell, { from: tas.save(tas.play(bell, inputs).state) });
const route = [...inputs, ...rest.inputs];
console.log(`steered start ${inputs.length} frames + search ${rest.frames} frames = ${route.length} frames`);

const file = join(work, 'movies', 'bell.movie');
if (existsSync(file)) console.log(`${file} already exists, so it was left as it is.`);
else {
  mkdirSync(join(work, 'movies'), { recursive: true });
  writeFileSync(file, tas.writeMovie({ header: { game: '1.0', level: 'bell', rerecords: 0 }, inputs: route }));
  console.log('Saved it as movies/bell.movie.');
}
