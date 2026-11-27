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
export function readU32(bytes, pos) {
  throw new Error('not written yet: readU32 in wasm.mjs');
}
// endregion: read-u32

// region: read-s32
export function readS32(bytes, pos) {
  throw new Error('not written yet: readS32 in wasm.mjs');
}
// endregion: read-s32

// region: read-s64
function readS64(bytes, pos) {
  throw new Error('not written yet: readS64 in wasm.mjs');
}
// endregion: read-s64

// region: cursor
function cursor(bytes, pos = 0, end = bytes.length) {
  throw new Error('not written yet: cursor in wasm.mjs');
}
// endregion: cursor

// ---------- the sections ----------

// region: const-expr
function constExpr(c) {
  throw new Error('not written yet: constExpr in wasm.mjs');
}

function limits(c) {
  throw new Error('not written yet: limits in wasm.mjs');
}
// endregion: const-expr

// region: types-imports
function readTypes(c) {
  throw new Error('not written yet: readTypes in wasm.mjs');
}

function readImports(c, mod) {
  throw new Error('not written yet: readImports in wasm.mjs');
}
// endregion: types-imports

// region: globals-exports
function readGlobals(c) {
  throw new Error('not written yet: readGlobals in wasm.mjs');
}

function readExports(c) {
  throw new Error('not written yet: readExports in wasm.mjs');
}
// endregion: globals-exports

// region: code-data
function readCode(c) {
  throw new Error('not written yet: readCode in wasm.mjs');
}

function readData(c) {
  throw new Error('not written yet: readData in wasm.mjs');
}
// endregion: code-data

// region: parse-module
export function parseModule(bytes) {
  throw new Error('not written yet: parseModule in wasm.mjs');
}
// endregion: parse-module

// ---------- names, types and instructions ----------

// region: func-name
export function funcName(mod, index) {
  throw new Error('not written yet: funcName in wasm.mjs');
}

export function funcType(mod, index) {
  throw new Error('not written yet: funcType in wasm.mjs');
}
// endregion: func-name

// region: immediates
function blockType(c) {
  throw new Error('not written yet: blockType in wasm.mjs');
}
// endregion: immediates

// region: prefixed
function prefixed(c, offset) {
  throw new Error('not written yet: prefixed in wasm.mjs');
}
// endregion: prefixed

// region: decode
export function decode(mod, index) {
  throw new Error('not written yet: decode in wasm.mjs');
}
// endregion: decode

// ---------- the listing ----------

// region: imm-text
function immText(mod, ins) {
  throw new Error('not written yet: immText in wasm.mjs');
}
// endregion: imm-text

// region: listing
export function listing(mod, index, notes = []) {
  throw new Error('not written yet: listing in wasm.mjs');
}
// endregion: listing
