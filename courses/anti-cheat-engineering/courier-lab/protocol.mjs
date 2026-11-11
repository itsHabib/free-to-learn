const INPUT_KEYS = ['interact', 'move', 'seq', 'v'];
const MOVES = new Set(['N', 'S', 'E', 'W', 'idle']);

function inputProblem(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input-object-required';
  const keys = Object.keys(input).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) return 'input-keys';
  if (input.v !== 1) return 'input-version';
  if (!Number.isSafeInteger(input.seq) || input.seq < 1 || input.seq > 1_000_000) return 'input-sequence';
  if (!MOVES.has(input.move)) return 'input-move';
  if (typeof input.interact !== 'boolean') return 'input-interact';
  return null;
}

/** Parse only the declared command vocabulary; HTTP byte limits belong to the runtime. */
export function parseInput(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'input-text-required' };
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  const reason = inputProblem(input);
  if (reason) return { ok: false, reason };
  return { ok: true, input };
}
