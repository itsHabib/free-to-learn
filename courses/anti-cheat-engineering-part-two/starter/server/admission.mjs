// Unit 12: which messages may change the game. API.md, "Unit 12", has the full contract.

// parseInput(text): read one client message. Returns { ok: true, input }, where input is
// a new object holding exactly v, seq, angle, power and fire, or { ok: false, reason }.
// The checks run in API.md's order and the first that fails names the reason: text,
// too-long (over INPUT_MAX_BYTES bytes in UTF-8), json, object, keys, version, seq, angle,
// power, fire. The limits are in public/rules.mjs.
export function parseInput(text) {
  throw new Error('parseInput: not written yet');
}

// admit(state, input, facts): decide on a parsed input. state is { lastSeq, firedRound }
// (it starts { lastSeq: 0, firedRound: 0 }); facts is { tick, round, flying } from the
// server's game. Returns { status: 'admitted', next } or { status: 'refused', reason, next },
// with the reasons stale, flying and fired checked in API.md's order. A refusal's next
// equals state. Never change the state object you are given.
export function admit(state, input, facts) {
  throw new Error('admit: not written yet');
}
