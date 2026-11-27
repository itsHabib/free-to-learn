// Module 4: a watch table of one short movie in open ground, made with your watch and peek.
// Run it from the course folder: node examples/04-watch.mjs ./work jump   (or release, or walk)
//   jump     jump held for 17 frames, from standing
//   release  jump held for 1 frame, then nothing
//   walk     right held for 5 frames, then nothing for 4
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADDR, R, J } from '../game/core.mjs';
import { OPEN_ROOM } from '../game/fixtures.mjs';

const work = resolve(process.argv[2] ?? './work');
const which = process.argv[3] ?? 'jump';
const { watch } = await import(pathToFileURL(resolve(work, 'tas.mjs')).href);

const Y = [{ name: 'y', addr: ADDR.Y, type: 'u16' }, { name: 'vy', addr: ADDR.VY, type: 's16' }];
const X = [{ name: 'x', addr: ADDR.X, type: 'u16' }, { name: 'vx', addr: ADDR.VX, type: 's16' }];
const cases = {
  jump: { inputs: new Array(17).fill(J), fields: Y },
  release: { inputs: [J, 0, 0, 0, 0, 0], fields: Y },
  walk: { inputs: [R, R, R, R, R, 0, 0, 0, 0], fields: X },
};
const chosen = cases[which];
if (!chosen) throw new Error(`there is no case ${which}; the cases are ${Object.keys(cases).join(', ')}`);

const rows = watch(OPEN_ROOM, chosen.inputs, chosen.fields);
const names = ['frame', 'input', ...chosen.fields.map((f) => f.name)];
const button = (input) => (input === undefined ? '' : `|${input & 1 ? 'L' : '.'}${input & R ? 'R' : '.'}${input & J ? 'J' : '.'}|`);
console.log(names.map((n) => n.padStart(6)).join(''));
rows.forEach((row) => {
  const cells = [row.frame, button(chosen.inputs[row.frame - 1]), ...chosen.fields.map((f) => row[f.name])];
  console.log(cells.map((c) => String(c).padStart(6)).join(''));
});
