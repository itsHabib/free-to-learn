// Brute force against de-duplicated search, to a marker 12 px right of and 8 px above room 0's start.
//   node examples/05-marker.mjs ./work
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newState, ADDR } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';

const tas = await import(pathToFileURL(join(resolve(process.argv[2] ?? './work'), 'tas.mjs')).href);
const room = loadLevel('room0');
const start = newState(room);
const x0 = tas.peek(start, ADDR.X, 'u16');
const y0 = tas.peek(start, ADDR.Y, 'u16');
// Positions are in sub-pixels: 16 to a pixel. Y grows downward, so "8 px up" is a smaller y.
const goal = (s) => tas.peek(s, ADDR.X, 'u16') >= x0 + 12 * 16 && tas.peek(s, ADDR.Y, 'u16') <= y0 - 8 * 16;

const brute = tas.bruteForce(room, 12, goal);
console.log(`brute force: ${brute.frames} frames, ${brute.expanded.toLocaleString('en-US')} states expanded`);
try {
  const found = tas.search(room, { goal });
  console.log(`search:      ${found.frames} frames, ${found.expanded.toLocaleString('en-US')} states expanded`);
  console.log(`search did ${((100 * found.expanded) / brute.expanded).toFixed(2)}% of brute force's work`);
} catch (e) {
  console.log(`search:      ${e.message}`);
}
