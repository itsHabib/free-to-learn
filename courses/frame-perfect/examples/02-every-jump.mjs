// Module 2's wall: try every jump frame from 1 to 60 on level 1, once by replaying from frame 0 for
// each try and once from savestates made with your save and load, and count the frames played.
// Run it from the course folder: node examples/02-every-jump.mjs ./work
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newState, step, ADDR, R, J } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';

const work = resolve(process.argv[2] ?? './work');
const { save, load } = await import(pathToFileURL(resolve(work, 'tas.mjs')).href);

const level = loadLevel('level1');
const LAST = 60;
const JUMP = [...new Array(12).fill(R | J), ...new Array(5).fill(R)]; // the jump frame and 16 frames of flight
const ON_STEP = 6 * 128;
const y = (state) => state.ram[ADDR.Y] | (state.ram[ADDR.Y + 1] << 8);

let walked = 0, jumped = 0;
const walk = (state, n) => { for (let i = 0; i < n; i++) { step(state, R); walked++; } };
const jump = (state) => { JUMP.forEach((input) => { step(state, input); jumped++; }); return y(state) === ON_STEP; };

// From frame 0 for every try: try k walks k - 1 frames before it can jump.
const fromZero = [];
for (let k = 1; k <= LAST; k++) {
  const state = newState(level);
  walk(state, k - 1);
  fromZero.push(jump(state));
}
console.log(`replay from frame 0: ${walked + jumped} frames played (${walked} walking to the jump, ${jumped} jumping)`);

// With savestates: walk once, saving before each jump frame, then load each savestate to try its jump.
walked = 0; jumped = 0;
const state = newState(level), saves = [];
for (let k = 1; k <= LAST; k++) {
  saves.push(save(state));
  if (k < LAST) walk(state, 1);
}
const fromSaves = saves.map((saved) => jump(load(saved)));
console.log(`savestates:          ${walked + jumped} frames played (${walked} walking to the jump, ${jumped} jumping), ${saves.length} loads`);

const good = fromSaves.filter(Boolean).length;
const same = fromZero.every((v, i) => v === fromSaves[i]);
console.log(`${good} of ${LAST} tries end on top of the step; the earliest jump frame that does is ${fromSaves.indexOf(true) + 1}`);
console.log(same ? 'both ways give the same result for every try' : 'the two ways disagree: check save and load');
