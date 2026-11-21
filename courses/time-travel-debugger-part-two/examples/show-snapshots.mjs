// Open a recording with your Debugger and print what its snapshots hold.
// Usage: node examples/show-snapshots.mjs PROJECT RECORDING
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProgram } from '../public/program.mjs';

const [project, file] = process.argv.slice(2);
if (!project || !file || process.argv.length !== 4) {
  console.error('Usage: node examples/show-snapshots.mjs PROJECT RECORDING');
  process.exit(2);
}
const { Debugger } = await import(
  pathToFileURL(join(resolve(project), 'debugger.mjs')).href
);
const recording = JSON.parse(readFileSync(file, 'utf8'));
const d = new Debugger(readProgram(recording.program), recording);
const snaps = d.snapshots;
const memory = snaps[0].pages.reduce((n, page) => n + page.length, 0);
const distinct = new Set(snaps.flatMap((s) => s.pages));
let held = 0;
for (const page of distinct) held += page.length;
const copied = snaps
  .slice(1)
  .map(
    (s, i) => s.pages.filter((page, p) => page !== snaps[i].pages[p]).length,
  );
const most = Math.max(...copied);
console.log(`${file}: ${d.end} instructions, ${snaps.length} snapshots`);
console.log(
  `each snapshot: ${snaps[0].pages.length} pages of ${snaps[0].pages[0].length} bytes, ${memory} bytes in all`,
);
console.log(
  `full copies would hold ${snaps.length * memory} bytes; these hold ${held} (${((100 * held) / (snaps.length * memory)).toFixed(2)}%)`,
);
console.log(
  `pages copied by a snapshot after the first: at most ${most}, on average ${(copied.reduce((a, b) => a + b, 0) / copied.length).toFixed(2)}`,
);
const last = snaps.at(-1);
const owners = last.pages.map((page) =>
  snaps.findIndex((s) => s.pages.includes(page)),
);
console.log(
  'the last snapshot, page by page, holds the copy made by snapshot:',
);
for (let p = 0; p < owners.length; p += 8)
  console.log(`  pages ${p}-${p + 7}: ${owners.slice(p, p + 8).join(' ')}`);
