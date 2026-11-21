// Unit 12 end checkpoint: server/recorder.mjs with every walked-through region filled.
// examples/start-chapter.mjs copies it into a project as server/recorder.mjs; there the
// import below reads ../../public/session.mjs, one folder deeper.
import { createLobSession } from '../public/session.mjs';

const RECORD_KEYS = ['end', 'final', 'game', 'inputs', 'mode', 'seed', 'v'];
const INPUT_KEYS = ['angle', 'fire', 'n', 'power', 'seq', 'tick'];
const FINAL_KEYS = ['angle', 'power', 'round', 'score', 'shots'];

// region: recorder
export function createRecorder({ seed, mode }) {
  const inputs = [];
  return {
    admitted(tick, input) {
      inputs.push({
        n: inputs.length + 1,
        tick,
        seq: input.seq,
        angle: input.angle,
        power: input.power,
        fire: input.fire,
      });
    },
    finish(end, final) {
      return {
        v: 1,
        game: 'lob',
        mode,
        seed,
        inputs: inputs.map((input) => ({ ...input })),
        end,
        final: {
          round: final.round,
          score: final.score,
          shots: final.shots,
          angle: final.angle,
          power: final.power,
        },
      };
    },
  };
}
// endregion: recorder

export function replay(record, admission) {
  if (!wellShaped(record)) return { ok: false, reason: 'shape' };
  // region: replay-run
  if (!inOrder(record)) return { ok: false, reason: 'order' };
  const session = createLobSession({ seed: record.seed, mode: record.mode });
  let state = { lastSeq: 0, firedRound: 0 };
  let next = 0;
  for (let tick = 0; tick < record.end; tick++) {
    while (next < record.inputs.length && record.inputs[next].tick === tick) {
      const { seq, angle, power, fire } = record.inputs[next++];
      const parsed = admission.parseInput(
        JSON.stringify({ v: 1, seq, angle, power, fire }),
      );
      if (!parsed.ok) return { ok: false, reason: 'refused' };
      const { round, flying } = session.facts();
      const decision = admission.admit(state, parsed.input, {
        tick,
        round,
        flying,
      });
      if (decision.status !== 'admitted')
        return { ok: false, reason: 'refused' };
      session.apply(parsed.input);
      state = decision.next;
    }
    session.step();
  }
  // endregion: replay-run
  // region: replay-final
  const final = session.final();
  if (FINAL_KEYS.some((key) => final[key] !== record.final[key]))
    return { ok: false, reason: 'final' };
  return { ok: true, final };
  // endregion: replay-final
}

// region: in-order
function inOrder({ inputs, end }) {
  return inputs.every((input, i) => {
    const before = inputs[i - 1];
    return (
      input.n === i + 1 &&
      input.tick < end &&
      (!before || (input.tick >= before.tick && input.seq > before.seq))
    );
  });
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
