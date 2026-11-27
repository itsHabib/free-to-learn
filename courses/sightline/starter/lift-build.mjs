// Module 5: lift the code into expressions, and evaluate them.
//
// lift() follows a function's instructions with a stack of expressions instead
// of numbers. Every store becomes { addr, offset, type, value, guard }: where it
// writes, the expression it writes, and the branch conditions that must hold for
// it to run. Equal expressions are the same object, so they can be compared with
// === and used as Map keys.
//
// An expression is a plain object:
//   { op: 'const', type, value }            type is i32, i64, f32 or f64
//   { op: 'param', index }                  the function's own parameter
//   { op: 'global', index }
//   { op: 'load', type, addr, offset }      type is the instruction, e.g. 'f32.load'
//   { op: 'call', name, args }              an import (env.sin) or the game's own function
//   { op: 'phi', paths: [{ when, value }] } a value that depends on the branch taken;
//                                           when is a list of { cond, holds }
//   { op: 'unknown' }
//   { op: 'i32.add', args: [a, b] } and every other numeric instruction, 'select' too
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 05 fills the regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
import { decode, funcType, funcName } from './wasm.mjs';
import { LOADS, STORES, NUMERIC, UNARY } from './opcodes.mjs';

// ---------- one object per expression ----------

const COMMUTATIVE = new Set([
  'i32.add',
  'i32.mul',
  'i32.and',
  'i32.or',
  'i32.xor',
  'i32.eq',
  'i32.ne',
  'f32.add',
  'f32.mul',
  'f64.add',
  'f64.mul',
]);
const ids = new WeakMap();
const table = new Map();
const idOf = (e) => ids.get(e);

// region: given-make
// A short key built from the ids of an expression's parts, so shared
// parts cost nothing.
function keyOf(e) {
  switch (e.op) {
    case 'const': {
      const v = Object.is(e.value, -0) ? '-0' : String(e.value);
      return `${e.type}:${v}`;
    }
    case 'param':
      return `p${e.index}`;
    case 'global':
      return `g${e.index}`;
    case 'unknown':
      return '?';
    case 'load':
      return `${e.type}[${idOf(e.addr)}+${e.offset}]`;
    case 'call':
      return `${e.name}(${e.args.map(idOf).join(',')})`;
    case 'phi': {
      // Each path: its conditions, ! for one that must not hold, then
      // its value.
      const cond = (g) => (g.holds ? '' : '!') + idOf(g.cond);
      const path = (p) => {
        const when = p.when.map(cond).join('&');
        return `${when}=>${idOf(p.value)}`;
      };
      return `phi{${e.paths.map(path).join('|')}}`;
    }
    default:
      return `${e.op}(${e.args.map(idOf).join(',')})`;
  }
}

// The one object for this expression. Its parts must already be made.
export function make(e) {
  if (e.args && COMMUTATIVE.has(e.op))
    e = { ...e, args: [...e.args].sort((a, b) => idOf(a) - idOf(b)) };
  const k = keyOf(e);
  const had = table.get(k);
  if (had) return had;
  ids.set(e, table.size + 1);
  table.set(k, e);
  return e;
}
// endregion: given-make

export const constant = (type, value) => make({ op: 'const', type, value });
export const UNKNOWN = make({ op: 'unknown' });
// Lift one function. Returns { name, stores, returns, calls }. Each store also
// has `at`, the index of its instruction in decode(mod, index).
// Loops are not followed: locals set inside a loop become unknown, and its stores
// are kept with inLoop: true and unknown values. A load sees the last store to the
// same place on the same path; a store that may or may not have run makes a phi.
// A store whose address is computed is taken not to touch any other place.

// region: fold
function numeric(op, args) {
  throw new Error('not written yet: numeric in lift.mjs');
}
// endregion: fold

// region: lift-state
function liftState(mod, index) {
  throw new Error('not written yet: liftState in lift.mjs');
}

function cond(s, c, holds) {
  throw new Error('not written yet: cond in lift.mjs');
}
// endregion: lift-state

// region: merge
function merge(incoming, depth) {
  throw new Error('not written yet: merge in lift.mjs');
}
// endregion: merge

// region: load-value
function loadValue(s, ins, addr) {
  throw new Error('not written yet: loadValue in lift.mjs');
}
// endregion: load-value

// region: skip-loop
function skipLoop(s, instrs, i) {
  throw new Error('not written yet: skipLoop in lift.mjs');
}
// endregion: skip-loop

// region: open-block
function openBlock(s, ins) {
  throw new Error('not written yet: openBlock in lift.mjs');
}

function elseBranch(s) {
  throw new Error('not written yet: elseBranch in lift.mjs');
}
// endregion: open-block

// region: end-block
function endBlock(s) {
  throw new Error('not written yet: endBlock in lift.mjs');
}
// endregion: end-block

// region: branch
function branch(s, ins) {
  throw new Error('not written yet: branch in lift.mjs');
}
// endregion: branch

// region: step
function step(s, ins, at) {
  throw new Error('not written yet: step in lift.mjs');
}

function call(s, index) {
  throw new Error('not written yet: call in lift.mjs');
}
// endregion: step

// region: lift
export function lift(mod, index) {
  throw new Error('not written yet: lift in lift.mjs');
}
// endregion: lift
// Lift every function the module defines, by name.
// region: lift-all
export function liftAll(mod) {
  throw new Error('not written yet: liftAll in lift.mjs');
}
// endregion: lift-all

// ---------- evaluating ----------

const scratch = new DataView(new ArrayBuffer(8));
const f32 = Math.fround;
const bitsOf = (x) => {
  scratch.setFloat32(0, x, true);
  return scratch.getInt32(0, true);
};
const floatOf = (x) => {
  scratch.setInt32(0, x, true);
  return scratch.getFloat32(0, true);
};
const truncSat = (x, lo, hi) =>
  Number.isNaN(x) ? 0 : Math.max(lo, Math.min(hi, Math.trunc(x)));

const OPS = {
  'i32.add': (a, b) => (a + b) | 0,
  'i32.sub': (a, b) => (a - b) | 0,
  'i32.mul': (a, b) => Math.imul(a, b),
  'i32.div_s': (a, b) => (b === 0 ? null : (a / b) | 0),
  'i32.div_u': (a, b) => (b === 0 ? null : ((a >>> 0) / (b >>> 0)) | 0),
  'i32.rem_s': (a, b) => (b === 0 ? null : (a % b) | 0),
  'i32.rem_u': (a, b) => (b === 0 ? null : ((a >>> 0) % (b >>> 0)) | 0),
  'i32.and': (a, b) => a & b,
  'i32.or': (a, b) => a | b,
  'i32.xor': (a, b) => a ^ b,
  'i32.shl': (a, b) => a << (b & 31),
  'i32.shr_s': (a, b) => a >> (b & 31),
  'i32.shr_u': (a, b) => (a >>> (b & 31)) | 0,
  'i32.eqz': (a) => +(a === 0),
  'i32.eq': (a, b) => +(a === b),
  'i32.ne': (a, b) => +(a !== b),
  'i32.lt_s': (a, b) => +(a < b),
  'i32.gt_s': (a, b) => +(a > b),
  'i32.le_s': (a, b) => +(a <= b),
  'i32.ge_s': (a, b) => +(a >= b),
  'i32.lt_u': (a, b) => +(a >>> 0 < b >>> 0),
  'i32.gt_u': (a, b) => +(a >>> 0 > b >>> 0),
  'i32.le_u': (a, b) => +(a >>> 0 <= b >>> 0),
  'i32.ge_u': (a, b) => +(a >>> 0 >= b >>> 0),
  'f32.add': (a, b) => f32(a + b),
  'f32.sub': (a, b) => f32(a - b),
  'f32.mul': (a, b) => f32(a * b),
  'f32.div': (a, b) => f32(a / b),
  'f32.neg': (a) => -a,
  'f32.abs': (a) => Math.abs(a),
  'f32.sqrt': (a) => f32(Math.sqrt(a)),
  'f32.min': (a, b) => Math.min(a, b),
  'f32.max': (a, b) => Math.max(a, b),
  'f32.floor': (a) => Math.floor(a),
  'f32.ceil': (a) => Math.ceil(a),
  'f32.trunc': (a) => Math.trunc(a),
  'f32.eq': (a, b) => +(a === b),
  'f32.ne': (a, b) => +(a !== b),
  'f32.lt': (a, b) => +(a < b),
  'f32.gt': (a, b) => +(a > b),
  'f32.le': (a, b) => +(a <= b),
  'f32.ge': (a, b) => +(a >= b),
  'f64.add': (a, b) => a + b,
  'f64.sub': (a, b) => a - b,
  'f64.mul': (a, b) => a * b,
  'f64.div': (a, b) => a / b,
  'f64.neg': (a) => -a,
  'f64.sqrt': (a) => Math.sqrt(a),
  'f64.lt': (a, b) => +(a < b),
  'f64.gt': (a, b) => +(a > b),
  'f64.le': (a, b) => +(a <= b),
  'f64.ge': (a, b) => +(a >= b),
  'f32.convert_i32_s': (a) => f32(a | 0),
  'f32.convert_i32_u': (a) => f32(a >>> 0),
  'f64.convert_i32_s': (a) => a | 0,
  'f64.convert_i32_u': (a) => a >>> 0,
  'f32.demote_f64': (a) => f32(a),
  'f64.promote_f32': (a) => a,
  'f32.reinterpret_i32': (a) => floatOf(a),
  'i32.reinterpret_f32': (a) => bitsOf(a),
  'i32.trunc_f32_s': (a) => truncSat(a, -2147483648, 2147483647),
  'i32.trunc_sat_f32_s': (a) => truncSat(a, -2147483648, 2147483647),
  'i32.trunc_f32_u': (a) => truncSat(a, 0, 4294967295) | 0,
  'i32.trunc_sat_f32_u': (a) => truncSat(a, 0, 4294967295) | 0,
  'i32.trunc_f64_s': (a) => truncSat(a, -2147483648, 2147483647),
  'i32.trunc_sat_f64_s': (a) => truncSat(a, -2147483648, 2147483647),
  select: (a, b, c) => (c ? a : b),
};
// The value of e, or null where it can't be known. env:
//   load(type, address)   the number at that address: 'i32.load' gives the word,
//                         'f32.load' the float; null if unknown
//   call(name, args)      the value of an import, or null
//   given                 a Map from expression to the value to use in its place
//   memo                  a Map that caches values for one evaluation round
// region: evaluate
export function evaluate(e, env) {
  throw new Error('not written yet: evaluate in lift.mjs');
}
// endregion: evaluate
// Do all of a guard's conditions hold? null when one of them can't be known.
// region: holds
export function holds(when, env) {
  throw new Error('not written yet: holds in lift.mjs');
}
// endregion: holds
// Memory you can write without touching the game: reads fall through to the
// bytes you pass (the game's own, read while it is not running), writes stay in
// a Map of words.
// region: overlay
export function overlay(bytes) {
  throw new Error('not written yet: overlay in lift.mjs');
}
// endregion: overlay
// Run a list of lifted stores once against memory m (from overlay): every value is
// worked out from memory as it was before the first store, then the stores whose
// guards hold are written in order. Returns how many were written (the overlay keeps
// 32-bit words only, so a byte store is not counted).
// region: apply
export function apply(list, m, { call = () => null, given } = {}) {
  throw new Error('not written yet: apply in lift.mjs');
}
// endregion: apply

// ---------- printing ----------

const SYMBOL = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  xor: '^',
  and: '&',
  or: '|',
  shl: '<<',
  shr_u: '>>>',
  shr_s: '>>',
  lt: '<',
  gt: '>',
  le: '<=',
  ge: '>=',
  eq: '==',
  ne: '!=',
  lt_s: '<',
  gt_s: '>',
  le_s: '<=',
  ge_s: '>=',
  lt_u: '<',
  gt_u: '>',
  le_u: '<=',
  ge_u: '>=',
  rem_u: '%',
  rem_s: '%',
  div_u: '/',
  div_s: '/',
};
const SHORT = {
  'f32.reinterpret_i32': 'asfloat',
  'i32.reinterpret_f32': 'asbits',
  'f32.convert_i32_s': 'float',
  'f32.convert_i32_u': 'float',
  'f32.demote_f64': '',
  'f64.promote_f32': '',
  'i32.trunc_sat_f32_s': 'int',
  'i32.eqz': 'not',
};

// Where an address expression points, as text: [0x13120] for a fixed address,
// *0x13120 for the address held there, *0x13120+4 for a field of that.
export function place(addr, offset = 0) {
  if (addr.op === 'const') return `[0x${(addr.value + offset).toString(16)}]`;
  if (addr.op === 'load' && addr.type === 'i32.load') {
    // Through more than one pointer, +0 is written out: *0x2000+4 alone would read
    // as field 4 of the first struct.
    const chained = addr.addr.op === 'load';
    return `${place(addr.addr, addr.offset).replace(/^\[(.*)\]$/, '*$1')}${offset || chained ? `+${offset}` : ''}`;
  }
  return `(${show(addr)})${offset ? `+${offset}` : ''}`;
}

// One condition of a guard, as text: `x` for { cond: not(x), holds: false }.
function condText(g, s) {
  const c = g.cond;
  if (c.op === 'i32.eqz') return g.holds ? `not ${s(c.args[0])}` : s(c.args[0]);
  return g.holds ? s(c) : `not ${s(c)}`;
}
const whenText = (when, s) => when.map((g) => condText(g, s)).join(' and ');
// A phi made by lift() for "one of these paths arrived": 1 on each path, 0 otherwise.
const isAny = (e) =>
  e.op === 'phi' &&
  e.paths.every((p, i) =>
    i === e.paths.length - 1
      ? p.when.length === 0 && p.value.op === 'const' && p.value.value === 0
      : p.value.op === 'const' && p.value.value === 1,
  );

export function show(e, depth = 0) {
  if (depth > 10) return '…';
  const s = (x) => show(x, depth + 1);
  switch (e.op) {
    case 'const':
      return e.type.startsWith('f')
        ? String(Number(Number(e.value).toPrecision(9)))
        : String(e.value);
    case 'param':
      return `param${e.index}`;
    case 'global':
      return `global${e.index}`;
    case 'unknown':
      return '?';
    case 'load':
      return `${e.type.startsWith('f32') ? 'f' : e.type.includes('8') ? 'b' : 'i'}${place(e.addr, e.offset)}`;
    case 'call':
      return `${e.name.replace(/^env\./, '')}(${e.args.map(s).join(', ')})`;
    case 'phi':
      if (isAny(e))
        return `(${e.paths
          .slice(0, -1)
          .map((p) => whenText(p.when, s))
          .join(' or ')})`;
      return `(${e.paths.map((p) => `${whenText(p.when, s) || 'otherwise'}: ${s(p.value)}`).join('; ')})`;
    case 'select':
      return `(${s(e.args[2])} ? ${s(e.args[0])} : ${s(e.args[1])})`;
    default: {
      const name = e.op.split('.')[1];
      if (SYMBOL[name] && e.args.length === 2)
        return `(${s(e.args[0])} ${SYMBOL[name]} ${s(e.args[1])})`;
      const short = SHORT[e.op];
      if (short === '') return s(e.args[0]);
      return `${short ?? name}(${e.args.map(s).join(', ')})`;
    }
  }
}

export function showStore(st) {
  const kind = st.type.startsWith('f32')
    ? 'f'
    : st.type.includes('8')
      ? 'b'
      : 'i';
  const when = whenText(st.guard, show);
  return `${kind}${place(st.addr, st.offset)} = ${show(st.value)}${when ? `   when ${when}` : ''}`;
}
// ---------- passes over lifted code ----------

// Every expression inside e, each once, e first.
// region: parts
export function parts(e, out = new Set()) {
  throw new Error('not written yet: parts in lift.mjs');
}
// endregion: parts

// A place is an address expression and an offset: field +16 of the struct whose
// address is kept at 0x13120 is (load of 0x13120, 16). Its key names it in Maps.
export const placeKey = (addr, offset) => `${idOf(addr)}+${offset}`;
// The loads inside e: { key, addr, offset, type, load } for each.
// region: loads-in
export function loadsIn(e) {
  throw new Error('not written yet: loadsIn in lift.mjs');
}
// endregion: loads-in
// Cross-references: for every place the lifted functions touch, the functions that
// read it and the stores that write it. A store at a computed address is left out.
// region: xrefs
export function xrefs(lifted) {
  throw new Error('not written yet: xrefs in lift.mjs');
}
// endregion: xrefs
// The stores in list that decide the places in targets (place keys): those stores,
// then the stores to every place their values and guards read, until nothing is added.
// region: slice
export function slice(list, targets) {
  throw new Error('not written yet: slice in lift.mjs');
}
// endregion: slice
