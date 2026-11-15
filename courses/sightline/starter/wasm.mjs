// Module 4: decode the game's WebAssembly.
// Every function throws "not written yet" until you write it. API.md has the details.

// { value, next }: an unsigned LEB128 number.
export function readU32(bytes, pos) {
  throw new Error('not written yet: readU32 in wasm.mjs');
}

// { value, next }: a signed LEB128 number.
export function readS32(bytes, pos) {
  throw new Error('not written yet: readS32 in wasm.mjs');
}

// { types, imports, funcTypes, exports, globals, code, data, importedFuncs }.
export function parseModule(bytes) {
  throw new Error('not written yet: parseModule in wasm.mjs');
}

// [{ offset, code, op, imm, depth }] for one defined function: code is the opcode byte.
export function decode(mod, index) {
  throw new Error('not written yet: decode in wasm.mjs');
}

// The function's export or import name, or func<index>.
export function funcName(mod, index) {
  throw new Error('not written yet: funcName in wasm.mjs');
}

// { params, results } for a function, imported or defined.
export function funcType(mod, index) {
  throw new Error('not written yet: funcType in wasm.mjs');
}

// One instruction per line, indented by depth, with notes after ;;.
export function listing(mod, index, notes = []) {
  throw new Error('not written yet: listing in wasm.mjs');
}
