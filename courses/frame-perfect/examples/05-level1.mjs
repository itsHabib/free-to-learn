// Level 1 by breadth-first search (bfs), or by A* with the walking bound and with a bound that
// overestimates because it divides by 12 sub-pixels a frame instead of 24 (astar).
//   node examples/05-level1.mjs ./work bfs
//   node examples/05-level1.mjs ./work astar
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADDR, TILE, W } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';

const tas = await import(pathToFileURL(join(resolve(process.argv[2] ?? './work'), 'tas.mjs')).href);
const level = loadLevel('level1');
const flagX = tas.flagColumn(level) * TILE;
const tooHigh = (s) => Math.ceil(Math.max(0, flagX - (tas.peek(s, ADDR.X, 'u16') + W - 1)) / 12);

const astar = process.argv[3] === 'astar';
const runs = astar
  ? [
      ['A*, walking bound', { heuristic: tas.walkingBound(level) }],
      ['A*, bound / 12', { heuristic: tooHigh }],
    ]
  : [['breadth-first', {}]];
for (const [name, opts] of runs) {
  const r = tas.search(level, opts);
  console.log(`${name.padEnd(18)} ${r.frames} frames, ${r.expanded.toLocaleString('en-US')} states expanded`);
}
