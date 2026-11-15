// Reading the game's memory and screen. Module 1: text. Module 2: values.
// Every function throws "not written yet" until you write it. API.md has the details.

// A copy of bytes (a Uint8Array).
export function snapshot(bytes) {
  throw new Error('not written yet: snapshot in scan.mjs');
}

// Runs of minLen or more printable bytes (32 to 126, or 10) that end in a zero byte: [{ addr, text }].
export function findStrings(bytes, minLen = 4) {
  throw new Error('not written yet: findStrings in scan.mjs');
}

// The text from addr up to the first zero byte.
export function readCString(bytes, addr, max = 256) {
  throw new Error('not written yet: readCString in scan.mjs');
}

// True when text has at least 6 characters and three letters in a row.
export function wordy(text) {
  throw new Error('not written yet: wordy in scan.mjs');
}

// Strings at the same address in both snapshots whose text changed and that read like words.
export function changedStrings(before, after) {
  throw new Error('not written yet: changedStrings in scan.mjs');
}

// The lower-cased word in front of the first word that differs, or null.
export function changedLabel(beforeLine, afterLine) {
  throw new Error('not written yet: changedLabel in scan.mjs');
}

// The numbers on the status line: { angle, power, wind, wind_arrows }, each null
// when the line does not show it. wind_arrows counts > as +1 and < as -1; ~ is 0.
export function parseStatus(line) {
  throw new Error('not written yet: parseStatus in scan.mjs');
}

// { f32, i32 }: the same bytes as 32-bit floats and as signed 32-bit integers.
export function viewsOf(bytes) {
  throw new Error('not written yet: viewsOf in scan.mjs');
}

// Every slot number: 0, 1, ..., bytes.length / 4 - 1, as a Uint32Array.
export function allSlots(bytes) {
  throw new Error('not written yet: allSlots in scan.mjs');
}

// How many candidates, both types together.
export function count(cands) {
  throw new Error('not written yet: count in scan.mjs');
}

// [{ type, slot, addr }], floats first.
export function list(cands) {
  throw new Error('not written yet: list in scan.mjs');
}

// Candidates whose value went up by delta.
export function filterDelta(cands, before, after, delta) {
  throw new Error('not written yet: filterDelta in scan.mjs');
}

// Candidates whose 32 bits did not change.
export function filterUnchanged(cands, before, after) {
  throw new Error('not written yet: filterUnchanged in scan.mjs');
}

// Candidates whose 32 bits changed.
export function filterChanged(cands, before, after) {
  throw new Error('not written yet: filterChanged in scan.mjs');
}

// Float slots holding a value within tol of value.
export function scanNear(bytes, value, tol) {
  throw new Error('not written yet: scanNear in scan.mjs');
}

// Float candidates holding a value within tol of value.
export function filterNear(cands, bytes, value, tol) {
  throw new Error('not written yet: filterNear in scan.mjs');
}

// { slope, intercept, worst }: the least-squares line and its largest miss.
export function lineFit(xs, ys) {
  throw new Error('not written yet: lineFit in scan.mjs');
}

// { x, pixels } for the flag cloth, or null.
export function findRed(screen) {
  throw new Error('not written yet: findRed in scan.mjs');
}
