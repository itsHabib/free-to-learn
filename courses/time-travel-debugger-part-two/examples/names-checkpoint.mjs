// Unit 12: names and lines. API.md, "names.mjs", is the contract.
// functionNames reads the function names a .wasm file keeps in its "name"
// custom section; lineAt finds the C line of a file offset in a line table.
//
// A .wasm file is 8 fixed bytes ("\0asm" and a version), then sections: an id
// byte, the section's size in bytes, then its contents. Sizes, counts, indexes
// and lengths are LEB128 numbers; a name is its length followed by its bytes.

// Reads a .wasm file from a position, one value at a time.
class Reader {
  constructor(bytes, pos = 0) {
    this.bytes = bytes;
    this.pos = pos;
  }

  byte() {
    if (this.pos >= this.bytes.length)
      throw Error(`functionNames: the file ends early (at byte ${this.pos})`);
    return this.bytes[this.pos++];
  }

  // region: leb128
  // Unsigned LEB128: 7 bits per byte, lowest first. A byte with its top bit
  // set says another byte follows.
  u32() {
    let value = 0;
    let shift = 0;
    let b;
    do {
      b = this.byte();
      value += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return value;
  }

  // A length, then that many bytes of UTF-8 text.
  name() {
    const length = this.u32();
    const end = this.pos + length;
    if (end > this.bytes.length)
      throw Error('functionNames: a name runs past the end of the file');
    const text = new globalThis.TextDecoder().decode(
      this.bytes.subarray(this.pos, end),
    );
    this.pos = end;
    return text;
  }
  // endregion: leb128
}

// region: sections
// { [index]: name } for every function the "name" section names; {} without one.
export function functionNames(bytes) {
  const magic = [0x00, 0x61, 0x73, 0x6d];
  if (!magic.every((b, i) => bytes[i] === b))
    throw Error('functionNames: not a WebAssembly file');
  const r = new Reader(bytes, 8);
  while (r.pos < bytes.length) {
    const id = r.byte();
    const size = r.u32();
    const end = r.pos + size;
    if (id === 0 && r.name() === 'name') return functionSubsection(r, end);
    r.pos = end;
  }
  return {};
}
// endregion: sections

// region: subsections
// Inside the name section: subsections, each an id byte, a size and contents.
// Subsection 1 is a count, then each function's index and name; skip the rest.
function functionSubsection(r, end) {
  const names = {};
  while (r.pos < end) {
    const id = r.byte();
    const size = r.u32();
    const next = r.pos + size;
    if (id === 1) {
      for (let n = r.u32(); n > 0; n--) {
        const index = r.u32();
        names[index] = r.name();
      }
    }
    r.pos = next;
  }
  return names;
}
// endregion: subsections

// region: line-at
// { line, column } of the last row at or before `offset`, or null when every
// row comes after it. Rows are sorted by offset.
export function lineAt(lines, offset) {
  let lo = 0;
  let hi = lines.length;
  // Rows before lo are at or before offset; rows from hi on come after it.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].offset <= offset) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return null;
  return { line: lines[lo - 1].line, column: lines[lo - 1].column };
}
// endregion: line-at
