// Module 2: find where the game keeps angle, power, wind and the flag.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 02 fills the regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
import * as S from './scan.mjs';

// region: given-search
// The most experiments one search may run.
const BUDGET = 30;

// The number at addr, read as 'f32' or 'i32', from the live memory.
export function read(host, addr, type) {
  const m = host.memory();
  const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
  if (type === 'f32') return view.getFloat32(addr, true);
  return view.getInt32(addr, true);
}

// Everything the search knows. Angle and power start as every slot
// in both views; the wind and the flag stay null until a new round.
function newSearch(bytes) {
  const all = S.allSlots(bytes);
  return {
    all,
    angle: { f32: all, i32: all },
    power: { f32: all, i32: all },
    wind: null,
    flag: null,
    found: {},
    statusLine: null,
    message: null,
    pixels: [], // the cloth's middle after each round of the line test
    history: new Map(), // a flag candidate's value after each of them
    rounds: 0,
    experiments: 0,
  };
}

// The menu's state: each value as a count, 'found' or null.
function stateOf(s) {
  const left = (name) =>
    s.found[name] ? 'found' : s[name] ? S.count(s[name]) : null;
  const lineFound = s.statusLine !== null;
  return {
    angle: left('angle'),
    power: left('power'),
    wind: left('wind'),
    flag: left('flag'),
    lineFound,
  };
}

// The state as the one line a picker reads.
function describe(state) {
  const shown = (v) => (v === null ? 'not scanned' : v);
  const names = ['angle', 'power', 'wind', 'flag'];
  return names.map((k) => `${k}: ${shown(state[k])}`).join(', ');
}
// endregion: given-search

// The experiments worth trying next: [{ kind, target, label }].
// region: experiment-menu
export function experimentMenu(state) {
  throw new Error('not written yet: experimentMenu in find.mjs');
}
// endregion: experiment-menu

// Write, wait two frames, read back and restore each candidate: [{ type, addr, held }].
// region: write-test
export function writeTest(host, cands) {
  throw new Error('not written yet: writeTest in find.mjs');
}
// endregion: write-test

// region: try-write
function tryWrite(host, s, name) {
  throw new Error('not written yet: tryWrite in find.mjs');
}
// endregion: try-write

// region: after-press
function afterPress(s, target, before, after) {
  throw new Error('not written yet: afterPress in find.mjs');
}
// endregion: after-press

// region: after-round
function afterRound(host, s, before, after) {
  throw new Error('not written yet: afterRound in find.mjs');
}
// endregion: after-round

// region: line-test
function lineTest(s, before, after, x) {
  throw new Error('not written yet: lineTest in find.mjs');
}
// endregion: line-test

// region: settle
function settle(s) {
  throw new Error('not written yet: settle in find.mjs');
}
// endregion: settle

// Resolves to { angle, power, wind, flag, statusLine, message, rounds, experiments }.
// region: find-values
export async function findValues(host, controls, { decide = () => 0 } = {}) {
  throw new Error('not written yet: findValues in find.mjs');
}
// endregion: find-values
