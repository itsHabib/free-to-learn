// Check your readScoreAnywhere (module 08's new case) and keep a record of the try.
// Usage, from the course folder:
//   node examples/check-score-anywhere.mjs ./work [--help-used "what helped"]
// Each try is saved under work/.attempts/ before your code is loaded, with a
// copy of score-anywhere.mjs and of every file it can import from your folder,
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
  console.error('Usage: node examples/check-score-anywhere.mjs ./work');
  console.error('       [--help-used "what helped"]');
  process.exit(2);
}
const work = resolve(args[0]);
const file = join(work, 'score-anywhere.mjs');
if (!existsSync(file)) {
  console.error(`${file} is missing. Add it with:`);
  console.error(`node examples/start-08.mjs ${args[0]} new-case`);
  process.exit(2);
}

// Each case: a game, a build and a seed, and a setting that hits in round 2
// on it. Four builds of Lob II, among them the three that levels 8 to 10
// use, and one of Lob, which moves and scrambles the state.
const CASES = [
  { game: 'lob2', mode: 0, seed: 5, hit: [45, 50] },
  { game: 'lob2', mode: 2, seed: 9, hit: [50, 52] },
  { game: 'lob2', mode: 6, seed: 12, hit: [45, 52] },
  { game: 'lob2', mode: 7, seed: 16, hit: [45, 49] },
  { game: 'lob', mode: 6, seed: 21, hit: [45, 63] },
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
    throw new Error(`readScoreAnywhere may not ${what}`);
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
const attempt = beginAttempt(
  work,
  'score-anywhere',
  'score-anywhere.mjs',
  helpUsed,
);
const { readScoreAnywhere } = await loadForAttempt(attempt);
const results = [];
for (const setup of CASES) {
  const { host: real, truth } = makeGame(setup);
  const name = setup.game === 'lob2' ? 'Lob II' : 'Lob';
  const label = `${name}, build ${setup.mode}, seed ${setup.seed}`;
  const seen = [];
  let error = null;
  // Your counts against the status line's, at one moment of the case.
  const ask = async (when) => {
    const got = await readScoreAnywhere(handed(real, truth));
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
      ' SCORE, hits then shots, at every moment, on both games' +
      ' (lesson 08, "A new case: the score on either game").',
  );
}
finishAttempt(attempt, results);
const passed = results.filter((r) => r.pass).length;
console.log(`${passed} of ${results.length} cases passed.`);
console.log(`This try is saved in ${attempt.dir}.`);
process.exitCode = passed === results.length ? 0 : 1;
