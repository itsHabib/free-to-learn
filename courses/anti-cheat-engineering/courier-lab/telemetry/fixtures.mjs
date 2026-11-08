import { createRecordedEngine, createReplayEngine, capture } from './runtime.mjs';

const input = (seq, move = 'idle', interact = false) => ({ v: 1, seq, move, interact });
const copy = (value) => JSON.parse(JSON.stringify(value));

function sample(capacity = 128) {
  const engine = createRecordedEngine(17, { capacity });
  const first = engine.join();
  engine.join();
  engine.admit(first.id, input(2, 'E', true));
  engine.admit(first.id, input(1, 'W', true));
  engine.advance(1);
  engine.admit(first.id, input(3, 'idle', true));
  engine.advance(1);
  engine.admit(first.id, input(4, 'idle', true));
  engine.advance(1);
  engine.admit(first.id, input(5, 'N', true));
  engine.advance(1);
  return engine.window();
}

function change(source, edit) {
  const record = copy(source);
  edit(record);
  return record;
}

function evidence(value) {
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (item === undefined) return { type: 'undefined' };
      if (typeof item === 'number' && !Number.isFinite(item)) return { type: 'number', value: String(item) };
      if (['bigint', 'function', 'symbol'].includes(typeof item)) return { type: typeof item, value: String(item) };
      return item;
    }));
  } catch {
    return { type: 'non-JSON result' };
  }
}

/** Author-owned cases, built from real engine operations rather than answer text. */
export function cases() {
  const complete = sample();
  const rolled = sample(3);
  const quiet = createRecordedEngine(-3);
  const maximal = createRecordedEngine(31, { capacity: 256 });
  maximal.join();
  maximal.advance(100);
  maximal.advance(100);
  maximal.advance(55);
  const checkpointOnly = createRecordedEngine(17);
  const actor = checkpointOnly.join();
  checkpointOnly.admit(actor.id, input(1, 'E', true));
  const pending = {
    schema: 1, runtimeRelease: complete.runtimeRelease, startIndex: 90,
    checkpoint: capture(checkpointOnly.world), events: [], endIndex: 90,
    complete: true, final: checkpointOnly.window().final,
  };
  const positive = (name, record) => ({ name, record, expected: { ok: true, state: record.final }, section: 'complete-windows' });
  const negative = (name, record, reason, section) => ({ name, record, expected: { ok: false, reason }, section });
  return [
    positive('complete: replay joins, stale input and interactions', complete),
    positive('rolled: restore retained causal state at a nonzero index', rolled),
    positive('empty: an untouched world has a complete zero-event window', quiet.window()),
    positive('checkpoint: zero events preserve pending intent', pending),
    positive('bound: exactly 256 events remain valid', maximal.window()),
    negative('schema: unknown schema refuses before replay', change(complete, (r) => { r.schema = 2; }), 'schema', 'schema-and-release'),
    negative('schema: an unexpected envelope field is refused', { ...complete, token: 'not-allowed' }, 'schema', 'schema-and-release'),
    negative('release: incompatible engine release is refused', change(complete, (r) => { r.runtimeRelease = 'courier-runtime-unknown'; }), 'incompatible', 'schema-and-release'),
    negative('complete: false cannot be repaired by guessing missing history', change(complete, (r) => { r.complete = false; }), 'incomplete', 'complete-windows'),
    negative('bound: 257 events exceed the finite window limit', change(maximal.window(), (r) => { r.events.push({ index: 257, event: { type: 'tick' } }); r.endIndex = 257; }), 'incomplete', 'complete-windows'),
    negative('sequence: removing a middle input leaves a gap', change(complete, (r) => { r.events.splice(3, 1); }), 'sequence', 'absolute-order'),
    negative('sequence: reordering evidence must not sort it silently', change(complete, (r) => { [r.events[2], r.events[3]] = [r.events[3], r.events[2]]; }), 'sequence', 'absolute-order'),
    negative('sequence: duplicated indices are not a contiguous history', change(complete, (r) => { r.events[3].index = r.events[2].index; }), 'sequence', 'absolute-order'),
    negative('sequence: a fractional boundary cannot identify operations', change(complete, (r) => { r.startIndex = 0.5; }), 'sequence', 'absolute-order'),
    negative('sequence: an unsafe boundary cannot identify operations', change(complete, (r) => { r.endIndex = Number.MAX_SAFE_INTEGER + 1; }), 'sequence', 'absolute-order'),
    negative('event: an unknown event type is refused', change(complete, (r) => { r.events[2].event.type = 'teleport'; }), 'event', 'causal-state'),
    negative('event: invalid input cannot write state', change(complete, (r) => { r.events[2].event.input.seq = 0; }), 'event', 'causal-state'),
    negative('event: an unknown actor cannot provide an input', change(complete, (r) => { r.events[2].event.id = 'actor-9'; }), 'event', 'causal-state'),
    negative('checkpoint: missing private intent is refused', change(rolled, (r) => { delete r.checkpoint.actors[0].pendingInteract; }), 'event', 'causal-state'),
    negative('checkpoint: missing detector history is refused', change(rolled, (r) => { delete r.checkpoint.actors[0].detector; }), 'event', 'causal-state'),
    negative('checkpoint: nonfinite positions are refused', change(rolled, (r) => { r.checkpoint.actors[0].x = Infinity; }), 'event', 'causal-state'),
    negative('final: truncated actor state is refused', change(complete, (r) => { r.final.actors.pop(); }), 'final', 'final-comparison'),
    negative('final: altered score is refused', change(complete, (r) => { r.final.actors[0].actor.score += 1; }), 'final', 'final-comparison'),
    negative('final: absent final state is refused', change(complete, (r) => { delete r.final; }), 'final', 'final-comparison'),
  ];
}

/** Each failure reports behavior, expected result, observed result and a repair pointer. */
export async function assess(candidate, { onCriterion = () => {} } = {}) {
  if (typeof candidate?.replayWindow !== 'function') {
    return { passed: false, criteria: [{ name: 'export replayWindow(record, engine)', passed: false, error: {
      message: 'Export the replayWindow function declared in the contract.',
      expected: 'function', actual: typeof candidate?.replayWindow, source: 'LEARNER.md#the-contract',
    } }] };
  }
  const facade = createReplayEngine();
  const criteria = [];
  for (const item of cases()) {
    onCriterion(item.name);
    const expected = copy(item.expected);
    let observed;
    try {
      observed = await candidate.replayWindow(item.record, facade);
    } catch (error) {
      criteria.push({ name: item.name, passed: false, error: {
        message: 'The candidate threw instead of returning a replay result.',
        expected, actual: { threw: String(error?.message ?? error) }, source: `LEARNER.md#${item.section}`,
      } });
      continue;
    }
    const passed = facade.equal(observed, expected);
    const result = { name: item.name, passed };
    if (!passed) result.error = {
      message: `The result violates this requirement: ${item.name}.`,
      expected, actual: evidence(observed), source: `LEARNER.md#${item.section}`,
    };
    criteria.push(result);
  }
  return { passed: criteria.every((criterion) => criterion.passed), criteria };
}
