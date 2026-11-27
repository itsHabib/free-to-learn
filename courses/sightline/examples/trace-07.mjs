// Show what your module 07 functions do, one step at a time.
// Usage, from the course folder:
//   node examples/trace-07.mjs ./work mover
//   node examples/trace-07.mjs ./work path
//   node examples/trace-07.mjs ./work judge
//   node examples/trace-07.mjs ./work lead
// It runs your files in work/ on the course's game and prints what they
// return, beside what the game itself does.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeGame } from '../host.mjs';

const [work, step] = process.argv.slice(2);
const steps = ['mover', 'path', 'judge', 'lead'];
if (!work || !steps.includes(step) || process.argv.length !== 4) {
  console.error(`Usage: node examples/trace-07.mjs ./work ${steps.join('|')}`);
  process.exit(2);
}
const load = (name) => import(pathToFileURL(join(resolve(work), name)).href);
const W = await load('wasm.mjs');
const L = await load('lift.mjs');
const F = await load('flight.mjs');
const R = await load('reader.mjs');
const C = await load('race.mjs');

// Build 14 moves and scrambles the state and moves the flag.
const MODE = 14;
// The passes of modules 05 and 06 on one game, as analyse runs them.
function passes(seed, game = makeGame({ mode: MODE, seed })) {
  const all = L.liftAll(W.parseModule(game.host.binary()));
  const tick = all.get('game_tick');
  const key = all.get('game_key');
  const launch = F.launchOf(key);
  const aim = F.aimValues(key, launch);
  const flight = F.flightOf(tick, launch);
  const { raw } = aim.angle;
  const d = F.decoding(aim.angle.value, L.placeKey(raw.addr, raw.offset));
  const flagRaw = R.flagOf(tick, flight, d.key).raws[0];
  const reader = R.readerFrom(aim, flight, flagRaw);
  const mover = C.moverOf(tick, flagRaw);
  return { ...game, tick, launch, aim, flight, reader, mover };
}
const two = (x) => (typeof x === 'number' ? x.toFixed(2) : String(x));
// A long line wrapped to fit, its later lines indented.
function wrap(text, indent) {
  const lines = [''];
  for (const w of text.split(' ')) {
    if (lines.at(-1).length + w.length > 64) lines.push('');
    lines[lines.length - 1] += `${lines.at(-1) ? ' ' : ''}${w}`;
  }
  return lines.join(`\n${indent}`);
}
const newRound = (host) => {
  host.press('KeyN');
  host.tick(2);
};

if (step === 'mover') {
  const p = passes(3);
  console.log(`moverOf: ${p.mover.length} stores of game_tick`);
  for (const st of p.mover) {
    const n = st.guard.length;
    const conditions = `${n} condition${n === 1 ? '' : 's'}`;
    console.log(`  ${L.place(st.addr, st.offset)}, ${st.type}, ${conditions}`);
  }
}

if (step === 'path') {
  // A path for 300 frames from memory as it is, then the game run on.
  const p = passes(13);
  newRound(p.host);
  const path = C.flagPath(p.host.memory(), p.mover, p.reader.flag, 300);
  console.log(`flagPath: ${path.length} entries; every 60th beside the game`);
  for (let k = 0; k <= 300; k++) {
    if (k) p.host.tick(1);
    if (k % 60) continue;
    const game = two(p.truth.targetX());
    console.log(`  after ${k} frames: ${two(path[k])}; the game ${game}`);
  }
}

if (step === 'judge') {
  // The slice's path, then a path that keeps the flag's speed for ever,
  // each judged for 2 rounds of 300 frames.
  const straight = (path) =>
    path.map((x, k) => path[0] + k * (path[1] - path[0]));
  for (const [what, bend] of [
    ['the slice', (path) => path],
    ['a constant speed', straight],
  ]) {
    const p = passes(21);
    const look = () => ({ target_x: p.truth.targetX() });
    const pathNow = (frames) =>
      bend(C.flagPath(p.host.memory(), p.mover, p.reader.flag, frames));
    const opts = { newRound: 'KeyN', rounds: 2, frames: 300 };
    const v = C.judgeMotion(p.host, look, pathNow, opts);
    console.log(`${what}: ok ${v.ok}, ${v.predicted} frames predicted`);
    for (const problem of v.problems) console.log(`  ${wrap(problem, '    ')}`);
  }
}

if (step === 'lead') {
  // Level 6's build, with its exact wind on the client: a plan that leads
  // the flag, for a delay of 1 frame and of 30.
  const p = passes(6, makeGame({ mode: 14, seed: 6 }));
  newRound(p.host);
  const simulate = F.simulator(p.launch, p.aim, p.flight);
  const bytes = p.host.memory();
  const path = C.flagPath(bytes, p.mover, p.reader.flag, 700);
  const state = R.readState(p.host, p.reader, null);
  const predict = (angle, power, wind) =>
    simulate(bytes, { angle, power, wind });
  console.log(`the flag now: ${two(path[0])}, wind ${two(state.wind)}`);
  for (const delay of [1, 30]) {
    const plan = C.lead(state, predict, path, delay);
    const lands = delay + plan.frames;
    const setting = `angle ${plan.angle}, power ${plan.power}`;
    console.log(`delay ${delay}: ${setting}, flies ${plan.frames} frames`);
    const there = `the flag then ${two(path[lands])}`;
    console.log(`  lands at ${two(plan.x)} at frame ${lands}; ${there}`);
  }
}
