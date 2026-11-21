// Unit 12 end checkpoint: server/admission.mjs with every walked-through region filled.
// examples/start-chapter.mjs copies it into a project as server/admission.mjs; there the
// import below reads ../../public/rules.mjs, one folder deeper.
import { Buffer } from 'node:buffer';
import { INPUT_MAX_BYTES, ANGLE, POWER, SEQ } from '../public/rules.mjs';

const INPUT_KEYS = ['angle', 'fire', 'power', 'seq', 'v'];

export function parseInput(text) {
  // region: parse-shape
  if (typeof text !== 'string') return refuse('text');
  if (Buffer.byteLength(text, 'utf8') > INPUT_MAX_BYTES)
    return refuse('too-long');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return refuse('json');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return refuse('object');
  const keys = Object.keys(value).sort();
  if (
    keys.length !== INPUT_KEYS.length ||
    keys.some((key, i) => key !== INPUT_KEYS[i])
  )
    return refuse('keys');
  // endregion: parse-shape
  // region: parse-values
  if (value.v !== 1) return refuse('version');
  if (!inRange(value.seq, SEQ)) return refuse('seq');
  if (!inRange(value.angle, ANGLE)) return refuse('angle');
  if (!inRange(value.power, POWER)) return refuse('power');
  if (typeof value.fire !== 'boolean') return refuse('fire');
  return {
    ok: true,
    input: {
      v: 1,
      seq: value.seq,
      angle: value.angle,
      power: value.power,
      fire: value.fire,
    },
  };
  // endregion: parse-values
}

// region: admit
export function admit(state, input, facts) {
  if (input.seq <= state.lastSeq)
    return { status: 'refused', reason: 'stale', next: state };
  if (facts.flying) return { status: 'refused', reason: 'flying', next: state };
  if (input.fire && state.firedRound === facts.round)
    return { status: 'refused', reason: 'fired', next: state };
  return {
    status: 'admitted',
    next: {
      lastSeq: input.seq,
      firedRound: input.fire ? facts.round : state.firedRound,
    },
  };
}
// endregion: admit

// region: in-range
function inRange(value, { min, max }) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
// endregion: in-range

function refuse(reason) {
  return { ok: false, reason };
}
