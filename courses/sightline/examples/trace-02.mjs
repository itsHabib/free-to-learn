// Show what your module 02 functions do, one step at a time.
// Usage, from the course folder:
//   node examples/trace-02.mjs ./work slots
//   node examples/trace-02.mjs ./work press [SEED]
//   node examples/trace-02.mjs ./work write [SEED]
//   node examples/trace-02.mjs ./work flag [SEED]
//   node examples/trace-02.mjs ./work menu
//   node examples/trace-02.mjs ./work choose
// It runs your files in work/ on the course's game and prints the state.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeGame } from '../host.mjs';

const [work, step, ...rest] = process.argv.slice(2);
const steps = ['slots', 'press', 'write', 'flag', 'menu', 'choose'];
if (!work || !steps.includes(step)) {
  console.error(`Usage: node examples/trace-02.mjs ./work ${steps.join('|')}`);
  process.exit(2);
}
const load = (name) => import(pathToFileURL(join(resolve(work), name)).href);
const S = await load('scan.mjs');
const seed = Number(rest[0] ?? 1);
const fresh = () => makeGame({ mode: 0, seed });
const each = (cands) =>
  S.list(cands).map((c) => `${c.type} slot ${c.slot} at ${c.addr}`);

// One RIGHT press with 2 frames, as the search makes it, and the filters
// that narrow the angle and the power.
function press(host) {
  const all = S.allSlots(host.memory());
  const before = S.snapshot(host.memory());
  host.press('ArrowRight');
  host.tick(2);
  const after = S.snapshot(host.memory());
  const start = { f32: all, i32: all };
  return {
    angle: S.filterDelta(start, before, after, 1),
    power: S.filterUnchanged(start, before, after),
  };
}

if (step === 'slots') {
  const { host } = fresh();
  const bytes = S.snapshot(host.memory());
  const all = S.allSlots(bytes);
  console.log(`memory: ${bytes.length} bytes, ${all.length} slots`);
  console.log(
    `count({ f32: all, i32: all }): ${S.count({ f32: all, i32: all })}`,
  );
  // The four bytes of the float 45, read through both views.
  const four = Uint8Array.from([0x00, 0x00, 0x34, 0x42]);
  const v = S.viewsOf(four);
  console.log(`bytes 00 00 34 42: f32 ${v.f32[0]}, i32 ${v.i32[0]}`);
  const some = { f32: Uint32Array.from([2]), i32: Uint32Array.from([0, 1]) };
  console.log(`list of 1 f32 and 2 i32 candidates:`);
  for (const line of each(some)) console.log(`  ${line}`);
}

if (step === 'press') {
  const { host } = fresh();
  const { angle, power } = press(host);
  console.log(`seed ${seed}: pressed ArrowRight, then ticked 2 frames`);
  console.log(`angle, filterDelta +1: ${S.count(angle)} candidates`);
  for (const line of each(angle)) console.log(`  ${line}`);
  console.log(`power, filterUnchanged: ${S.count(power)} candidates`);
}

if (step === 'write') {
  const { writeTest, read } = await load('find.mjs');
  const { host, truth } = fresh();
  const { angle } = press(host);
  console.log(`seed ${seed}: the ${S.count(angle)} angle candidates`);
  for (const r of writeTest(host, angle)) {
    const now = read(host, r.addr, r.type);
    console.log(`  ${r.type} at ${r.addr}: held ${r.held}, reads ${now} after`);
  }
  const line = S.readCString(host.memory(), truth.lineAddr());
  console.log(`status line: ${line}`);
}

if (step === 'flag') {
  const { host, truth } = fresh();
  const line = S.parseStatus(S.readCString(host.memory(), truth.lineAddr()));
  const near = S.scanNear(S.snapshot(host.memory()), line.wind, 0.051);
  console.log(`seed ${seed}: the status line shows WIND ${line.wind}`);
  console.log(`scanNear within 0.051: ${near.length} slot, at ${near[0] * 4}`);
  const xs = [];
  const ys = [];
  for (let round = 1; round <= 4; round++) {
    host.press('KeyN');
    host.tick(2);
    const red = S.findRed(host.screen());
    xs.push(red.x);
    ys.push(truth.targetX());
    const flag = truth.targetX().toFixed(2);
    console.log(`round ${round}: cloth middle ${red.x}, flag ${flag}`);
  }
  const fit = S.lineFit(xs, ys);
  const two = (x) => x.toFixed(2);
  console.log(
    `lineFit: slope ${two(fit.slope)}, intercept ${two(fit.intercept)}`,
  );
  console.log(`worst residual ${two(fit.worst)}`);
}

if (step === 'menu') {
  const { experimentMenu } = await load('find.mjs');
  const states = [
    { angle: null, power: null, wind: null, flag: null, lineFound: false },
    { angle: 2, power: 65524, wind: null, flag: null, lineFound: true },
  ];
  for (const state of states) {
    console.log(JSON.stringify(state));
    for (const o of experimentMenu(state)) {
      console.log(`  ${o.kind} ${o.target}`);
      console.log(`    ${o.label}`);
    }
  }
}

if (step === 'choose') {
  const { choose } = await load('engine.mjs');
  const options = ['first', 'second', 'third'];
  // Pickers that answer as set, or fail, and count how often they are asked.
  const cases = [
    ['answers 1', () => 1, options],
    ['answers 1.5', () => 1.5, options],
    ['answers "1"', () => '1', options],
    ['is not running', () => Promise.reject(new Error('not running')), options],
    ['answers 1, one option', () => 1, ['only']],
  ];
  for (const [what, answer, menu] of cases) {
    let calls = 0;
    const logged = [];
    const env = {
      models: {
        decide: async () => (calls++, { choice: await answer() }),
      },
      log: (e) => logged.push(`${e.rung}, ${e.step}:`, `  ${e.result}`),
    };
    const got = await choose(env, 'a test', 'state', menu);
    console.log(`picker ${what}: choose returns ${got}, calls ${calls}`);
    for (const line of logged) console.log(`  ${line}`);
  }
}
