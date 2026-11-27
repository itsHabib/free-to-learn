// Check your encodeS32 (module 04's new case) and keep a record of the try.
// Usage, from the course folder:
//   node examples/check-encode.mjs ./work [--help-used "what helped"]
// Each try is saved under work/.attempts/ before your code is loaded, with a
// copy of encode-leb.mjs and of every file it can import from your folder,
// and runs from that copy, so a file that can't load is a try too.
// The check builds a tiny WebAssembly file of its own around each of your
// encodings, a function that pushes the constant and returns it, and asks
// Node's WebAssembly to load and call it. The game's file is never run.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
  console.error('Usage: node examples/check-encode.mjs ./work');
  console.error('       [--help-used "what helped"]');
  process.exit(2);
}
const work = resolve(args[0]);
const file = join(work, 'encode-leb.mjs');
if (!existsSync(file)) {
  console.error(`${file} is missing. Add it with:`);
  console.error(`node examples/start-04.mjs ${args[0]} new-case`);
  process.exit(2);
}

// Your file runs without WebAssembly, as your engine's files do.
const WA = globalThis.WebAssembly;
delete globalThis.WebAssembly;
const attempt = beginAttempt(work, 'encode', 'encode-leb.mjs', helpUsed);
const { encodeS32 } = await loadForAttempt(attempt);

// Values on either side of each place where one more byte is needed.
const CASES = [
  0, 1, -1, 63, 64, -64, -65, 127, 128, -128, 8191, 8192, -8193, 1048575,
  -1048577, 134217727, 134217728, -134217729, 2147483646, -2147483648,
];

// A module with one exported function, () -> i32, whose body is
// i32.const with your bytes, then end.
function moduleFor(bytes) {
  const body = [0x00, 0x41, ...bytes, 0x0b];
  const section = (id, contents) => [id, contents.length, ...contents];
  return Uint8Array.from([
    ...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
    ...section(0x01, [0x01, 0x60, 0x00, 0x01, 0x7f]),
    ...section(0x03, [0x01, 0x00]),
    ...section(0x07, [0x01, 0x01, 0x66, 0x00, 0x00]),
    ...section(0x0a, [0x01, body.length, ...body]),
  ]);
}

// A last byte that adds nothing: 00 after a byte with bit 6 clear, or
// 7F after a byte with bit 6 set, could be left off.
const longer = (bytes) => {
  if (bytes.length < 2) return false;
  const [before, last] = bytes.slice(-2);
  const sign = before & 0x40;
  return (last === 0x00 && !sign) || (last === 0x7f && sign);
};

// A list of whole numbers from 0 to 255, the only result printed as hex.
const isBytes = (bytes) =>
  Array.isArray(bytes) &&
  bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
const hex = (bytes) =>
  bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const results = [];
for (const value of CASES) {
  let bytes;
  let got;
  let why = null;
  try {
    bytes = encodeS32(value);
    const ok = isBytes(bytes) && bytes.length >= 1 && bytes.length <= 5;
    if (!ok) throw new Error(`returned ${shown(bytes)}`);
    const instance = new WA.Instance(new WA.Module(moduleFor(bytes)));
    got = instance.exports.f();
    if (got !== value) why = `Node's WebAssembly reads ${got}`;
    else if (longer(bytes)) why = 'its last byte adds nothing';
  } catch (error) {
    why = String(error.message ?? error).split('\n')[0];
  }
  const pass = why === null;
  results.push({ value, bytes: bytes ?? null, got: got ?? null, why, pass });
  const said = isBytes(bytes) ? hex(bytes) : shown(bytes);
  const tail = pass ? '' : `: ${why}`;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${value} as ${said}${tail}`);
}

if (results.some((r) => !r.pass)) {
  console.log(
    'A pass is the shortest list of bytes, whole numbers from 0 to 255,' +
      ' that an i32.const reads as the number (lesson 04, "A new case:' +
      ' write a number in LEB128").',
  );
}
finishAttempt(attempt, results);
const passed = results.filter((r) => r.pass).length;
console.log(`${passed} of ${results.length} cases passed.`);
console.log(`This try is saved in ${attempt.dir}.`);
process.exitCode = passed === results.length ? 0 : 1;
