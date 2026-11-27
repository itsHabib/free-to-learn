// Check your findLandingAge (module 02's new case) and keep a record of the try.
// Usage, from the course folder:
//   node examples/check-landing-age.mjs ./work [--help-used "what helped"]
// Each try is saved under work/.attempts/ before your code is loaded, with a
// copy of landing-age.mjs and of every file it can import from your folder,
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
  console.error('Usage: node examples/check-landing-age.mjs ./work');
  console.error('       [--help-used "what helped"]');
  process.exit(2);
}
const work = resolve(args[0]);
const file = join(work, 'landing-age.mjs');
if (!existsSync(file)) {
  console.error(`${file} is missing. Add it with:`);
  console.error(`node examples/start-02.mjs ${args[0]} new-case`);
  process.exit(2);
}

const CONTROLS = {
  angle_up: 'ArrowRight',
  angle_down: 'ArrowLeft',
  power_up: 'ArrowUp',
  power_down: 'ArrowDown',
  new_round: 'KeyN',
  fire: 'Space',
};
// Each case: a seed, and whether a shot has landed before your function runs.
const CASES = [
  { seed: 1, landed: false },
  { seed: 24, landed: false },
  { seed: 7, landed: true },
  { seed: 120, landed: true },
];

// Tick until the shell is down, by the game's own record.
const settle = (host, truth) => {
  while (truth.flying()) host.tick(1);
};

function setUp({ seed, landed }) {
  const game = makeGame({ mode: 0, seed });
  if (landed) {
    game.host.press(CONTROLS.fire);
    settle(game.host, game.truth);
    game.host.tick(30);
  }
  return game;
}

// What the slot you returned holds, against the game's own count, at three
// moments: when your function returns, after a new round, and 9 frames after
// a shot that the check fires lands.
function compare(host, truth, found) {
  const m = host.memory();
  const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
  const yours = () =>
    found.type === 'f32'
      ? view.getFloat32(found.addr, true)
      : view.getInt32(found.addr, true);
  const game = () => truth.exports.r_impact_age();
  const seen = [];
  settle(host, truth);
  seen.push(['when it returned', yours(), game()]);
  host.press(CONTROLS.new_round);
  host.tick(2);
  seen.push(['after a new round', yours(), game()]);
  host.press(CONTROLS.fire);
  settle(host, truth);
  host.tick(9);
  seen.push(['9 frames after a landing', yours(), game()]);
  return seen;
}

// The try is saved before any of your code runs.
const attempt = beginAttempt(work, 'landing-age', 'landing-age.mjs', helpUsed);
const { findLandingAge } = await loadForAttempt(attempt);
const results = [];
for (const setup of CASES) {
  const { host: real, truth } = setUp(setup);
  const presses = [];
  const host = {
    ...real,
    press: (key) => (presses.push(key), real.press(key)),
    write: () => {
      throw new Error('findLandingAge may not write to memory');
    },
  };
  const kit = {
    controls: { ...CONTROLS },
    statusLine: truth.lineAddr(),
    message: truth.msgAddr(),
  };
  const label = `seed ${setup.seed}, ${setup.landed ? 'after' : 'before'} a landing`;
  let got;
  let seen = [];
  try {
    got = await findLandingAge(host, kit);
    const ok =
      ['f32', 'i32'].includes(got?.type) &&
      Number.isInteger(got?.addr) &&
      got.addr % 4 === 0 &&
      got.addr >= 0 &&
      got.addr < real.memory().length;
    if (!ok) throw new Error(`returned ${shown(got)}`);
    seen = compare(real, truth, got);
  } catch (error) {
    got = { error: String(error.message ?? error) };
  }
  const shots = presses.filter((k) => k === CONTROLS.fire).length;
  const same = seen.length > 0 && seen.every(([, a, b]) => a === b);
  const pass = same && shots <= 1;
  results.push({ setup, got, presses: presses.length, shots, seen, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (pass) continue;
  console.log(`  your findLandingAge returned ${shown(got)}`);
  if (shots > 1) console.log(`  it fired ${shots} shots; one is allowed`);
  for (const [when, yours, game] of seen) {
    console.log(`  ${when}: your slot holds ${yours}, the game counts ${game}`);
  }
}

if (results.some((r) => !r.pass)) {
  console.log(
    'The slot must hold the frames since the last shot landed, as' +
      ' the game counts them, at all three moments (lesson 02, "A new' +
      ' case: find the landing count").',
  );
}
finishAttempt(attempt, results, {});
const passed = results.filter((r) => r.pass).length;
console.log(`${passed} of ${results.length} cases passed.`);
console.log(`This try is saved in ${attempt.dir}.`);
process.exitCode = passed === results.length ? 0 : 1;
