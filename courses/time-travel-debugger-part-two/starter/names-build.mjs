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
  u32() {
    throw Error('leb128: not written yet (lesson 12)');
  }

  name() {
    throw Error('leb128: not written yet (lesson 12)');
  }
  // endregion: leb128
}

// region: sections
export function functionNames() {
  throw Error('sections: not written yet (lesson 12)');
}
// endregion: sections

// region: subsections
function functionSubsection() {
  throw Error('subsections: not written yet (lesson 12)');
}
// endregion: subsections

// region: line-at
export function lineAt() {
  throw Error('line-at: not written yet (lesson 12)');
}
// endregion: line-at
