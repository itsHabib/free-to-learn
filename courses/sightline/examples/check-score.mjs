// Check your readScore (module 06's new case) and keep a record of the try.
// Usage, from the course folder:
//   node examples/check-score.mjs ./work [--help-used "what helped"]
// Each try is saved under work/.attempts/ before your code is loaded, with a
// copy of score-reader.mjs and of every file it can import from your folder,
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
  console.error('Usage: node examples/check-score.mjs ./work');
  console.error('       [--help-used "what helped"]');
  process.exit(2);
}
const work = resolve(args[0]);
const file = join(work, 'score-reader.mjs');
if (!existsSync(file)) {
  console.error(`${file} is missing. Add it with:`);
  console.error(`node examples/start-06.mjs ${args[0]} new-case`);
  process.exit(2);
}

// Each case: a build and a seed, and a setting that hits in round 2 on it.
// Build 0 keeps the state in place; builds 2 and 6 move it at every new
// round, and build 6 scrambles the angle, the power, the wind and the flag.
const CASES = [
  { mode: 0, seed: 3, hit: [45, 52] },
  { mode: 2, seed: 8, hit: [45, 71] },
  { mode: 6, seed: 13, hit: [45, 68] },
  { mode: 6, seed: 21, hit: [45, 63] },
];

// The two numbers after SCORE on the status line: hits, then shots.
const score = (truth) => {
  const m = truth.line().match(/SCORE (\d+)\/(\d+)/);
  return m ? { hits: Number(m[1]), shots: Number(m[2]) } : null;
};
const settle = (host, truth) => {
  for (let i = 0; i < 1500 && truth.flying(); i++) host.tick(1);
};
const newRound = (host) => {
  host.press('KeyN');
  host.tick(2);
};
function shoot(host, truth, [angle, power]) {
  while (Math.round(truth.angle()) < angle) host.press('ArrowRight');
  while (Math.round(truth.angle()) > angle) host.press('ArrowLeft');
  while (Math.round(truth.power()) < power) host.press('ArrowUp');
  while (Math.round(truth.power()) > power) host.press('ArrowDown');
  host.press('Space');
  host.tick(1);
  settle(host, truth);
}
// What your function is handed: the game's memory as a copy with the
// status line blanked, and no keys, ticks, writes or screen.
function handed(real, truth) {
  const refuse = (what) => () => {
    throw new Error(`readScore may not ${what}`);
  };
  return {
    binary: () => real.binary(),
    memory: () => {
      const copy = real.memory().slice();
      const line = truth.lineAddr();
      for (let a = line; copy[a] !== 0; a++) copy[a] = 0;
      return copy;
    },
    press: refuse('press a key'),
    tick: refuse('let frames pass'),
    write: refuse('write to memory'),
    screen: refuse('read the screen'),
  };
}

// The try is saved before any of your code runs.
const attempt = beginAttempt(work, 'score', 'score-reader.mjs', helpUsed);
const { readScore } = await loadForAttempt(attempt);
const results = [];
for (const setup of CASES) {
  const { host: real, truth } = makeGame(setup);
  const label = `build ${setup.mode}, seed ${setup.seed}`;
  const seen = [];
  let error = null;
  // Your counts against the status line's, at one moment of the case.
  const ask = async (when) => {
    const got = await readScore(handed(real, truth));
    const line = score(truth);
    seen.push({ when, got, line });
    const same = got?.hits === line.hits && got?.shots === line.shots;
    if (!same) throw new Error(`${when}, the counts disagree`);
  };
  try {
    newRound(real);
    await ask('at the start of round 1');
    shoot(real, truth, [5, Math.round(truth.power())]); // lands short
    await ask('after a shot that missed');
    newRound(real);
    await ask('after a new round');
    shoot(real, truth, setup.hit);
    if (!truth.message().startsWith('HIT')) {
      throw new Error("the course's own hitting shot missed");
    }
    await ask('after a shot that hit');
    newRound(real);
    await ask('after another new round');
  } catch (e) {
    error = String(e?.message ?? e).split('\n')[0];
  }
  const pass = error === null;
  results.push({ setup, seen, error, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (pass) continue;
  console.log(`  ${error}`);
  for (const { when, got, line } of seen) {
    const yours = shown(got);
    console.log(
      `  ${when}: yours ${yours}, the status line ${line.hits}/${line.shots}`,
    );
  }
}

if (results.some((r) => !r.pass)) {
  console.log(
    'Your counts must be the two the status line shows after' +
      ' SCORE, hits then shots, at every moment, also after the state' +
      ' has moved (lesson 06, "A new case: the score").',
  );
}
finishAttempt(attempt, results);
const passed = results.filter((r) => r.pass).length;
console.log(`${passed} of ${results.length} cases passed.`);
console.log(`This try is saved in ${attempt.dir}.`);
process.exitCode = passed === results.length ? 0 : 1;
