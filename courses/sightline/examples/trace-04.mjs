// Show what your module 04 functions do, one step at a time.
// Usage, from the course folder:
//   node examples/trace-04.mjs ./work leb
//   node examples/trace-04.mjs ./work sections
//   node examples/trace-04.mjs ./work names
//   node examples/trace-04.mjs ./work decode
//   node examples/trace-04.mjs ./work depth
// It runs your wasm.mjs in work/ on the game's file and prints what it
// returns.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [work, step] = process.argv.slice(2);
const steps = ['leb', 'sections', 'names', 'decode', 'depth'];
if (!work || !steps.includes(step) || process.argv.length !== 4) {
  console.error(`Usage: node examples/trace-04.mjs ./work ${steps.join('|')}`);
  process.exit(2);
}
const file = join(resolve(work), 'wasm.mjs');
const W = await import(pathToFileURL(file).href);
const lob = () => new Uint8Array(readFileSync(join(root, 'game', 'lob.wasm')));
const bytesOf = (text) =>
  Uint8Array.from(text.split(' '), (b) => parseInt(b, 16));
const show = (v) => (typeof v === 'bigint' ? `${v}n` : JSON.stringify(v));

if (step === 'leb') {
  for (const [read, text] of [
    ['readU32', '1F'],
    ['readU32', 'C2 2E'],
    ['readU32', 'A0 E2 04'],
    ['readU32', 'A0 E2 84 80 00'],
    ['readS32', '7F'],
    ['readS32', 'E8 00'],
    ['readS32', '80 80 04'],
  ]) {
    const { value, next } = W[read](bytesOf(text), 0);
    console.log(`${read}(${text}): value ${value}, next ${next}`);
  }
}

if (step === 'sections') {
  const mod = W.parseModule(lob());
  const { types, imports, funcTypes, exports, globals, code, data } = mod;
  console.log(`types ${types.length}, the first ${show(types[0])}`);
  const names = imports.map((i) => `${i.module}.${i.name}`).join(', ');
  console.log(`imports ${imports.length}: ${names}`);
  console.log(`importedFuncs ${mod.importedFuncs}`);
  console.log(`funcTypes ${funcTypes.length}, the first type ${funcTypes[0]}`);
  console.log(`code ${code.length} bodies`);
  const first = exports.slice(0, 2).map((e) => `${e.name} kind ${e.kind}`);
  console.log(`exports ${exports.length}, the first ${first.join(', ')}`);
  const g = globals[0];
  console.log(`globals ${globals.length}: ${g.type}, ${g.mutable}, ${g.init}`);
  console.log(
    `data ${data.length}: ${data[0].size} bytes at ${data[0].offset}`,
  );
}

if (step === 'names') {
  const mod = W.parseModule(lob());
  for (const index of [1, 4, 5, 7, 9]) {
    const t = W.funcType(mod, index);
    const sig = `(${t.params.join(' ')}) -> (${t.results.join(' ')})`;
    console.log(`${index}: ${W.funcName(mod, index)} ${sig}`);
  }
}

if (step === 'decode') {
  const mod = W.parseModule(lob());
  for (const ins of W.decode(mod, 9)) {
    const imm = ins.imm.map(show).join(' ');
    console.log(`${ins.depth} ${ins.op}${imm ? ` ${imm}` : ''}`);
  }
}

if (step === 'depth') {
  // A small module written by hand: one function with an if and an else.
  const body = [
    ['02 40', 'block'],
    ['20 00', 'local.get 0'],
    ['04 40', 'if'],
    ['41 01', 'i32.const 1'],
    ['21 01', 'local.set 1'],
    ['05', 'else'],
    ['41 02', 'i32.const 2'],
    ['21 01', 'local.set 1'],
    ['0B', 'end'],
    ['0B', 'end'],
    ['0B', 'end'],
  ];
  const code = bytesOf(`01 01 7F ${body.map(([b]) => b).join(' ')}`);
  const sec = (id, b) => [id, b.length, ...b];
  const file = Uint8Array.from([
    ...bytesOf('00 61 73 6D 01 00 00 00'),
    ...sec(0x01, [0x01, 0x60, 0x01, 0x7f, 0x00]),
    ...sec(0x03, [0x01, 0x00]),
    ...sec(0x0a, [0x01, code.length, ...code]),
  ]);
  const mod = W.parseModule(file);
  for (const ins of W.decode(mod, 0)) {
    const imm = ins.imm.map(show).join(' ');
    console.log(`${ins.depth} ${ins.op}${imm ? ` ${imm}` : ''}`);
  }
}
