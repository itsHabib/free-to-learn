// Module 2: find where the game keeps angle, power, wind and the flag.
// Every function throws "not written yet" until you write it. API.md has the details.

// The experiments worth trying next: [{ kind, target, label }].
export function experimentMenu(state) {
  throw new Error('not written yet: experimentMenu in find.mjs');
}

// Write, wait two frames, read back and restore each candidate: [{ type, addr, held }].
export function writeTest(host, cands) {
  throw new Error('not written yet: writeTest in find.mjs');
}

// Resolves to { angle, power, wind, flag, statusLine, message, rounds, experiments }.
export async function findValues(host, controls, { decide = () => 0 } = {}) {
  throw new Error('not written yet: findValues in find.mjs');
}
