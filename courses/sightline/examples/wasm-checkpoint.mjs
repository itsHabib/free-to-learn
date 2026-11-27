// Module 4: decode the game's WebAssembly.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 04 fills the regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
import { TextDecoder } from 'node:util';
import { PLAIN, LOADS, STORES, SATURATING } from './opcodes.mjs';

// region: given-types
// The byte that names each value type, as a type section writes it.
const VALTYPE = {
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x7b: 'v128',
  0x70: 'funcref',
  0x6f: 'externref',
};
// endregion: given-types

// region: read-u32
// A number that runs past the last byte is a broken file.
const ranOff = (pos) => new Error(`ran off the end at byte ${pos}`);

// { value, next }: an unsigned LEB128 number.
export function readU32(bytes, pos) {
  let value = 0;
  let shift = 0;
  let byte;
  do {
    if (pos >= bytes.length) throw ranOff(pos);
    byte = bytes[pos++];
    value |= (byte & 0x7f) << shift; // 7 bits, lowest first
    shift += 7;
  } while (byte & 0x80); // the top bit: another byte follows
  return { value: value >>> 0, next: pos };
}
// endregion: read-u32

// region: read-s32
// { value, next }: a signed LEB128 number.
export function readS32(bytes, pos) {
  let value = 0;
  let shift = 0;
  let byte;
  do {
    if (pos >= bytes.length) throw ranOff(pos);
    byte = bytes[pos++];
    value |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  // Bit 6 of the last byte set: negative. Fill the bits above with 1s,
  // which subtracts 2 to the power shift.
  if (shift < 32 && byte & 0x40) value |= ~0 << shift;
  return { value: value | 0, next: pos };
}
// endregion: read-s32

// region: read-s64
// { value, next }: a signed LEB128 number of up to 64 bits, a BigInt.
function readS64(bytes, pos) {
  let value = 0n;
  let shift = 0n;
  let byte;
  do {
    if (pos >= bytes.length) throw ranOff(pos);
    byte = bytes[pos++];
    value |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
  } while (byte & 0x80);
  if (byte & 0x40) value -= 1n << shift;
  return { value, next: pos };
}
// endregion: read-s64

// region: cursor
// A place in the file that moves on past each thing it reads, and
// never past end.
function cursor(bytes, pos = 0, end = bytes.length) {
  const c = { bytes, pos, end };
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const take = (read) => {
    const { value, next } = read(bytes.subarray(0, c.end), c.pos);
    c.pos = next;
    return value;
  };
  c.byte = () => {
    if (c.pos >= c.end) throw ranOff(c.pos);
    return bytes[c.pos++];
  };
  c.u32 = () => take(readU32);
  c.s32 = () => take(readS32);
  c.s64 = () => take(readS64);
  c.f32 = () => {
    c.pos += 4;
    return view.getFloat32(c.pos - 4, true);
  };
  c.f64 = () => {
    c.pos += 8;
    return view.getFloat64(c.pos - 8, true);
  };
  // A name: its length in bytes, then the text.
  c.name = () => {
    const n = c.u32();
    const text = bytes.subarray(c.pos, c.pos + n);
    c.pos += n;
    return new TextDecoder().decode(text);
  };
  // A count, then that many entries, each read by entry().
  c.vec = (entry) => {
    const n = c.u32();
    const out = [];
    for (let i = 0; i < n; i++) out.push(entry());
    return out;
  };
  return c;
}
// endregion: cursor

// ---------- the sections ----------

// region: const-expr
// A short piece of code that gives a starting value, ending in 0B.
function constExpr(c) {
  let value = null;
  for (;;) {
    const op = c.byte();
    if (op === 0x0b) return value;
    if (op === 0x41) value = c.s32();
    else if (op === 0x42) value = c.s64();
    else if (op === 0x43) value = c.f32();
    else if (op === 0x44) value = c.f64();
    else if (op === 0x23) value = { global: c.u32() };
    else {
      const hex = op.toString(16);
      const why = `unexpected opcode 0x${hex} in a constant expression`;
      throw new Error(why);
    }
  }
}

// Limits: a flags byte, the smallest size, and the largest when bit 0
// of the flags is set.
function limits(c) {
  const flags = c.u32();
  const min = c.u32();
  const max = flags & 1 ? c.u32() : null;
  return { min, max };
}
// endregion: const-expr

// region: types-imports
// id 1: each entry is 60, the parameter types and the result types.
function readTypes(c) {
  return c.vec(() => {
    c.byte(); // 60, a function type
    const params = c.vec(() => VALTYPE[c.byte()]);
    const results = c.vec(() => VALTYPE[c.byte()]);
    return { params, results };
  });
}

// id 2: the module's name, the field's, a kind byte and what it needs.
function readImports(c, mod) {
  return c.vec(() => {
    const imp = { module: c.name(), name: c.name(), kind: c.byte() };
    if (imp.kind === 0) {
      imp.type = c.u32(); // a function, and the index of its type
      mod.importedFuncs++;
    } else if (imp.kind === 1) {
      c.byte(); // a table: its type, then limits
      limits(c);
    } else if (imp.kind === 2)
      limits(c); // a memory
    else if (imp.kind === 3) {
      c.byte(); // a global: its type, and whether it can change
      c.byte();
    }
    return imp;
  });
}
// endregion: types-imports

// region: globals-exports
// id 6: a type byte, 01 when it can change, and its starting value.
function readGlobals(c) {
  return c.vec(() => {
    const type = VALTYPE[c.byte()];
    const mutable = c.byte() === 1;
    return { type, mutable, init: constExpr(c) };
  });
}

// id 7: a name, a kind byte and an index.
function readExports(c) {
  return c.vec(() => {
    const name = c.name();
    return { name, kind: c.byte(), index: c.u32() };
  });
}
// endregion: globals-exports

// region: code-data
// id 10: each body's size, then its locals; where its instructions
// start and where it ends are kept, and the body itself is skipped.
function readCode(c) {
  return c.vec(() => {
    const size = c.u32();
    const start = c.pos;
    const local = () => ({ count: c.u32(), type: VALTYPE[c.byte()] });
    const locals = c.vec(local);
    const body = { start, codeStart: c.pos, end: start + size, locals };
    c.pos = start + size;
    return body;
  });
}

// id 11: flags, the address (unless flags is 1), a count of bytes and
// the bytes, which are skipped.
function readData(c) {
  return c.vec(() => {
    const flags = c.u32();
    if (flags === 2) c.u32(); // the number of a memory
    const offset = flags === 1 ? null : constExpr(c);
    const size = c.u32();
    const segment = { offset, size, start: c.pos };
    c.pos += size;
    return segment;
  });
}
// endregion: code-data

// region: parse-module
export function parseModule(bytes) {
  const magic = [0x00, 0x61, 0x73, 0x6d, 0x01];
  if (magic.some((b, i) => bytes[i] !== b)) {
    throw new Error('not a WebAssembly module');
  }
  const mod = {
    types: [],
    imports: [],
    funcTypes: [],
    exports: [],
    globals: [],
    code: [],
    data: [],
    importedFuncs: 0,
  };
  const c = cursor(bytes, 8);
  while (c.pos < bytes.length) {
    const id = c.byte();
    const size = c.u32();
    const end = c.pos + size;
    if (id === 1) mod.types = readTypes(c);
    else if (id === 2) mod.imports = readImports(c, mod);
    else if (id === 3) mod.funcTypes = c.vec(() => c.u32());
    else if (id === 6) mod.globals = readGlobals(c);
    else if (id === 7) mod.exports = readExports(c);
    else if (id === 10) mod.code = readCode(c);
    else if (id === 11) mod.data = readData(c);
    c.pos = end; // a section not read here is skipped by its size
  }
  mod.bytes = bytes; // decode reads the bodies from these
  return mod;
}
// endregion: parse-module

// ---------- names, types and instructions ----------

// region: func-name
// Function indexes count the imported functions first.
const importOf = (mod, index) =>
  mod.imports.filter((imp) => imp.kind === 0)[index];

export function funcName(mod, index) {
  if (index < mod.importedFuncs) {
    const imp = importOf(mod, index);
    return `${imp.module}.${imp.name}`;
  }
  const named = (e) => e.kind === 0 && e.index === index;
  const exp = mod.exports.find(named);
  return exp ? exp.name : `func${index}`;
}

export function funcType(mod, index) {
  if (index < mod.importedFuncs) {
    return mod.types[importOf(mod, index).type];
  }
  return mod.types[mod.funcTypes[index - mod.importedFuncs]];
}
// endregion: func-name

// region: immediates
// A block's type: 40 for none, a value type's byte, or a type index.
function blockType(c) {
  const b = c.bytes[c.pos];
  if (b === 0x40) {
    c.pos++;
    return null;
  }
  if (VALTYPE[b]) {
    c.pos++;
    return VALTYPE[b];
  }
  return `type ${Number(c.s64())}`;
}

// The instructions that carry immediates: their names, and how to read
// what follows the opcode byte.
const index = (c) => [c.u32()];
const zero = (c) => {
  c.byte(); // a zero byte, nothing to keep
  return [];
};
const IMMEDIATES = {
  0x02: ['block', (c) => [blockType(c)]],
  0x03: ['loop', (c) => [blockType(c)]],
  0x04: ['if', (c) => [blockType(c)]],
  0x0c: ['br', index],
  0x0d: ['br_if', index],
  0x0e: ['br_table', (c) => [c.vec(() => c.u32()), c.u32()]],
  0x10: ['call', index],
  0x11: ['call_indirect', (c) => [c.u32(), c.u32()]],
  0x1c: ['select', (c) => [c.vec(() => VALTYPE[c.byte()])]],
  0x20: ['local.get', index],
  0x21: ['local.set', index],
  0x22: ['local.tee', index],
  0x23: ['global.get', index],
  0x24: ['global.set', index],
  0x3f: ['memory.size', zero],
  0x40: ['memory.grow', zero],
  0x41: ['i32.const', (c) => [c.s32()]],
  0x42: ['i64.const', (c) => [c.s64()]],
  0x43: ['f32.const', (c) => [c.f32()]],
  0x44: ['f64.const', (c) => [c.f64()]],
};
// endregion: immediates

// region: prefixed
// FC, then a number that picks the instruction.
function prefixed(c, offset) {
  const sub = c.u32();
  if (sub <= 7) return [SATURATING[sub], []]; // nothing follows
  if (sub === 8) {
    const imm = [c.u32()];
    c.byte();
    return ['memory.init', imm];
  }
  if (sub === 9) return ['data.drop', [c.u32()]];
  if (sub === 10) {
    c.byte();
    c.byte();
    return ['memory.copy', []];
  }
  if (sub === 11) {
    c.byte();
    return ['memory.fill', []];
  }
  throw new Error(`unsupported 0xfc ${sub} at byte ${offset}`);
}
// endregion: prefixed

// region: decode
export function decode(mod, index) {
  const body = mod.code[index - mod.importedFuncs];
  if (!body) throw new Error(`no body for function ${index}`);
  const c = cursor(mod.bytes, body.codeStart, body.end);
  const out = [];
  let depth = 1; // the body itself is the first block
  while (c.pos < c.end) {
    const offset = c.pos;
    const code = c.byte();
    let op;
    let imm = [];
    if (PLAIN[code]) op = PLAIN[code];
    else if (LOADS[code] || STORES[code]) {
      op = LOADS[code] || STORES[code];
      imm = [c.u32(), c.u32()]; // the alignment, then the offset
    } else if (IMMEDIATES[code]) {
      const [name, read] = IMMEDIATES[code];
      op = name;
      imm = read(c);
    } else if (code === 0xfc) [op, imm] = prefixed(c, offset);
    else {
      const hex = code.toString(16);
      throw new Error(`unknown opcode 0x${hex} at byte ${offset}`);
    }
    // else and end sit at the depth of the line that opened the block.
    if (op === 'end' || op === 'else') depth--;
    out.push({ offset, code, op, imm, depth });
    if (['block', 'loop', 'if', 'else'].includes(op)) depth++;
  }
  if (depth !== 0) {
    const why = `did not close its blocks (depth ${depth})`;
    throw new Error(`function ${index} ${why}`);
  }
  return out;
}
// endregion: decode

// ---------- the listing ----------

// region: imm-text
// What a listing shows after an instruction's name.
function immText(mod, ins) {
  const { op, imm } = ins;
  if (LOADS[ins.code] || STORES[ins.code]) {
    return imm[1] ? `offset=${imm[1]}` : ''; // no alignment, no 0
  }
  if (op === 'f32.const' || op === 'f64.const') {
    return String(Number(imm[0].toPrecision(9)));
  }
  if (op === 'call') return `${imm[0]} <${funcName(mod, imm[0])}>`;
  if (op === 'br_table') return `${imm[0].join(' ')} default=${imm[1]}`;
  if (['block', 'loop', 'if'].includes(op)) {
    return imm[0] ? `(result ${imm[0]})` : '';
  }
  return imm.map(String).join(' ');
}
// endregion: imm-text

// region: listing
export function listing(mod, index, notes = []) {
  const t = funcType(mod, index);
  const types = (list) => list.join(' ') || '-';
  const name = funcName(mod, index);
  const head = `(func ${name} (param ${types(t.params)})`;
  const lines = decode(mod, index).map((ins, i) => {
    const imm = immText(mod, ins);
    const indent = '  '.repeat(Math.max(0, ins.depth));
    const text = `${indent}${ins.op}${imm ? ` ${imm}` : ''}`;
    // A call already names what it calls, so it gets no note.
    if (!notes[i] || ins.op === 'call') return text;
    return `${text.padEnd(44)} ;; ${notes[i]}`;
  });
  return `${head} (result ${types(t.results)}))\n${lines.join('\n')}`;
}
// endregion: listing
