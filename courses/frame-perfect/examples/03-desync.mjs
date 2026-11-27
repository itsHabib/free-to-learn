// Module 3: the level 1 run made on version 1.0, replayed on 1.0 and 1.1. Finds the first frame after
// which the two disagree with your firstDivergence, then names the addresses with your diffRam.
// Run it from the course folder: node examples/03-desync.mjs ./work
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newState, step, hash, ADDR } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';
import { MOVIES } from '../game/fixtures.mjs';

const work = resolve(process.argv[2] ?? './work');
const { firstDivergence, diffRam } = await import(pathToFileURL(resolve(work, 'tas.mjs')).href);

const level = loadLevel('level1');
const movie = MOVIES.level1Run;
const n = movie.length;

// The state of one build after k frames of the movie, played from frame 0.
function after(version, k) {
  const state = newState(level, version);
  for (let i = 0; i < k && !state.ram[ADDR.DONE]; i++) step(state, movie[i]);
  return state;
}
const outcome = (s) => (s.ram[ADDR.DONE] ? `reaches the flag on frame ${s.ram[ADDR.FRAME]}` : 'does not reach the flag');
console.log(`level 1 run, ${n} frames: on 1.0 it ${outcome(after('1.0', n))}; on 1.1 it ${outcome(after('1.1', n))}`);

// A probe stands for the expensive step: a full state from each build after k frames, compared.
const asked = [];
const probe = (k) => { asked.push(k); return hash(after('1.0', k)) === hash(after('1.1', k)); };
const frame = firstDivergence(probe, n);
console.log(`first disagreement after frame ${frame}, found with ${asked.length} probes: ${asked.join(' ')}`);
console.log(`the bound is ceil(log2 ${n}) + 1 = ${Math.ceil(Math.log2(n)) + 1}; a scan from frame 1 needs ${frame} probes`);
console.log(`diffRam after frame ${frame}: ${diffRam(after('1.0', frame), after('1.1', frame)).join(', ')}`);

const u16 = (s, a) => s.ram[a] | (s.ram[a + 1] << 8);
const s16 = (s, a) => (u16(s, a) ^ 0x8000) - 0x8000;
console.log('frame  version     x    y   vy');
for (let k = frame - 2; k <= frame + 1; k++) {
  for (const v of ['1.0', '1.1']) {
    const s = after(v, k);
    console.log(`${String(k).padStart(5)}  ${v.padEnd(7)} ${[u16(s, ADDR.X), u16(s, ADDR.Y), s16(s, ADDR.VY)].map((x) => String(x).padStart(5)).join('')}`);
  }
}
