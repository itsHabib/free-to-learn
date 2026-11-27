// Proof for the Frame Perfect films: re-derives every number the two cuts show or say, from the game, the
// reference level 2 run and the recorded outputs in examples/, and fails if one differs.
//   node films/capture.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newState, step, ADDR, SUB, TILE, W, R } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';
import { OPEN_ROOM } from '../game/fixtures.mjs';
import { readMovie } from '../reference/tas.mjs';

const course = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(course, p), 'utf8');
const u16 = (ram, a) => ram[a] | (ram[a + 1] << 8);
const s16 = (ram, a) => (u16(ram, a) << 16) >> 16;
const px = (sub) => sub / SUB;

// Par, and the two searches' recorded results.
const level2 = loadLevel('level2');
assert.equal(level2.par, 100);
const astar = Number(read('examples/06-astar.txt').match(/(\d+) frames/)[1]);
const bfs = Number(read('examples/06-bfs.txt').match(/(\d+) frames/)[1]);
assert.equal(astar, 121);
assert.equal(bfs, 70);
// "With the game working as its makers meant, the best run takes 186 frames": measured on patched copies with
// both bugs fixed (lessons/06.md). The breadth-first run is 186 - 70 = 116 frames shorter.
assert.match(read('lessons/06.md'), /With both fixed, it's 186/);
assert.equal(186 - bfs, 116);

// The reference run is the 70-frame breadth-first movie; replay it and compare with the recorded watch table.
const inputs = readMovie(read('reference/movies/level2.movie')).inputs;
assert.equal(inputs.length, bfs);
const s = newState(level2);
const rows = {};
for (let f = 0; f < inputs.length; f++) { step(s, inputs[f]); rows[f + 1] = { x: px(u16(s.ram, ADDR.X)), vx: px(s16(s.ram, ADDR.VX)), done: s.ram[ADDR.DONE] }; }
assert.equal(rows[70].done, 1);
for (const line of read('examples/06-watch.txt').trim().split('\n').slice(1)) {
  const [frame, , x, vx] = line.trim().split(/\s+/);
  assert.equal(rows[frame].x, Number(x), `x on frame ${frame}`);
  assert.equal(rows[frame].vx, Number(vx), `vx on frame ${frame}`);
}
// The wall: the first solid tile left of the flag. Frame 66: front edge just short of it; frame 67: past it.
const fy = level2.tiles.findIndex((r) => r.includes('F'));
let col = level2.tiles[fy].indexOf('F');
while (level2.tiles[fy][col] !== '#') col--;
const wallX = (col * TILE) / SUB;
assert.equal(wallX, 272);
assert.equal(rows[66].x + W / SUB, wallX); // front edge at 272: just short of the tile's first pixel column
assert.equal(rows[67].vx, 5);
assert.equal(rows[67].x, wallX + TILE / SUB); // 280, the far side
const depth = rows[66].x + rows[67].vx + W / SUB - wallX;
assert.ok(depth > TILE / SUB / 2, 'past halfway');
assert.equal(depth, 5);

// Walking speed, the belt, the boost, and eight landing-frame jumps to six pixels a frame.
const walk = newState(OPEN_ROOM);
let walkMax = 0;
for (let f = 0; f < 10; f++) { step(walk, R); walkMax = Math.max(walkMax, px(s16(walk.ram, ADDR.VX))); }
assert.equal(walkMax, 1.5);
const speed = read('examples/06-watch-speed.txt').trim().split('\n').slice(1).map((l) => l.trim().split(/\s+/));
assert.deepEqual(speed.find((r) => r[0] === '10').slice(3), ['2.0']); // the belt makes two
assert.deepEqual(speed.find((r) => r[0] === '12').slice(1), ['|.RJ|', '27.5', '2.5']); // a jump at two adds half
let boosts = 0;
for (let f = 2; f <= 70 && rows[f - 1].vx < 6; f++) if (rows[f].vx > rows[f - 1].vx && rows[f].vx > 2) boosts++;
assert.equal(boosts, 8);
assert.equal(Math.max(...Object.values(rows).map((r) => r.vx)), 6);

// The code on screen is game/core.mjs at the lines the script names.
const core = read('game/core.mjs').split('\n');
assert.match(core[129], /^function moveX\(st, vx\) \{/);
assert.match(core[140], /const farSide = depth > TILE \/ 2;/);
assert.match(core[214], /vx \+= dir \* BOOST;/);
assert.match(core[217], /if \(Math\.abs\(vx\) > WALK_MAX\) vx = Math\.sign\(vx\) \* WALK_MAX;/);

console.log(JSON.stringify({ par: level2.par, astar, bfs, wallX, frame66: rows[66], frame67: rows[67], depth, walkMax, boosts }, null, 1));
console.log('every number in the films re-derives');
