// Distinct states within d frames of level 1's start, for d = 0 to 12, with your key as written and
// with the random state kept in it. Level 1 has no bell, so stateKey(state, true) keeps the random state.
//   node examples/05-count.mjs ./work
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadLevel } from '../game/levels.mjs';
import { newState, step, ADDR, INPUTS } from '../game/core.mjs';

const tas = await import(pathToFileURL(join(resolve(process.argv[2] ?? './work'), 'tas.mjs')).href);

function within(level, depth, key) {
  let frontier = [newState(level)];
  const seen = new Set([key(frontier[0])]);
  const totals = [1];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const state of frontier) {
      for (const input of INPUTS) {
        const s = step(tas.load(state), input);
        if (s.ram[ADDR.DEAD] || seen.has(key(s))) continue;
        seen.add(key(s));
        next.push(s);
      }
    }
    totals.push(totals[d - 1] + next.length);
    frontier = next;
  }
  return totals;
}

const level = loadLevel('level1');
const right = within(level, 12, (s) => tas.stateKey(s));
const kept = within(level, 12, (s) => tas.stateKey(s, true));
console.log('within  your key  random kept');
for (let d = 0; d <= 12; d += 2) {
  console.log(`${String(d).padStart(6)}  ${right[d].toLocaleString('en-US').padStart(8)}  ${kept[d].toLocaleString('en-US').padStart(11)}`);
}
