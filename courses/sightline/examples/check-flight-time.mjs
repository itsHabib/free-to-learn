// Check your fitFrames (module 03's new case) and keep a record of the try.
// Usage, from the course folder:
//   node examples/check-flight-time.mjs ./work [--help-used "what helped"]
// Each try is saved under work/.attempts/ before your code is loaded, with a
// copy of flight-time.mjs and of every file it can import from your folder,
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
  console.error('Usage: node examples/check-flight-time.mjs ./work');
  console.error('       [--help-used "what helped"]');
  process.exit(2);
}
const work = resolve(args[0]);
const file = join(work, 'flight-time.mjs');
if (!existsSync(file)) {
  console.error(`${file} is missing. Add it with:`);
  console.error(`node examples/start-03.mjs ${args[0]} new-case`);
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
// The practice settings, in learnFit's order, with a new round before
// every fourth.
const PRACTICE = [
  [30, 70],
  [50, 60],
  [40, 85],
  [60, 75],
  [25, 90],
  [45, 50],
  [65, 95],
  [35, 60],
  [55, 80],
  [70, 65],
  [20, 75],
  [50, 95],
  [40, 55],
  [60, 90],
];
// Settings no practice shot used, between 20 and 70 degrees and powers
// 30 to 100, the range the levels' shots are fired in.
const CASES = [
  [20, 30],
  [22, 100],
  [28, 45],
  [33, 92],
  [38, 35],
  [44, 70],
  [47, 100],
  [52, 40],
  [59, 88],
  [63, 30],
  [66, 62],
  [70, 100],
];
const WITHIN = 1.5;

// Fire one shot at a setting and count the frames until the message
// shows text, as testShot counts them; the landing from the game's record.
function fire(host, truth, angle, power) {
  for (let n = 0; n < 200 && Math.round(truth.angle()) !== angle; n++) {
    host.press(truth.angle() < angle ? CONTROLS.angle_up : CONTROLS.angle_down);
  }
  for (let n = 0; n < 200 && Math.round(truth.power()) !== power; n++) {
    host.press(truth.power() < power ? CONTROLS.power_up : CONTROLS.power_down);
  }
  const target_x = truth.targetX();
  const m = host.memory();
  const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
  // The wind the shell flies in, where the game keeps it.
  const wind = view.getFloat32(truth.stateBase() + 8, true);
  host.press(CONTROLS.fire);
  let frames = 0;
  while (frames < 1500 && !truth.message()) {
    host.tick(1);
    frames++;
  }
  return { angle, power, wind, target_x, impact_x: truth.impactX(), frames };
}

const { host, truth } = makeGame({ mode: 0, seed: 11 });
const shots = PRACTICE.map(([angle, power], i) => {
  if (i % 4 === 0) {
    host.press(CONTROLS.new_round);
    host.tick(2);
  }
  return fire(host, truth, angle, power);
});

// The try is saved before any of your code runs.
const attempt = beginAttempt(work, 'flight-time', 'flight-time.mjs', helpUsed);
const { fitFrames } = await loadForAttempt(attempt);
const results = [];
let predict = null;
let error = null;
try {
  predict = await fitFrames(shots.map((s) => ({ ...s })));
  if (typeof predict !== 'function') {
    throw new Error(`fitFrames returned ${typeof predict}, not a function`);
  }
} catch (e) {
  error = String(e.message ?? e);
  console.log(`fitFrames threw: ${error}`);
}
for (const [angle, power] of CASES) {
  host.press(CONTROLS.new_round);
  host.tick(2);
  const flew = fire(host, truth, angle, power).frames;
  let said;
  try {
    said = predict ? predict(angle, power) : null;
  } catch (e) {
    said = `threw: ${e.message ?? e}`;
  }
  const ok = typeof said === 'number' && Math.abs(said - flew) <= WITHIN;
  results.push({ angle, power, said, flew, pass: ok });
  const text = typeof said === 'number' ? said.toFixed(2) : shown(said);
  const head = `${ok ? 'PASS' : 'FAIL'} angle ${angle}, power ${power}`;
  console.log(`${head}: you said ${text}, it flew ${flew} frames`);
}

finishAttempt(attempt, results, { error });
const passed = results.filter((r) => r.pass).length;
console.log(`${passed} of ${results.length} settings within ${WITHIN} frames.`);
console.log(`This try is saved in ${attempt.dir}.`);
process.exitCode = passed === results.length ? 0 : 1;
