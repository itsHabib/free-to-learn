// escape.asm on one warp whose lanes leave after 3, 3, 3, 3, 3, 3, 3
// and 40 turns, through your own runWarp (project/gpu/warp.mjs, or
// FOLDER/gpu/), against each lane run alone.
// Run from the course folder: node examples/escape-warp.mjs [FOLDER]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Your project's code: ./project, or the folder you name.
const dir = process.argv[2] ?? 'project';
const load = (f) => import(pathToFileURL(resolve(dir, 'gpu', f)).href);
const { assemble, loadLane, runLane } = await load('shader.mjs');
const { runWarp } = await load('warp.mjs');

const program = assemble(
  readFileSync('scenes/shaders/escape.asm', 'utf8'),
);
// r g b u v nx ny nz for each lane: seven points that escape after
// 3 turns, and one inside the set that runs all 40.
const at = (u, v) => [1, 1, 1, u, v, 0, 0, 1];
const us = [0.203125, 0.2109375, 0.21875, 0.2265625, 0.234375];
const attrs = [...us, 0.2421875, 0.25].map((u) => at(u, 0.125));
attrs.push(at(0.75, 0.5));

// region: alone
const alone = attrs.map((a) => runLane(program, a, {}).issues);
const turns = attrs.map((a) => runLane(program, a, {}).out[0] / 0.025);
console.log(`turns per lane:  ${turns.map(Math.round).join(', ')}`);
console.log(`issues alone:    ${alone.join(', ')}`);
// endregion: alone
// region: warp
const lanes = attrs.map((a) => loadLane(program, a));
const warp = runWarp(program, lanes, 0xff, {}, {});
console.log(`issues as one warp: ${warp.issues}`);
// endregion: warp
