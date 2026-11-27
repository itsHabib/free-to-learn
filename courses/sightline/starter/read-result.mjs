// Module 01, your new case: read the result of one shot from the message.
// The lesson's walkthrough does not write this function; you do.
// Check it with: node examples/check-result.mjs ./work
import * as S from './scan.mjs';

// Press the kit's fire key once, then tick one frame at a time, reading the
// message at kit.message. Return { text, frames }: the message the game shows
// once the shell has landed, and how many frames you ticked to see it.
// Throw an error if nothing has landed after 600 frames. Press no other key.
export function readResult(host, kit) {
  throw new Error('not written yet: readResult in read-result.mjs');
}
