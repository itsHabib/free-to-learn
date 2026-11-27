// Reading the game's memory and screen. Module 1: text. Module 2: values.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 01 fills the seven regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
/* eslint-disable no-unused-vars -- later modules use the stubs' parameters */

// A copy of bytes (a Uint8Array).
// region: snapshot
export function snapshot(bytes) {
  // slice() makes a new array; memory() hands back the live one.
  return bytes.slice();
}
// endregion: snapshot

// Runs of minLen or more printable bytes (32 to 126, or 10) that end in a zero byte: [{ addr, text }].
// region: find-strings
const printable = (c) => (c >= 32 && c <= 126) || c === 10;

export function findStrings(bytes, minLen = 4) {
  const found = [];
  let start = -1; // where the current printable run began, or -1
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (printable(c)) {
      if (start < 0) start = i;
      continue;
    }
    // Any other byte ends the run. Only a zero byte makes it a string.
    if (start >= 0 && c === 0 && i - start >= minLen) {
      found.push({ addr: start, text: decode(bytes, start, i) });
    }
    start = -1;
  }
  return found; // a run still open at the end of memory is dropped
}

// The bytes from `from` up to, not including, `to`, as text.
function decode(bytes, from, to) {
  let text = '';
  for (let i = from; i < to; i++) text += String.fromCharCode(bytes[i]);
  return text;
}
// endregion: find-strings

// The text from addr up to the first zero byte.
// region: read-c-string
export function readCString(bytes, addr, max = 256) {
  let end = addr;
  while (end < bytes.length && end - addr < max && bytes[end] !== 0) {
    end++;
  }
  return decode(bytes, addr, end);
}
// endregion: read-c-string

// True when text has at least 6 characters and three letters in a row.
// region: wordy
export function wordy(text) {
  return text.length >= 6 && /[A-Za-z]{3,}/.test(text);
}
// endregion: wordy

// Strings at the same address in both snapshots whose text changed and that read like words.
// region: changed-strings
export function changedStrings(before, after) {
  // Pair strings by address, never by their place in the list.
  const was = new Map(findStrings(before).map((s) => [s.addr, s.text]));
  return findStrings(after).filter((s) => {
    const old = was.get(s.addr);
    return old !== undefined && old !== s.text && wordy(s.text);
  });
}
// endregion: changed-strings

// The lower-cased word in front of the first word that differs, or null.
// region: changed-label
export function changedLabel(beforeLine, afterLine) {
  const a = beforeLine.trim().split(/\s+/);
  const b = afterLine.trim().split(/\s+/);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    // The first word that differs: look back for a word of letters.
    for (let j = i - 1; j >= 0; j--) {
      if (/^[A-Za-z]+$/.test(b[j])) return b[j].toLowerCase();
    }
    return null;
  }
  return null;
}
// endregion: changed-label

// The numbers on the status line: { angle, power, wind, wind_arrows }, each null
// when the line does not show it. wind_arrows counts > as +1 and < as -1; ~ is 0.
// region: parse-status
export function parseStatus(line) {
  const number = (pattern) => {
    const m = line.match(pattern);
    return m ? Number(m[1]) : null;
  };
  const arrows = line.match(/WIND\s+([<>~]+)/);
  const tally = (c) => [...(arrows?.[1] ?? '')].filter((x) => x === c);
  return {
    angle: number(/ANGLE\s+(-?\d+)/),
    power: number(/POWER\s+(-?\d+)/),
    wind: number(/WIND\s+([-+]\d+(?:\.\d+)?)/),
    wind_arrows: arrows ? tally('>').length - tally('<').length : null,
  };
}
// endregion: parse-status

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
