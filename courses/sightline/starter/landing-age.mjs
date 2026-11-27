// Module 02, your new case: find the game's count of frames since the
// shell last landed. The lesson's walkthrough does not write this function;
// you do. Check it with: node examples/check-landing-age.mjs ./work
import * as S from './scan.mjs';

// Return { addr, type }: the slot where the game counts the frames since
// the last landing, and how it is stored, 'f32' or 'i32'. kit.controls,
// kit.statusLine and kit.message are set. Fire at most one shot, write
// nothing, and find the slot by measuring: its address changes with the
// seed. A shell may already have landed before your function is called.
export function findLandingAge(host, kit) {
  throw new Error('not written yet: findLandingAge in landing-age.mjs');
}
