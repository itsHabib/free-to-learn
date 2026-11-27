// Movies and rooms the checks use. None of them is the answer to a module: the level 1 run is the one
// module 3 replays (any careful player can match its count), and the clip yard is not level 2.
import { parseLevel, newState, step, L, R, J, W, TILE } from './core.mjs';

const digits = (s) => [...s].map(Number);

export const MOVIES = {
  room0Right: new Array(24).fill(R),
  room0Short: new Array(10).fill(R),
  // Walks right into level 1's first spike pit.
  level1Death: new Array(40).fill(R),
  // A level 1 run made on version 1.0. On 1.1 it first disagrees on frame 97 and never reaches the flag.
  level1Run: digits('2222224444440444444044404444444044444404444440444044444440444444444444444444444462404040404040404444444444524'),
};

// A yard with a belt, a runway and a one-tile wall too high to jump. Used to test the minimiser.
export const CLIP_YARD = parseLevel(`name: The clip yard
---
##############################
#............................#
#............................#
#....................#.......#
#....................#..F....#
#S...................#.......#
##>>>>>>######################`);
export const CLIP_WALL_X = 21 * 8 * 16; // left edge of the wall, in sub-pixels

// Open space for the jump model: wide, tall, flat, nothing to hit within 40 frames.
export const OPEN_ROOM = parseLevel(`name: Open ground
---
${'#'.repeat(60)}
${('#' + '.'.repeat(58) + '#\n').repeat(8)}#${'.'.repeat(29)}S${'.'.repeat(28)}#
${'#'.repeat(60)}`);

export { L, R, J };

// True when, on some frame of the movie, Kettle goes from wholly left of a wall to wholly past it in one
// move: the wall clip. Walking or jumping over a wall never covers its width in one frame.
// wallX is the wall's left edge in sub-pixels; the wall is one tile wide.
export function clipsThrough(level, wallX, inputs) {
  const s = newState(level);
  let x = s.ram[2] | (s.ram[3] << 8);
  for (const input of inputs) {
    step(s, input);
    if (s.ram[0x13]) return false; // dead
    const nx = s.ram[2] | (s.ram[3] << 8);
    if (x + W - 1 < wallX && nx >= wallX + TILE) return true;
    x = nx;
  }
  return false;
}
