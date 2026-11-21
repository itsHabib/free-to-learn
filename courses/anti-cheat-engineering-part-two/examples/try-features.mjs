// Run your features on the first dev session of each kind, one named part at a time, each
// where lesson 14 asks for it:
//   run    whether features runs on every session, and which values are null, with no
//          values printed (after the features region, before question 14a)
//   table  the eight features of each session (after question 14a)
// node examples/try-features.mjs PART            the unit 14 checkpoint, examples/features-checkpoint.mjs
// node examples/try-features.mjs project PART    your project's detect/features.mjs
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { firstSessions, play } from './first-sessions.mjs';

const PARTS = ['run', 'table'];
const args = process.argv.slice(2);
const [folder, part] = PARTS.includes(args[0]) ? [null, args[0]] : args;
if (!PARTS.includes(part) || args.length > (folder ? 2 : 1)) {
  console.log(
    `Name the part lesson 14 asks for, one of ${PARTS.join(', ')}: node examples/try-features.mjs project ${PARTS[0]}`,
  );
  process.exit(1);
}
const url = folder
  ? pathToFileURL(join(resolve(folder), 'detect', 'features.mjs')).href
  : new URL('./features-checkpoint.mjs', import.meta.url).href;
const { features } = await import(url);

const cases = firstSessions();
let rows;
try {
  rows = cases.map((c) => features(play(c)));
} catch (error) {
  if (!/not written yet/.test(error.message)) throw error;
  console.log(error.message);
  process.exit(0);
}

if (part === 'run') {
  // Only the shape of the answers: the values wait for question 14a.
  const names = Object.keys(rows[0]);
  const nulls = cases.flatMap((c, i) =>
    names
      .filter((name) => rows[i][name] === null)
      .map((name) => `${c.kind} ${name}`),
  );
  console.log(
    `features ran on the first dev session of each of the ${cases.length} kinds and gave ${names.length} values each: ${names.join(', ')}.`,
  );
  console.log(`null: ${nulls.length ? nulls.join(', ') : 'none'}.`);
  process.exit(0);
}

// Whole numbers as they are, others to three decimals, null as a dash.
const cell = (x) =>
  (x === null ? '-' : Number.isInteger(x) ? String(x) : x.toFixed(3)).padStart(
    12,
  );
console.log(''.padEnd(13) + cases.map((c) => c.kind.padStart(12)).join(''));
for (const name of Object.keys(rows[0]))
  console.log(name.padEnd(13) + rows.map((f) => cell(f[name])).join(''));
