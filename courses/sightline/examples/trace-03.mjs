// Show what your module 03 functions do, one step at a time.
// Usage, from the course folder:
//   node examples/trace-03.mjs ./work features
//   node examples/trace-03.mjs ./work shot [SEED]
//   node examples/trace-03.mjs ./work fit
//   node examples/trace-03.mjs ./work judge
//   node examples/trace-03.mjs ./work practice [SEED]
//   node examples/trace-03.mjs ./work search
// It runs your files in work/ on the course's game and prints what they
// return. Where a step needs addresses your search would find, it takes
// them from the game's own record, so that one step doesn't wait on another.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeGame } from '../host.mjs';
import { LEVELS, referee } from '../levels.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [work, step, ...rest] = process.argv.slice(2);
const steps = ['features', 'shot', 'fit', 'judge', 'practice', 'search'];
if (!work || !steps.includes(step)) {
  console.error(`Usage: node examples/trace-03.mjs ./work ${steps.join('|')}`);
  process.exit(2);
}
const load = (name) => import(pathToFileURL(join(resolve(work), name)).href);
const L = await load('learn.mjs');
const seed = Number(rest[0] ?? 1);
const CONTROLS = {
  angle_up: 'ArrowRight',
  angle_down: 'ArrowLeft',
  power_up: 'ArrowUp',
  power_down: 'ArrowDown',
  new_round: 'KeyN',
  fire: 'Space',
};
const one = (x) => x.toFixed(1);
// A list of numbers to 4 decimal places, separated by spaces.
const four = (xs) => `[${xs.map((x) => Number(x.toFixed(4))).join(' ')}]`;
// The addresses findValues finds, from the game's own record.
const foundIn = (truth) => {
  const base = truth.stateBase();
  return {
    angle: { addr: base, type: 'f32' },
    power: { addr: base + 4, type: 'i32' },
    wind: { addr: base + 8, type: 'f32' },
    flag: { addr: base + 16, type: 'f32' },
    message: truth.msgAddr(),
  };
};
// The 14 practice shots the course recorded with seed 7.
const recorded = () => {
  const file = join(root, 'fixtures', 'shots-seed7.json');
  return JSON.parse(readFileSync(file, 'utf8')).shots;
};
const split = (shots) => ({
  fitOn: shots.filter((_, i) => i % 4 !== 3),
  heldOut: shots.filter((_, i) => i % 4 === 3),
});
const worstOf = (coef, shots) =>
  Math.max(
    ...shots.map((s) =>
      Math.abs(L.predictFit(coef, s.angle, s.power, s.wind) - s.impact_x),
    ),
  );

if (step === 'features') {
  console.log(`features(45, 60, 0): ${four(L.features(45, 60, 0))}`);
}

if (step === 'shot') {
  const { host, truth } = makeGame({ mode: 0, seed });
  const found = foundIn(truth);
  const show = (s) => {
    console.log(
      `  message ${truth.message()}, flag at ${s.target_x.toFixed(2)}`,
    );
    console.log(`  impact_x ${s.impact_x.toFixed(2)}, frames ${s.frames}`);
    const left = found.landingCandidates;
    if (found.landing) console.log(`  found.landing at ${found.landing.addr}`);
    else if (left) console.log(`  ${left.length} candidates kept`);
    else console.log('  no candidates yet');
  };
  console.log(`seed ${seed}, a fresh game: testShot at 45 and power 60`);
  show(L.testShot(host, found, CONTROLS, 45, 60));
  host.press(CONTROLS.new_round);
  host.tick(2);
  console.log('a new round: testShot at 30 and power 70');
  show(L.testShot(host, found, CONTROLS, 30, 70));
  console.log(`the game's own landing: ${truth.impactX().toFixed(2)}`);
}

if (step === 'fit') {
  // Points as "x y", separated by commas; each row of A is [1, x].
  const solve = (points) => {
    const xy = points.split(', ').map((p) => p.split(' ').map(Number));
    return L.leastSquares(
      xy.map(([x]) => [1, x]),
      xy.map(([, y]) => y),
    );
  };
  const line = solve('0 1, 1 3, 2 4');
  console.log(`three points, features 1 and x: ${four(line)}`);
  const flat = solve('2 1, 2 3, 2 4');
  console.log(`three points all at x = 2: ${flat}`);
  const shots = recorded();
  const coef = L.fitShots(shots);
  console.log('fitShots on the 14 seed-7 shots:');
  console.log(`  ${four(coef)}`);
  console.log(`worst miss on those 14: ${worstOf(coef, shots).toFixed(2)}`);
  console.log(`fitShots on 4 of them: ${L.fitShots(shots.slice(0, 4))}`);
}

if (step === 'judge') {
  const shots = recorded();
  const sets = split(shots);
  const say = (what, coef, given) => {
    const v = L.judgeFit(coef, given);
    const w = `${one(v.fitWorst)} fitted, ${one(v.heldWorst)} held back`;
    console.log(`${what}: ${v.verdict}`);
    console.log(`  worst misses ${w}`);
  };
  say('the fit on 11, judged on 14', L.fitShots(sets.fitOn), sets);
  const five = sets.fitOn.slice(0, 5);
  const onFive = { fitOn: five, heldOut: sets.heldOut };
  say('a fit on 5 of them', L.fitShots(five), onFive);
  say('no fit at all', null, sets);
}

if (step === 'practice') {
  const { learnFit } = await load('engine.mjs');
  const { host: real, truth } = makeGame({ mode: 0, seed });
  // Keep the game's own landing of every shot, and count the shots.
  const landed = [];
  let flying = false;
  const host = {
    ...real,
    tick(frames) {
      for (let i = 0; i < frames; i++) {
        real.tick(1);
        if (flying && !truth.flying()) landed.push(truth.impactX());
        flying = truth.flying();
      }
    },
  };
  const kit = {
    controls: { ...CONTROLS },
    statusLine: truth.lineAddr(),
    message: truth.msgAddr(),
    found: foundIn(truth),
  };
  const log = [];
  await learnFit(host, kit, { log: (e) => log.push(e.result) });
  const shots = kit.shots ?? [];
  const before = landed.length - shots.length;
  console.log(
    `seed ${seed}: ${landed.length} shots, ${before} before practice`,
  );
  const known = kit.found.landing ? `at ${kit.found.landing.addr}` : 'unknown';
  console.log(`landing slot ${known}`);
  const off = shots
    .map((s, i) => [i + 1, s.impact_x, landed[before + i]])
    .filter(([, mine, game]) => Math.abs(mine - game) > 1e-3);
  console.log(`practice landings unlike the game's: ${off.length} of 14`);
  for (const [n, mine, game] of off) {
    console.log(
      `  shot ${n}: kit.shots ${mine.toFixed(2)}, ${game.toFixed(2)}`,
    );
  }
  console.log(`kit.fit: ${kit.fit ? 'set' : 'null'}`);
}

if (step === 'search') {
  // Level 1 up to its fit, as your loop will play it: the controls, the
  // search, one round to test what it found, then learnFit.
  const E = await load('engine.mjs');
  const { findValues } = await load('find.mjs');
  const { host } = referee(LEVELS[0]);
  const kit = {};
  const env = { log() {}, models: { decide: async () => ({ choice: 0 }) } };
  await E.learnControls(host, kit, env);
  E.controlsHold(host, kit);
  kit.found = await findValues(host, kit.controls);
  E.controlsHold(host, kit);
  host.press(kit.controls.new_round);
  host.tick(2);
  await E.learnFit(host, kit, env);
  const wind = 3.9;
  const flag = 455;
  let predictions = 0;
  const angles = new Set();
  const predict = (angle, power) => {
    predictions++;
    angles.add(angle);
    const x = L.predictFit(kit.fit.coef, angle, power, wind);
    return { x, frames: null };
  };
  console.log(`level 1's fit, a flag at ${flag} and a wind of +${wind}`);
  const at45 = (p) => one(L.predictFit(kit.fit.coef, 45, p, wind));
  for (const powers of [
    [10, 20, 30, 40, 50],
    [60, 70, 80, 90, 100],
  ]) {
    console.log(`  45: ${powers.map((p) => `${p} ${at45(p)}`).join(', ')}`);
  }
  const plan = L.search(predict, () => flag);
  const got = `angle ${plan.angle}, power ${plan.power}`;
  console.log(
    `search: ${got}, ${plan.x.toFixed(2)}, miss ${plan.miss.toFixed(2)}`,
  );
  console.log(`  ${angles.size} angles, ${predictions} predictions`);
}
