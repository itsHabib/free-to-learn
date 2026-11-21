// Build your index of a recording and print what it kept and what it cost.
// Usage: node examples/show-index.mjs PROJECT RECORDING
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProgram } from '../public/program.mjs';

const [project, file] = process.argv.slice(2);
if (!project || !file || process.argv.length !== 4) {
  console.error('Usage: node examples/show-index.mjs PROJECT RECORDING');
  process.exit(2);
}
const load = (name) => import(pathToFileURL(join(resolve(project), name)).href);
const { Machine } = await load('machine.mjs');
const { buildIndex } = await load('query.mjs');
let steps = 0;
const step = Machine.prototype.step;
Machine.prototype.step = function (...args) {
  steps++;
  return step.apply(this, args);
};

const recording = JSON.parse(readFileSync(file, 'utf8'));
const index = buildIndex(readProgram(recording.program), recording);
const built = steps;
console.log(
  `${file}: ${index.end} instructions in ${recording.calls.length} calls`,
);
console.log(`building the index ran ${built} instructions on your machine`);

// Walk every byte's list backward through lastWriter, from the end of the run.
let entries = 0;
let written = 0;
let most = { address: 0, writes: 0 };
let stores = 0;
const memory = readProgram(recording.program).memory.min * 65536;
for (let address = 0; address < memory; address++) {
  let writes = 0;
  for (
    let w = index.lastWriter(address, index.end + 1);
    w;
    w = index.lastWriter(address, w.tick)
  ) {
    writes++;
    if (w.address === address) stores++;
  }
  entries += writes;
  if (writes) written++;
  if (writes > most.writes) most = { address, writes };
}
console.log(
  `per-byte lists: ${entries} entries, for ${written} bytes written at least once`,
);
console.log(
  `the most written byte is ${most.address}, written ${most.writes} times; a binary search in its list takes at most ${Math.ceil(Math.log2(most.writes + 1))} comparisons`,
);

// Ask sources about every store, newest first, and count instructions again.
steps = 0;
let longest = 0;
for (let address = 0; address < memory; address++)
  for (
    let w = index.lastWriter(address, index.end + 1);
    w;
    w = index.lastWriter(address, w.tick)
  )
    if (w.address === address)
      longest = Math.max(longest, index.sources(w.tick).stores.length);
console.log(
  `sources asked about all ${stores} stores: the longest chain holds ${longest} stores`,
);
console.log(`instructions run while answering those questions: ${steps}`);
