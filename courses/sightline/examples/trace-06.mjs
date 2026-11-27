// Show what your module 06 functions do, one step at a time.
// Usage, from the course folder:
//   node examples/trace-06.mjs ./work flag
//   node examples/trace-06.mjs ./work read
//   node examples/trace-06.mjs ./work check
//   node examples/trace-06.mjs ./work band
//   node examples/trace-06.mjs ./work menu
// It runs your files in work/ on the course's game and prints what they
// return, beside what the game itself shows.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeGame } from '../host.mjs';
import { LEVELS, referee } from '../levels.mjs';

const [work, step] = process.argv.slice(2);
const steps = ['flag', 'read', 'check', 'band', 'menu'];
if (!work || !steps.includes(step) || process.argv.length !== 4) {
  console.error(`Usage: node examples/trace-06.mjs ./work ${steps.join('|')}`);
  process.exit(2);
}
const load = (name) => import(pathToFileURL(join(resolve(work), name)).href);
const W = await load('wasm.mjs');
const L = await load('lift.mjs');
const F = await load('flight.mjs');
const R = await load('reader.mjs');

// The passes of module 05 on one build, as analyse runs them.
function passes(mode, seed) {
  const game = makeGame({ mode, seed });
  const all = L.liftAll(W.parseModule(game.host.binary()));
  const tick = all.get('game_tick');
  const key = all.get('game_key');
  const launch = F.launchOf(key);
  const aim = F.aimValues(key, launch);
  const flight = F.flightOf(tick, launch);
  const { raw } = aim.angle;
  const rawKey = L.placeKey(raw.addr, raw.offset);
  const d = F.decoding(aim.angle.value, rawKey);
  return { ...game, tick, launch, aim, flight, d };
}
const two = (x) => {
  if (typeof x !== 'number' || Number.isInteger(x)) return String(x);
  return x.toFixed(2);
};
const newRound = (host) => {
  host.press('KeyN');
  host.tick(2);
};

if (step === 'flag') {
  // Build 0 is plain, 6 moves and scrambles, 14 moves the flag too.
  for (const mode of [0, 6, 14]) {
    const p = passes(mode, 7);
    const f = R.flagOf(p.tick, p.flight, p.d.key);
    const places = f.raws.map((r) => L.place(r.addr, r.offset));
    console.log(`build ${mode}: radius ${f.radius}, flag kept at ${places}`);
    p.host.tick(30);
    const word = F.decoder({ ...p.d, float: true }, f.raws[0]);
    const m = L.overlay(p.host.memory());
    const x = L.evaluate(word, { load: m.load, memo: new Map() });
    const shown = p.truth.targetX();
    console.log(`  decoded now: ${two(x)}; the game's flag: ${two(shown)}`);
  }
}

if (step === 'read') {
  // Build 2 moves the state, 6 also scrambles it, 7 also keeps the wind
  // on a server.
  for (const mode of [2, 6, 7]) {
    const p = passes(mode, 9);
    const raw = R.flagOf(p.tick, p.flight, p.d.key).raws[0];
    const reader = R.readerFrom(p.aim, p.flight, raw);
    newRound(p.host);
    newRound(p.host);
    const s = R.readState(p.host, reader, p.truth.lineAddr());
    const read = [s.angle, s.power, s.wind, s.wind_arrows, s.target_x];
    console.log(`build ${mode}, round 2: ${read.map(two).join(', ')}`);
    console.log(`  the status line: ${p.truth.line()}`);
  }
  console.log('(angle, power, wind, wind_arrows, target_x)');
}

if (step === 'check') {
  // A reader made from the code, then the same reader with its angle
  // read 2 too low, each checked against the screen for 3 rounds.
  const cases = [
    ["the code's reader", 0],
    ['the angle 2 too low', -2],
  ];
  for (const [what, extra] of cases) {
    const p = passes(6, 11);
    const raw = R.flagOf(p.tick, p.flight, p.d.key).raws[0];
    const reader = R.readerFrom(p.aim, p.flight, raw);
    const look = () => {
      const s = R.readState(p.host, reader, p.truth.lineAddr());
      return { ...s, angle: s.angle + extra };
    };
    const opts = { lineAddr: p.truth.lineAddr(), rounds: 3, newRound: 'KeyN' };
    const v = R.checkReader(p.host, look, opts);
    console.log(`${what}: ok ${v.ok}, ${v.rows.length} rounds compared`);
    for (const problem of v.problems) console.log(`  ${problem}`);
  }
}

if (step === 'band') {
  for (const arrows of [-3, 0, 2]) {
    console.log(`windBand(${arrows}): [${R.windBand(arrows).join(', ')}]`);
  }
  // Level 5's build: the wind is on a server, and the screen shows arrows.
  const p = passes(LEVELS[4].mode, 5);
  const simulate = F.simulator(p.launch, p.aim, p.flight);
  newRound(p.host);
  const bytes = p.host.memory();
  const arrows = p.truth.windLevel();
  const state = { wind: null, wind_arrows: arrows };
  state.target_x = p.truth.targetX();
  const predict = (angle, power, wind) =>
    simulate(bytes, { angle, power, wind });
  const plan = R.aimBand(state, predict);
  const flag = two(state.target_x);
  console.log(`level 5's build, seed 5: ${arrows} arrows, the flag at ${flag}`);
  const setting = `angle ${plan.angle}, power ${plan.power}`;
  const lands = `lands at ${two(plan.x)} after ${plan.frames} frames`;
  console.log(`  aimBand: ${setting}, ${lands}`);
  console.log(`  the wind the server holds: ${two(p.truth.serverWind())}`);
}

if (step === 'menu') {
  const E = await load('engine.mjs');
  const first = {
    async decide() {
      return { choice: 0, ms: 1 };
    },
  };
  const env = { models: first, log() {} };
  const kit = {};
  for (const level of LEVELS.slice(0, 2)) {
    await E.playLevel(referee(level).host, level, kit, env);
  }
  const level = LEVELS[2];
  const problem = await E.checkKit(referee(level).host, kit, level, env);
  console.log(`level 3, from the kit levels 1 and 2 left with option 0:`);
  console.log(`  part: ${problem.part}`);
  // The reason, wrapped to fit.
  const words = problem.why.split(' ');
  const lines = [''];
  for (const w of words) {
    if (lines.at(-1).length + w.length > 60) lines.push('');
    lines[lines.length - 1] += `${lines.at(-1) ? ' ' : ''}${w}`;
  }
  console.log(`  why: ${lines.join('\n       ')}`);
  console.log(`  evidence: [${problem.evidence.join(', ')}]`);
  problem.options.forEach((o, i) => {
    const cost = `${o.cost.rounds} rounds, ${o.cost.shots} shots`;
    const limits = o.limits.length ? o.limits.join(', ') : 'none';
    console.log(`  ${i}: ${o.key}, ${cost}, ruled out by ${limits}`);
  });
}
