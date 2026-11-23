// One octave of noise against six octaves of ridged noise, along one line, with stage 2's own functions.
// Run from the course folder: node examples/profile.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// Load the "(pure)" regions of the stage file, as the lab's checks do.
const stage = join(import.meta.dirname, '..', 'stages', 'world-02.html');
const html = readFileSync(stage, 'utf8');
const regions = html.matchAll(
  /\/\/ region: (.+\(pure\))\n([\s\S]*?)\/\/ endregion: \1/g,
);
const world = vm.createContext({});
vm.runInContext([...regions].map((m) => m[2]).join('\n'), world);
const { noiseD, ridged } = world;

// region: profile
const D = [0, 0];
const bar = (v, width) => '#'.repeat(Math.round(v * width));
console.log('   x   noise (one octave)        ridged (six octaves)');
for (let i = 0; i <= 24; i++) {
  const x = i / 8; // three noise cells, eight samples each
  const n = noiseD(x, 0.5, 10, D); // about -1 to 1
  const r = ridged(x, 0.5, 10, D); // 0 to 1
  const left = `${n.toFixed(2).padStart(5)} ${bar((n + 1) / 2, 16)}`;
  console.log(
    `${x.toFixed(3)} ${left.padEnd(24)} ${r.toFixed(2)} ${bar(r, 20)}`,
  );
}
// endregion: profile
