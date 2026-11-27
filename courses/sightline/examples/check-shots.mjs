// Check your findShotCounter (module 05's new case) and keep a record of the try.
// Usage, from the course folder:
//   node examples/check-shots.mjs ./work [--help-used "what helped"]
// Each try is saved under work/.attempts/ before your code is loaded, with a
// copy of shot-count.mjs and of every file it can import from your folder,
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
  console.error('Usage: node examples/check-shots.mjs ./work');
  console.error('       [--help-used "what helped"]');
  process.exit(2);
}
const work = resolve(args[0]);
const file = join(work, 'shot-count.mjs');
if (!existsSync(file)) {
  console.error(`${file} is missing. Add it with:`);
  console.error(`node examples/start-05.mjs ${args[0]} new-case`);
  process.exit(2);
}

// Each case: a build, a seed, and the shots fired before your function runs.
// Build 3 moves the state when a round starts and keeps the wind on a server.
const CASES = [
  { mode: 0, seed: 1, before: 0 },
  { mode: 0, seed: 7, before: 2 },
  { mode: 3, seed: 5, before: 1 },
  { mode: 3, seed: 30, before: 3 },
];

// The two numbers after SCORE on the status line: hits, then shots.
const score = (truth) => {
  const m = truth.line().match(/SCORE (\d+)\/(\d+)/);
  return m ? { hits: Number(m[1]), shots: Number(m[2]) } : null;
};
const settle = (host, truth) => {
  for (let i = 0; i < 1500 && truth.flying(); i++) host.tick(1);
};
function setUp({ mode, seed, before }) {
  const game = makeGame({ mode, seed });
  for (let k = 0; k < before; k++) {
    game.host.press('KeyN');
    game.host.tick(2);
    game.host.press('Space');
    game.host.tick(1);
    settle(game.host, game.truth);
  }
  return game;
}
const wordAt = (host, addr) => {
  const m = host.memory();
  return new DataView(m.buffer, m.byteOffset, m.byteLength).getInt32(
    addr,
    true,
  );
};

// The try is saved before any of your code runs.
const attempt = beginAttempt(work, 'shots', 'shot-count.mjs', helpUsed);
const { findShotCounter } = await loadForAttempt(attempt);
const results = [];
for (const setup of CASES) {
  const { host: real, truth } = setUp(setup);
  const presses = [];
  const host = {
    ...real,
    press: (key) => (presses.push(key), real.press(key)),
    write: () => {
      throw new Error('findShotCounter may not write to memory');
    },
  };
  const label = `build ${setup.mode}, seed ${setup.seed}, ${setup.before} shots before`;
  const seen = [];
  let got;
  try {
    got = await findShotCounter(host);
    const size = real.memory().length;
    const ok = Number.isInteger(got) && got % 4 === 0 && got >= 0 && got < size;
    if (!ok) throw new Error(`returned ${shown(got)}`);
    if (presses.includes('Space')) throw new Error('it fired a shot');
    // Your word against the status line now, then after one shot that
    // misses (the barrel turned to the lowest angle) and one more shot.
    seen.push(['when it returned', wordAt(real, got), score(truth)?.shots]);
    while (Math.round(truth.angle()) > 5) real.press('ArrowLeft');
    real.press('Space');
    real.tick(1);
    settle(real, truth);
    seen.push([
      'after a shot that missed',
      wordAt(real, got),
      score(truth)?.shots,
    ]);
    real.press('Space');
    real.tick(1);
    settle(real, truth);
    seen.push(['after one more shot', wordAt(real, got), score(truth)?.shots]);
  } catch (error) {
    got = { error: String(error.message ?? error) };
  }
  const pass = seen.length === 3 && seen.every(([, a, b]) => a === b);
  results.push({ setup, got, seen, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (pass) continue;
  console.log(`  your findShotCounter returned ${shown(got)}`);
  for (const [when, yours, shown] of seen) {
    console.log(
      `  ${when}: your word holds ${yours}, the status line counts ${shown}`,
    );
  }
}

if (results.some((r) => !r.pass)) {
  console.log(
    'The word at your address must hold the count of shots the' +
      ' status line shows after SCORE, at all three moments (lesson' +
      ' 05, "A new case: the shot counter").',
  );
}
finishAttempt(attempt, results);
const passed = results.filter((r) => r.pass).length;
console.log(`${passed} of ${results.length} cases passed.`);
console.log(`This try is saved in ${attempt.dir}.`);
process.exitCode = passed === results.length ? 0 : 1;
