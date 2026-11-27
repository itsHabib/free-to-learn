// Show what your module 01 functions do, one step at a time.
// Usage, from the course folder:
//   node examples/trace-01.mjs ./work strings
//   node examples/trace-01.mjs ./work press [SEED] [KEY]
//   node examples/trace-01.mjs ./work controls [SEED]
// It runs your files in work/ on the course's game and prints the state.
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeHost } from '../host.mjs';

const [work, step, ...rest] = process.argv.slice(2);
const steps = ['strings', 'press', 'controls'];
if (!work || !steps.includes(step)) {
  console.error(`Usage: node examples/trace-01.mjs ./work ${steps.join('|')}`);
  process.exit(2);
}
const load = (name) => import(pathToFileURL(join(resolve(work), name)).href);
const S = await load('scan.mjs');
const shown = (text) => JSON.stringify(text);

if (step === 'strings') {
  // The 16 bytes worked by hand in "Finding strings".
  const bytes = Uint8Array.from([
    0x41, 0x42, 0x00, 0x57, 0x49, 0x4e, 0x44, 0x20, 0x2b, 0x32, 0x2e, 0x33,
    0x00, 0x01, 0x02, 0x00,
  ]);
  console.log('findStrings(bytes):', JSON.stringify(S.findStrings(bytes)));
  console.log('readCString(bytes, 3):', shown(S.readCString(bytes, 3)));
  console.log('readCString(bytes, 3, 4):', shown(S.readCString(bytes, 3, 4)));
  console.log(
    'findStrings(bytes, 10):',
    JSON.stringify(S.findStrings(bytes, 10)),
  );
}

if (step === 'press') {
  const seed = Number(rest[0] ?? 1);
  const key = rest[1] ?? 'ArrowRight';
  const host = makeHost({ mode: 0, seed });
  const before = S.snapshot(host.memory());
  host.press(key);
  host.tick(2);
  const after = S.snapshot(host.memory());
  console.log(`seed ${seed}: pressed ${key}, then ticked 2 frames`);
  const changed = S.changedStrings(before, after);
  if (!changed.length) console.log('no string changed at the same address');
  for (const s of changed) {
    const was = S.readCString(before, s.addr);
    console.log(`changed at ${s.addr}: ${shown(was)}`);
    console.log(`  now ${shown(s.text)}`);
    console.log(`  label ${shown(S.changedLabel(was, s.text))}`);
  }
}

if (step === 'controls') {
  const { learnControls } = await load('engine.mjs');
  const real = makeHost({ mode: 0, seed: Number(rest[0] ?? 1) });
  const pressed = [];
  // The same host, except that it writes down every key press.
  const host = {
    ...real,
    press: (key) => (pressed.push(key), real.press(key)),
  };
  const env = { log: (e) => console.log(`  ${e.step}: ${e.result}`) };
  const kit = {};
  for (const run of ['empty kit', 'same kit again']) {
    pressed.length = 0;
    console.log(`learnControls with ${run}:`);
    await learnControls(host, kit, env);
    console.log(`  pressed: ${pressed.join(' ')}`);
  }
  console.log('kit.controls:');
  for (const [name, key] of Object.entries(kit.controls)) {
    console.log(`  ${name}: ${key}`);
  }
  console.log(`kit.statusLine: ${kit.statusLine}`);
  console.log(`kit.message: ${kit.message}`);
}
