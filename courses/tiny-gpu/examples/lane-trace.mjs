// lambert.asm on one lane, one instruction at a time, through your
// own assemble and step in project/gpu/shader.mjs (or FOLDER/gpu/).
// Run from the course folder: node examples/lane-trace.mjs [FOLDER]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Your project's code: ./project, or the folder you name.
const dir = process.argv[2] ?? 'project';
const load = (f) => import(pathToFileURL(resolve(dir, 'gpu', f)).href);
const { assemble, loadLane, runLane, step } = await load('shader.mjs');

const text = readFileSync('scenes/shaders/lambert.asm', 'utf8');
const lines = text.split('\n');

// region: trace
// A pale orange pixel whose surface faces up: r g b u v nx ny nz.
const attrs = [0.9, 0.6, 0.3, 0, 0, 0, 1, 0];
const show = (v) => +v.toPrecision(6);
const program = assemble(text);
const lane = loadLane(program, attrs);
const inputs = [...lane.r.slice(0, 6)].map(show);
console.log(`inputs r0..r5 = ${inputs.join(', ')}`);
for (const ins of program.code) {
  step(lane, ins, {});
  const src = lines[ins.line - 1].split(';')[0].trim();
  const d = ins.args[0].r;
  const after = ins.op === 'out' ? '' : `r${d} = ${show(lane.r[d])}`;
  console.log(`${src.padEnd(25)}${after}`.trimEnd());
}
console.log(`out    ${lane.out.map(show).join(', ')}`);
console.log(`issues ${runLane(program, attrs, {}).issues}`);
// endregion: trace
