// Unit 12, write route: server/recorder.mjs with the walked-through regions left to fill.
// Lesson 12 shows each region's code and says why it is there. Replace everything between
// a "// region: NAME" line and its "// endregion: NAME" line with that listing, in the
// lesson's order: recorder, in-order, replay-run, replay-final. Keep the marker lines.
// The rest (the import, the key lists, the shape test wellShaped and its two helpers) is
// supplied. API.md, "The record" and "replay", has the format and the reasons.
import { createLobSession } from '../../public/session.mjs';

const RECORD_KEYS = ['end', 'final', 'game', 'inputs', 'mode', 'seed', 'v'];
const INPUT_KEYS = ['angle', 'fire', 'n', 'power', 'seq', 'tick'];
const FINAL_KEYS = ['angle', 'power', 'round', 'score', 'shots'];

// region: recorder
export function createRecorder({ seed, mode }) {
  throw new Error('createRecorder: not written yet');
}
// endregion: recorder

export function replay(record, admission) {
  if (!wellShaped(record)) return { ok: false, reason: 'shape' };
  // region: replay-run
  throw new Error('replay: not written yet');
  // endregion: replay-run
  // region: replay-final
  throw new Error('replay: the final comparison is not written yet');
  // endregion: replay-final
}

// region: in-order
function inOrder({ inputs, end }) {
  throw new Error('inOrder: not written yet');
}
// endregion: in-order

// The record's shape: every field present, nothing extra, each of its type.
function wellShaped(record) {
  if (!isPlainObject(record) || !hasExactly(record, RECORD_KEYS)) return false;
  if (record.v !== 1 || record.game !== 'lob' || record.mode !== 9)
    return false;
  if (
    !Number.isSafeInteger(record.seed) ||
    record.seed < 0 ||
    record.seed > 0xffffffff
  )
    return false;
  if (!Number.isSafeInteger(record.end) || record.end < 0) return false;
  if (!isPlainObject(record.final) || !hasExactly(record.final, FINAL_KEYS))
    return false;
  if (!FINAL_KEYS.every((key) => Number.isSafeInteger(record.final[key])))
    return false;
  if (!Array.isArray(record.inputs)) return false;
  return record.inputs.every(
    (input) =>
      isPlainObject(input) &&
      hasExactly(input, INPUT_KEYS) &&
      Number.isSafeInteger(input.n) &&
      Number.isSafeInteger(input.tick) &&
      input.tick >= 0 &&
      typeof input.seq === 'number' &&
      typeof input.angle === 'number' &&
      typeof input.power === 'number' &&
      typeof input.fire === 'boolean',
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactly(object, keys) {
  const own = Object.keys(object).sort();
  return own.length === keys.length && own.every((key, i) => key === keys[i]);
}
