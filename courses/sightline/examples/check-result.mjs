// Check your readResult (module 01's new case) and keep a record of the try.
// Usage, from the course folder:
//   node examples/check-result.mjs ./work [--help-used "what helped"]
// Each try is saved under work/.attempts/ before your code is loaded, with a
// copy of read-result.mjs and of every file it can import from your folder,
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
  console.error('Usage: node examples/check-result.mjs ./work');
  console.error('       [--help-used "what helped"]');
  process.exit(2);
}
const work = resolve(args[0]);
const file = join(work, 'read-result.mjs');
if (!existsSync(file)) {
  console.error(`${file} is missing. Copy starter/read-result.mjs there.`);
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
// Each case: a seed, then presses of angle up (down when negative) and power up.
const CASES = [
  { seed: 1, angle: 0, power: 0 },
  { seed: 120, angle: 0, power: 0 },
  { seed: 5, angle: -20, power: 25 },
  { seed: 33, angle: 10, power: -30 },
];

function setUp({ seed, angle, power }) {
  const game = makeGame({ mode: 0, seed });
  const { host } = game;
  const angleKey = angle > 0 ? CONTROLS.angle_up : CONTROLS.angle_down;
  const powerKey = power > 0 ? CONTROLS.power_up : CONTROLS.power_down;
  for (let i = 0; i < Math.abs(angle); i++) host.press(angleKey);
  for (let i = 0; i < Math.abs(power); i++) host.press(powerKey);
  host.tick(2);
  return game;
}

// What the game itself says: its own record of when the shell is flying.
function expected(setup) {
  const { host, truth } = setUp(setup);
  host.press(CONTROLS.fire);
  let frames = 0;
  do {
    host.tick(1);
    frames++;
  } while (truth.flying());
  return { text: truth.message(), frames };
}

// The try is saved before any of your code runs.
const attempt = beginAttempt(work, 'read-result', 'read-result.mjs', helpUsed);
const { readResult } = await loadForAttempt(attempt);
const results = [];
for (const setup of CASES) {
  const { host: real, truth } = setUp(setup);
  const presses = [];
  const host = {
    ...real,
    press: (key) => (presses.push(key), real.press(key)),
    write: () => {
      throw new Error('readResult may not write to memory');
    },
  };
  const kit = {
    controls: { ...CONTROLS },
    statusLine: truth.lineAddr(),
    message: truth.msgAddr(),
  };
  const want = expected(setup);
  const label = `seed ${setup.seed}, ${truth.line().slice(0, 18)}`;
  let got;
  try {
    got = readResult(host, kit);
  } catch (error) {
    got = { error: String(error.message ?? error) };
  }
  const same =
    got?.text === want.text &&
    got?.frames === want.frames &&
    presses.join() === CONTROLS.fire;
  results.push({ setup, want, got, presses, pass: same });
  console.log(`${same ? 'PASS' : 'FAIL'} ${label}`);
  if (!same) {
    console.log(`  your readResult returned ${shown(got)}`);
    console.log(`  and pressed ${shown(presses)}`);
    console.log(`  the game landed with ${shown(want)}`);
    console.log('  after one press of Space');
  }
}

finishAttempt(attempt, results, {});
const passed = results.filter((r) => r.pass).length;
console.log(`${passed} of ${results.length} cases passed.`);
console.log(`This try is saved in ${attempt.dir}.`);
process.exitCode = passed === results.length ? 0 : 1;
