// Show what your module 05 functions do, one step at a time.
// Usage, from the course folder:
//   node examples/trace-05.mjs ./work tiny
//   node examples/trace-05.mjs ./work key
//   node examples/trace-05.mjs ./work eval
//   node examples/trace-05.mjs ./work sim [SEED]
// It runs your files in work/ on the course's game and prints what they
// return.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gameBytes, makeGame } from '../host.mjs';

const [work, step, ...rest] = process.argv.slice(2);
const steps = ['tiny', 'key', 'eval', 'sim'];
if (!work || !steps.includes(step)) {
  console.error(`Usage: node examples/trace-05.mjs ./work ${steps.join('|')}`);
  process.exit(2);
}
const load = (name) => import(pathToFileURL(join(resolve(work), name)).href);
const W = await load('wasm.mjs');
const L = await load('lift.mjs');

// The opcode byte of i32.store, written in decimal.
const STORE = 54;

// A module written by hand: one function, (i32) -> (), with the body given.
function tiny(body) {
  const code = [0x00, ...body, 0x0b];
  const sec = (id, b) => [id, b.length, ...b];
  const bytes = Uint8Array.from([
    ...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
    ...sec(0x01, [0x01, 0x60, 0x01, 0x7f, 0x00]),
    ...sec(0x03, [0x01, 0x00]),
    ...sec(0x0a, [0x01, code.length, ...code]),
  ]);
  return L.lift(W.parseModule(bytes), 0);
}

if (step === 'tiny') {
  const bodies = {
    // i32.const 100, local.get 0, i32.const 1, i32.add, i32.store offset=4
    'a store of param0 + 1': [0x41, 0xe4, 0x00, 0x20, 0x00, 0x41, 0x01].concat([
      0x6a,
      STORE,
      0x02,
      0x04,
    ]),
    // block, local.get 0, i32.eqz, br_if 0, i32.const 300, i32.const 5,
    // i32.store, end, i32.const 304, i32.const 9, i32.store
    'a block left early by br_if': [0x02, 0x40, 0x20, 0x00, 0x45, 0x0d, 0x00]
      .concat([0x41, 0xac, 0x02, 0x41, 0x05, STORE, 0x02, 0x00, 0x0b])
      .concat([0x41, 0xb0, 0x02, 0x41, 0x09, STORE, 0x02, 0x00]),
  };
  for (const [what, body] of Object.entries(bodies)) {
    console.log(`${what}:`);
    for (const st of tiny(body).stores) {
      console.log(`  at ${st.at}: ${L.showStore(st)}`);
    }
  }
}

if (step === 'key') {
  const mod = W.parseModule(gameBytes('lob'));
  const all = L.liftAll(mod);
  const key = all.get('game_key');
  const stores = key.stores.filter((st) => !st.inLoop);
  console.log(`liftAll: ${all.size} functions`);
  console.log(`game_key: ${stores.length} stores, ${key.calls.length} calls`);
  // Each store's type, how many conditions guard it, and whether its
  // value calls sin or cos.
  for (const st of stores) {
    const trig = /\b(sin|cos)\(/.test(L.show(st.value)) ? ', sin or cos' : '';
    console.log(`  ${st.type}, ${st.guard.length} conditions${trig}`);
  }
}

if (step === 'eval') {
  const { make, constant } = L;
  const p0 = make({ op: 'param', index: 0 });
  const add = make({ op: 'i32.add', args: [p0, constant('i32', 1)] });
  const given = new Map([[p0, 41]]);
  console.log(`${L.show(add)} with param0 41: ${L.evaluate(add, { given })}`);
  const third = make({
    op: 'f32.div',
    args: [constant('f32', 1), constant('f32', 3)],
  });
  console.log(`${L.show(third)}: ${L.evaluate(third, {})}`);
  const wrap = make({
    op: 'i32.mul',
    args: [constant('i32', 65536), constant('i32', 65536)],
  });
  console.log(`${L.show(wrap)}: ${L.evaluate(wrap, {})}`);
  const below = make({
    op: 'i32.lt_u',
    args: [constant('i32', -2), constant('i32', 3)],
  });
  console.log(`${L.show(below)}, unsigned: ${L.evaluate(below, {})}`);
  const unknown = make({ op: 'i32.add', args: [p0, constant('i32', 1)] });
  console.log(
    `${L.show(unknown)} with param0 unknown: ${L.evaluate(unknown, {})}`,
  );
}

if (step === 'sim') {
  const F = await load('flight.mjs');
  const seed = Number(rest[0] ?? 1);
  const all = L.liftAll(W.parseModule(gameBytes('lob')));
  const key = all.get('game_key');
  const launch = F.launchOf(key);
  const aim = F.aimValues(key, launch);
  const flight = F.flightOf(all.get('game_tick'), launch);
  const simulate = F.simulator(launch, aim, flight);
  const { host, truth } = makeGame({ mode: 0, seed });
  const keys = {
    angle: ['ArrowRight', 'ArrowLeft'],
    power: ['ArrowUp', 'ArrowDown'],
  };
  console.log(`seed ${seed}: simulated from memory, then fired`);
  for (const [angle, power] of [
    [30, 70],
    [55, 80],
    [40, 85],
  ]) {
    host.press('KeyN');
    host.tick(2);
    const set = (name, want) => {
      const now = () => Math.round(truth[name]());
      while (now() !== want) host.press(keys[name][now() < want ? 0 : 1]);
    };
    set('angle', angle);
    set('power', power);
    const p = simulate(host.memory(), { angle, power });
    host.press('Space');
    let frames = 0;
    while (!truth.message()) {
      host.tick(1);
      frames++;
    }
    const sim = `${p.x.toFixed(2)} after ${p.frames}`;
    const game = `${truth.impactX().toFixed(2)} after ${frames}`;
    console.log(`  ${angle}/${power}: ${sim}; the game ${game}`);
  }
}
