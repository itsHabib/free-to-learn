// Unit 12, write route: server/admission.mjs with the walked-through regions left to fill.
// Lesson 12 shows each region's code and says why it is there. Replace everything between
// a "// region: NAME" line and its "// endregion: NAME" line with that listing, in the
// lesson's order: parse-shape, parse-values, in-range, admit. Keep the marker lines.
// The rest (the imports, INPUT_KEYS and refuse) is supplied. API.md, "Unit 12", has the
// full contract.
import { Buffer } from 'node:buffer';
import { INPUT_MAX_BYTES, ANGLE, POWER, SEQ } from '../../public/rules.mjs';

const INPUT_KEYS = ['angle', 'fire', 'power', 'seq', 'v'];

export function parseInput(text) {
  // region: parse-shape
  throw new Error('parseInput: not written yet');
  // endregion: parse-shape
  // region: parse-values
  throw new Error('parseInput: the field checks are not written yet');
  // endregion: parse-values
}

// region: admit
export function admit(state, input, facts) {
  throw new Error('admit: not written yet');
}
// endregion: admit

// region: in-range
function inRange(value, { min, max }) {
  throw new Error('inRange: not written yet');
}
// endregion: in-range

function refuse(reason) {
  return { ok: false, reason };
}
