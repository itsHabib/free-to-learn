// Module 4: your predictArc against the game, on standing jumps in open ground with jump held for
// 1 to 8 frames and then let go. Each line says whether the model matched every frame.
// Run it from the course folder: node examples/04-model.mjs ./work
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newState, step, ADDR, J } from '../game/core.mjs';
import { OPEN_ROOM } from '../game/fixtures.mjs';

const work = resolve(process.argv[2] ?? './work');
const { predictArc } = await import(pathToFileURL(resolve(work, 'tas.mjs')).href);
const u16 = (s, a) => s.ram[a] | (s.ram[a + 1] << 8);

let matched = 0;
for (let held = 1; held <= 8; held++) {
  const inputs = [...new Array(held).fill(J), ...new Array(24 - held).fill(0)];
  const state = newState(OPEN_ROOM);
  const model = predictArc({ x: u16(state, ADDR.X), y: u16(state, ADDR.Y), vx: 0 }, inputs);
  let miss = null;
  for (let f = 0; f < inputs.length && miss === null; f++) {
    step(state, inputs[f]);
    if (model[f]?.y !== u16(state, ADDR.Y)) miss = `frame ${f + 1}: game y ${u16(state, ADDR.Y)}, model y ${model[f]?.y}`;
  }
  if (miss === null) matched++;
  console.log(`jump held ${held} ${held === 1 ? 'frame' : 'frames'}: ${miss === null ? 'every frame matches' : `first miss on ${miss}`}`);
}
console.log(`${matched} of 8 jumps match`);
