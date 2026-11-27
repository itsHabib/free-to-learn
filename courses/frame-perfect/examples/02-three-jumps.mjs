// Module 2's first win: save before a jump on level 1, try three jump frames from the savestate,
// and keep the best. It uses the Session in your work/tas.mjs.
// Run it from the course folder: node examples/02-three-jumps.mjs ./work
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADDR, GROUND, R, J } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';

const work = resolve(process.argv[2] ?? './work');
const { Session } = await import(pathToFileURL(resolve(work, 'tas.mjs')).href);

const ON_STEP = 6 * 128; // Kettle's y, in sub-pixels, when it stands on top of the first step
const y = (state) => state.ram[ADDR.Y] | (state.ram[ADDR.Y + 1] << 8);
const standing = (state) => (state.ram[ADDR.FLAGS] & GROUND) !== 0;

// Walk right until frame k - 1, jump on frame k holding jump for 12 frames, then hold right until Kettle lands.
function tryJump(session, k) {
  while (session.inputs.length < k - 1) session.advance(R);
  for (let i = 0; i < 12; i++) session.advance(R | J);
  while (!standing(session.state)) session.advance(R);
  return { k, landed: session.inputs.length, onStep: y(session.state) === ON_STEP };
}

const session = new Session(loadLevel('level1'));
session.advance(R);
session.advance(R);
session.saveSlot(1);
console.log('saved in slot 1 after frame 2');

const tries = [];
for (const k of [3, 4, 5]) {
  if (tries.length > 0) session.loadSlot(1);
  const t = tryJump(session, k);
  tries.push(t);
  console.log(`jump on frame ${k}: lands on frame ${t.landed}, ${t.onStep ? 'on top of the step' : 'on the floor in front of the step'}`);
}

const best = tries.filter((t) => t.onStep).sort((a, b) => a.landed - b.landed)[0];
session.loadSlot(1);
tryJump(session, best.k);
console.log(`kept the jump on frame ${best.k}: the movie is ${session.inputs.length} frames long, rerecords ${session.rerecords}`);
