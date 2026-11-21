// Count a few decisions, then give the precision of one detector at four base rates.
// node examples/try-count.mjs            the unit 14 checkpoint, examples/detector-checkpoint.mjs
// node examples/try-count.mjs project    your project's detect/detector.mjs
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';

const [folder] = process.argv.slice(2);
const url = folder
  ? pathToFileURL(join(resolve(folder), 'detect', 'detector.mjs')).href
  : new URL('./detector-checkpoint.mjs', import.meta.url).href;
const { count, precisionAt } = await import(url);

// Five sessions: two cheats (one flagged) and three legal sessions (one flagged).
const decisions = [
  { label: 'cheat', flagged: true },
  { label: 'cheat', flagged: false },
  { label: 'legal', flagged: true },
  { label: 'legal', flagged: false },
  { label: 'legal', flagged: false },
];
try {
  console.log(`count(five decisions) ${JSON.stringify(count(decisions))}`);
  console.log(`count([])             ${JSON.stringify(count([]))}`);
  precisionAt(0.5, 0.9, 0.01);
} catch (error) {
  if (!/not written yet/.test(error.message)) throw error;
  console.log(error.message);
  process.exit(0);
}

// The detector of question 14b: recall 0.9, false positive rate 0.01.
console.log(
  'precision of recall 0.9, false positive rate 0.01, when cheats are',
);
for (const n of [2, 10, 100, 1000]) {
  const p = precisionAt(1 / n, 0.9, 0.01);
  console.log(`  1 session in ${String(n).padEnd(5)} ${p.toFixed(3)}`);
}
