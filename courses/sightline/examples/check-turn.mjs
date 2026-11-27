// Check your framesToTurn (module 07's new case) and keep a record of the try.
// Usage, from the course folder:
//   node examples/check-turn.mjs ./work [--help-used "what helped"]
// Each try is saved under work/.attempts/ before your code is loaded, with a
// copy of turn.mjs and of every file it can import from your folder,
// and runs from that copy, so a file that can't load is a try too.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeGame } from '../host.mjs';
import {
  beginAttempt,
  finishAttempt,
  loadForAttempt,
  shown,
} from './attempt.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--help-used');
const helpUsed = at >= 0 ? args.splice(at, 2)[1] : null;
if (args.length !== 1 || (at >= 0 && !helpUsed)) {
  console.error('Usage: node examples/check-turn.mjs ./work');
  console.error('       [--help-used "what helped"]');
  process.exit(2);
}
const work = resolve(args[0]);
const file = join(work, 'turn.mjs');
if (!existsSync(file)) {
  console.error(`${file} is missing. Add it with:`);
  console.error(`node examples/start-07.mjs ${args[0]} new-case`);
  process.exit(2);
}

// Each case: a build whose flag moves, a seed, the new rounds started and
// the frames let pass before your function is asked. Build 8 moves only the
// flag; 14 also moves and scrambles the state; 15 also keeps the wind on a
// server.
const CASES = [
  { mode: 8, seed: 4, rounds: 2, wait: 40 },
  { mode: 8, seed: 2, rounds: 1, wait: 0 },
  { mode: 14, seed: 24, rounds: 2, wait: 40 },
  { mode: 14, seed: 11, rounds: 2, wait: 40 },
  { mode: 15, seed: 17, rounds: 2, wait: 40 },
  { mode: 15, seed: 31, rounds: 1, wait: 0 },
];
const HORIZON = 600;

// A game set up the same way, every time: it is the same game.
function setUp({ mode, seed, rounds, wait }) {
  const game = makeGame({ mode, seed });
  for (let r = 0; r < rounds; r++) {
    game.host.press('KeyN');
    game.host.tick(2);
  }
  game.host.tick(wait);
  return game;
}
// The answer, from a second copy of the game run ahead frame by frame.
function truthOf(setup) {
  const { host, truth } = setUp(setup);
  const xs = [truth.targetX()];
  for (let k = 0; k <= HORIZON; k++) {
    host.tick(1);
    xs.push(truth.targetX());
  }
  const now = Math.sign(xs[1] - xs[0]);
  for (let k = 1; k <= HORIZON; k++) {
    if (Math.sign(xs[k + 1] - xs[k]) === -now) return k;
  }
  return null;
}
// What your function is handed: a copy of memory, and no keys, ticks,
// writes or screen.
function handed(real) {
  const refuse = (what) => () => {
    throw new Error(`framesToTurn may not ${what}`);
  };
  return {
    binary: () => real.binary(),
    memory: () => real.memory().slice(),
    press: refuse('press a key'),
    tick: refuse('let frames pass'),
    write: refuse('write to memory'),
    screen: refuse('read the screen'),
  };
}

// The try is saved before any of your code runs.
const attempt = beginAttempt(work, 'turn', 'turn.mjs', helpUsed);
const { framesToTurn } = await loadForAttempt(attempt);
const results = [];
for (const setup of CASES) {
  const label = `build ${setup.mode}, seed ${setup.seed}`;
  const want = truthOf(setup);
  let got;
  try {
    got = await framesToTurn(handed(setUp(setup).host));
  } catch (error) {
    got = { error: String(error?.message ?? error).split('\n')[0] };
  }
  const pass = got === want;
  results.push({ setup, got, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (pass) continue;
  console.log(`  your framesToTurn returned ${shown(got)}`);
  console.log(`  the flag first moved the other way after ${shown(want)}`);
}
if (results.some((r) => !r.pass)) {
  console.log(
    'A turn is the first frame k, 1 or more, whose move to frame k + 1 goes' +
      ' the other way to the move from now to the next frame (lesson 07,' +
      ' "A new case: when the flag turns").',
  );
}

finishAttempt(attempt, results);
const passed = results.filter((r) => r.pass).length;
console.log(`${passed} of ${results.length} cases passed.`);
console.log(`This try is saved in ${attempt.dir}.`);
process.exitCode = passed === results.length ? 0 : 1;
