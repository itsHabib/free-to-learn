// Reading the game's memory and screen. Module 1: text. Module 2: values.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 01 fills the seven regions below. A listing replaces everything
// between one pair of region markers; keep the markers.

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
// region: views-of
export function viewsOf(bytes) {
  // Two views of one buffer: element s of each is slot s. No copy.
  const { buffer, byteOffset } = bytes;
  const n = Math.floor(bytes.byteLength / 4);
  return {
    f32: new Float32Array(buffer, byteOffset, n),
    i32: new Int32Array(buffer, byteOffset, n),
  };
}
// endregion: views-of

// Every slot number: 0, 1, ..., bytes.length / 4 - 1, as a Uint32Array.
// region: all-slots
export function allSlots(bytes) {
  const n = Math.floor(bytes.byteLength / 4);
  const slots = new Uint32Array(n);
  for (let s = 0; s < n; s++) slots[s] = s;
  return slots;
}
// endregion: all-slots

// How many candidates, both types together.
// region: count
export function count(cands) {
  // A half that is null was not searched, so it adds nothing.
  return (cands?.f32?.length ?? 0) + (cands?.i32?.length ?? 0);
}
// endregion: count

// [{ type, slot, addr }], floats first.
// region: list
export function list(cands) {
  const out = [];
  for (const type of ['f32', 'i32']) {
    for (const slot of cands?.[type] ?? []) {
      out.push({ type, slot, addr: slot * 4 });
    }
  }
  return out;
}
// endregion: list

// Candidates whose value went up by delta.
// region: filter-delta
// The slots of one half that pass test, as a new Uint32Array.
// A half that is null was not searched, and stays null.
function keep(slots, test) {
  if (!slots) return null;
  const out = new Uint32Array(slots.length);
  let n = 0;
  for (const slot of slots) if (test(slot)) out[n++] = slot;
  return out.slice(0, n);
}

export function filterDelta(cands, before, after, delta) {
  const b = viewsOf(before);
  const a = viewsOf(after);
  // Float arithmetic is rounded, so a float rise counts within 0.001.
  const roseF = (s) => Math.abs(a.f32[s] - b.f32[s] - delta) < 1e-3;
  const roseI = (s) => a.i32[s] - b.i32[s] === delta;
  return { f32: keep(cands.f32, roseF), i32: keep(cands.i32, roseI) };
}
// endregion: filter-delta

// Candidates whose 32 bits did not change.
// region: filter-unchanged
export function filterUnchanged(cands, before, after) {
  // Compare bits, never floats: as a float, NaN !== NaN.
  const b = viewsOf(before).i32;
  const a = viewsOf(after).i32;
  const same = (s) => a[s] === b[s];
  return { f32: keep(cands.f32, same), i32: keep(cands.i32, same) };
}
// endregion: filter-unchanged

// Candidates whose 32 bits changed.
// region: filter-changed
export function filterChanged(cands, before, after) {
  const b = viewsOf(before).i32;
  const a = viewsOf(after).i32;
  const moved = (s) => a[s] !== b[s];
  return { f32: keep(cands.f32, moved), i32: keep(cands.i32, moved) };
}
// endregion: filter-changed

// Float slots holding a value within tol of value.
// region: scan-near
export function scanNear(bytes, value, tol) {
  const f = viewsOf(bytes).f32;
  return keep(allSlots(bytes), (s) => Math.abs(f[s] - value) <= tol);
}
// endregion: scan-near

// Float candidates holding a value within tol of value.
// region: filter-near
export function filterNear(cands, bytes, value, tol) {
  const f = viewsOf(bytes).f32;
  const near = (s) => Math.abs(f[s] - value) <= tol;
  // The wind is a float, so the integer half is dropped.
  return { f32: keep(cands.f32, near), i32: null };
}
// endregion: filter-near

// { slope, intercept, worst }: the least-squares line and its largest miss.
// region: line-fit
export function lineFit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((sum, x) => sum + x, 0) / n;
  const my = ys.reduce((sum, y) => sum + y, 0) / n;
  let sxy = 0; // the sum of (x - mx) * (y - my)
  let sxx = 0; // the sum of (x - mx)^2
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0; // every x the same: no slope
  const intercept = my - slope * mx;
  let worst = 0; // the largest residual, its sign dropped
  for (let i = 0; i < n; i++) {
    const residual = ys[i] - (slope * xs[i] + intercept);
    worst = Math.max(worst, Math.abs(residual));
  }
  return { slope, intercept, worst };
}
// endregion: line-fit

// { x, pixels } for the flag cloth, or null.
// region: find-red
// Red above 190, green and blue below 120: only the flag's cloth.
const cloth = (data, i) =>
  data[i] > 190 && data[i + 1] < 120 && data[i + 2] < 120;

export function findRed(screen) {
  const { width, height, data } = screen;
  let left = Infinity;
  let right = -Infinity;
  let pixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!cloth(data, (y * width + x) * 4)) continue;
      pixels++;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return pixels ? { x: (left + right) / 2, pixels } : null;
}
// endregion: find-red
