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
// Fold what can be folded: two i32 constants added, and adding 0.
function numeric(op, args) {
  const [a, b] = args;
  if (op === 'i32.add') {
    const both = a.op === 'const' && b?.op === 'const';
    if (both) return constant('i32', (a.value + b.value) | 0);
    if (b?.op === 'const' && b.value === 0) return a;
    if (a.op === 'const' && a.value === 0) return b;
  }
  return make({ op, args });
}
// endregion: fold

// region: lift-state
// Everything lift knows at one point of a function: the stack, the
// locals, the guard (the conditions that hold on this path), whether
// the path is dead, the blocks open around it, and what it found.
function liftState(mod, index) {
  const type = funcType(mod, index);
  const locals = new Map();
  type.params.forEach((_, i) => {
    locals.set(i, make({ op: 'param', index: i }));
  });
  return {
    mod,
    type,
    locals,
    stores: [],
    returns: [],
    calls: [],
    stack: [],
    guard: [],
    dead: false,
    frames: [],
    conds: new Map(),
  };
}

// One object per condition and outcome, so guards compare with ===.
function cond(s, c, holds) {
  const k = `${holds}:${keyOf(c)}`;
  if (!s.conds.has(k)) s.conds.set(k, { cond: c, holds });
  return s.conds.get(k);
}

// An empty stack gives unknown rather than undefined.
const pop = (s) => s.stack.pop() ?? UNKNOWN;
// Copies of what a path holds, kept when it leaves a block.
const path = (s, stack) => ({
  guard: [...s.guard],
  locals: new Map(s.locals),
  stack,
});
// endregion: lift-state

// region: merge
// Where paths meet: their one value, or a phi that says which path
// gives which value, its conditions taken from depth on.
function merge(incoming, depth) {
  const values = incoming.map((x) => x.value);
  if (values.every((v) => v === values[0])) return values[0];
  const paths = incoming.map((x) => ({
    when: x.guard.slice(depth),
    value: x.value,
  }));
  return make({ op: 'phi', paths });
}
// endregion: merge

// region: load-value
// Is guard a the start of guard b? Then a store made under a ran on
// every path that has b's conditions.
const sameStart = (a, b) =>
  a.length <= b.length && a.every((g, i) => g === b[i]);

// What a load reads on this path: the last store to the same place, a
// phi when that store may not have run, or the load itself.
function loadValue(s, ins, addr) {
  const offset = ins.imm[1];
  const entry = make({ op: 'load', type: ins.op, addr, offset });
  if (!['i32.load', 'f32.load'].includes(ins.op)) return entry;
  const float = ins.op.startsWith('f32');
  let value = entry;
  for (const st of s.stores) {
    if (st.inLoop || st.addr !== addr || st.offset !== offset) continue;
    if (!['i32.store', 'f32.store'].includes(st.type)) continue;
    let v = st.value;
    if (st.type.startsWith('f32') !== float) {
      // The same bits read as the other type.
      const as = float ? 'f32.reinterpret_i32' : 'i32.reinterpret_f32';
      v = numeric(as, [v]);
    }
    if (sameStart(st.guard, s.guard)) value = v;
    else {
      // The conditions the two paths share, then the store's own.
      let n = 0;
      const [a, b] = [st.guard, s.guard];
      while (n < a.length && n < b.length && a[n] === b[n]) n++;
      const paths = [
        { when: st.guard.slice(n), value: v },
        { when: [], value },
      ];
      value = make({ op: 'phi', paths });
    }
  }
  return value;
}
// endregion: load-value

// region: skip-loop
// A loop is not followed. Locals set inside become unknown, its stores
// are kept with inLoop: true, and a loop with a result leaves unknown.
// Returns the index of the loop's end.
function skipLoop(s, instrs, i) {
  let depth = 1;
  let j = i + 1;
  for (; j < instrs.length; j++) {
    const inner = instrs[j];
    if (['block', 'loop', 'if'].includes(inner.op)) depth++;
    if (inner.op === 'end' && --depth === 0) break;
    if (s.dead) continue;
    if (inner.op === 'local.set' || inner.op === 'local.tee') {
      s.locals.set(inner.imm[0], UNKNOWN);
    }
    if (STORES[inner.code]) {
      const offset = inner.imm[1];
      const guard = [...s.guard];
      s.stores.push({
        ...{ addr: UNKNOWN, offset, type: inner.op, value: UNKNOWN },
        ...{ guard, inLoop: true, at: j },
      });
    }
  }
  const result = instrs[i].imm[0];
  const typed = result && !String(result).startsWith('type');
  if (!s.dead && typed) s.stack.push(UNKNOWN);
  return j;
}
// endregion: skip-loop

// region: open-block
// block and if open a frame that remembers the path as it was. An if
// takes its condition, which holds inside it.
function openBlock(s, ins) {
  const { op, imm } = ins;
  const c = op === 'if' && !s.dead ? pop(s) : null;
  s.frames.push({
    kind: op,
    height: s.stack.length,
    guard: [...s.guard],
    locals: new Map(s.locals),
    exits: [],
    cond: c,
    deadBefore: s.dead,
    result: imm[0],
    escaped: false,
  });
  if (c) s.guard = [...s.guard, cond(s, c, true)];
}

// else: the then-branch's path is kept as an exit, and the path starts
// again from the if, with its condition not holding.
function elseBranch(s) {
  const f = s.frames[s.frames.length - 1];
  if (!s.dead) f.exits.push(path(s, s.stack.slice(f.height)));
  s.stack.length = f.height;
  s.locals.clear();
  for (const [k, v] of f.locals) s.locals.set(k, v);
  s.dead = f.deadBefore;
  if (!s.dead) s.guard = [...f.guard, cond(s, f.cond, false)];
  f.sawElse = true;
}
// endregion: open-block

// region: end-block
// end: the paths that reach it meet. True at the function's own end.
function endBlock(s) {
  const f = s.frames.pop();
  if (!f) {
    // What is left on the stack is what the function returns.
    if (!s.dead && s.type.results.length) {
      const value = s.stack[s.stack.length - 1] ?? UNKNOWN;
      s.returns.push({ guard: [...s.guard], value });
    }
    return true;
  }
  const incoming = [...f.exits];
  if (!s.dead) incoming.push(path(s, s.stack.slice(f.height)));
  if (f.kind === 'if' && !f.sawElse && !f.deadBefore) {
    // An if with no else falls through when its condition doesn't hold.
    const guard = [...f.guard, cond(s, f.cond, false)];
    incoming.push({ guard, locals: f.locals, stack: [] });
  }
  s.stack.length = f.height;
  s.guard = f.guard;
  s.dead = f.deadBefore || incoming.length === 0;
  if (s.dead) return false;
  // If a path left this block for an outer one, only the paths that
  // arrived here go on: what follows runs when one of theirs holds.
  const rest = incoming.map((x) => x.guard.slice(f.guard.length));
  if (f.escaped && !rest.some((r) => r.length === 0)) {
    const one = constant('i32', 1);
    const zero = constant('i32', 0);
    const paths = rest.map((when) => ({ when, value: one }));
    const arrived = make({
      op: 'phi',
      paths: [...paths, { when: [], value: zero }],
    });
    s.guard = [...f.guard, cond(s, arrived, true)];
  }
  const depth = f.guard.length;
  const keys = new Set(incoming.flatMap((x) => [...x.locals.keys()]));
  for (const k of keys) {
    const at = incoming.map((x) => ({
      guard: x.guard,
      value: x.locals.get(k) ?? UNKNOWN,
    }));
    s.locals.set(k, merge(at, depth));
  }
  if (f.result && !String(f.result).startsWith('type')) {
    const top = incoming.map((x) => ({
      guard: x.guard,
      value: x.stack[x.stack.length - 1] ?? UNKNOWN,
    }));
    s.stack.push(merge(top, depth));
  }
  return false;
}
// endregion: end-block

// region: branch
// br and br_if leave blocks; return, br_table and unreachable end the
// path. A br_if's path goes on with its condition not holding.
function branch(s, ins) {
  const { op, imm } = ins;
  if (op === 'return' || op === 'br_table' || op === 'unreachable') {
    if (op === 'return') {
      const value = s.type.results.length ? pop(s) : null;
      s.returns.push({ guard: [...s.guard], value });
    }
    if (op === 'br_table') pop(s);
    s.dead = true;
    for (const f of s.frames) f.escaped = true;
    return;
  }
  const c = op === 'br_if' ? pop(s) : null;
  const target = s.frames[s.frames.length - 1 - imm[0]];
  const out = c ? [...s.guard, cond(s, c, true)] : [...s.guard];
  // Every block it leaves on the way has a path that escaped it.
  for (let k = s.frames.length - imm[0]; k < s.frames.length; k++) {
    s.frames[k].escaped = true;
  }
  if (target) {
    const stack = s.stack.slice(target.height);
    target.exits.push({ guard: out, locals: new Map(s.locals), stack });
  } else {
    // Out of the function's own block: a return.
    const top = s.stack[s.stack.length - 1] ?? UNKNOWN;
    const value = s.type.results.length ? top : null;
    s.returns.push({ guard: out, value });
  }
  if (c) s.guard = [...s.guard, cond(s, c, false)];
  else s.dead = true;
}
// endregion: branch

// region: step
// Every other instruction: its effect on the stack, the locals, the
// stores and the calls.
function step(s, ins, at) {
  const { op, imm, code } = ins;
  const push = (e) => s.stack.push(e);
  if (/^(i32|i64|f32|f64)\.const$/.test(op))
    push(constant(op.slice(0, 3), imm[0]));
  else if (op === 'local.get') {
    push(s.locals.get(imm[0]) ?? constant('i32', 0));
  } else if (op === 'local.set') s.locals.set(imm[0], pop(s));
  else if (op === 'local.tee') {
    const v = pop(s);
    s.locals.set(imm[0], v);
    push(v);
  } else if (op === 'global.get') {
    push(make({ op: 'global', index: imm[0] }));
  } else if (op === 'global.set' || op === 'drop') pop(s);
  else if (LOADS[code]) push(loadValue(s, ins, pop(s)));
  else if (STORES[code]) {
    const value = pop(s);
    const addr = pop(s);
    const guard = [...s.guard];
    s.stores.push({ addr, offset: imm[1], type: op, value, guard, at });
  } else if (NUMERIC[code]) {
    if (UNARY.has(code)) push(numeric(op, [pop(s)]));
    else {
      const b = pop(s);
      const a = pop(s);
      push(numeric(op, [a, b]));
    }
  } else if (op.includes('trunc_sat')) push(numeric(op, [pop(s)]));
  else if (op === 'select') {
    const c = pop(s);
    const b = pop(s);
    const a = pop(s);
    push(make({ op: 'select', args: [a, b, c] }));
  } else if (op === 'call') call(s, imm[0]);
  else if (op === 'call_indirect' || op === 'memory.grow') {
    pop(s);
    push(UNKNOWN);
  } else if (op === 'memory.size') push(UNKNOWN);
  else if (op === 'memory.fill' || op === 'memory.copy') {
    pop(s);
    pop(s);
    pop(s);
  }
}

// A call takes one value per parameter, the last on top, and pushes one
// for a result. It is kept with the guard it runs under.
function call(s, index) {
  const t = funcType(s.mod, index);
  const args = [];
  for (let k = 0; k < t.params.length; k++) args.unshift(pop(s));
  const name = funcName(s.mod, index);
  const e = make({ op: 'call', name, args });
  s.calls.push({ call: e, guard: [...s.guard] });
  if (t.results.length) s.stack.push(e);
}
// endregion: step

// region: lift
export function lift(mod, index) {
  const instrs = decode(mod, index);
  const s = liftState(mod, index);
  const ends = ['block', 'if', 'else', 'end'];
  for (let i = 0; i < instrs.length; i++) {
    const ins = instrs[i];
    const { op } = ins;
    if (op === 'loop') {
      i = skipLoop(s, instrs, i);
      continue;
    }
    // A dead path still has to keep count of its blocks.
    if (s.dead && !ends.includes(op)) continue;
    if (op === 'block' || op === 'if') openBlock(s, ins);
    else if (op === 'else') elseBranch(s);
    else if (op === 'end') {
      if (endBlock(s)) break;
    } else if (/^(br|br_if|br_table|return|unreachable)$/.test(op)) {
      branch(s, ins);
    } else step(s, ins, i);
  }
  const { stores, returns, calls } = s;
  return { name: funcName(mod, index), stores, returns, calls };
}
// endregion: lift
// Lift every function the module defines, by name.
// region: lift-all
export function liftAll(mod) {
  const out = new Map();
  const first = mod.importedFuncs;
  for (let index = first; index < first + mod.code.length; index++) {
    out.set(funcName(mod, index), lift(mod, index));
  }
  return out;
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
  if (env.given?.has(e)) return env.given.get(e);
  if (env.memo?.has(e)) return env.memo.get(e);
  let v = null; // what can't be known stays null
  if (e.op === 'const') {
    // An i64 constant is a BigInt, which no arithmetic here takes.
    v = typeof e.value === 'bigint' ? null : e.value;
  } else if (e.op === 'load') {
    const a = evaluate(e.addr, env);
    if (a !== null) v = env.load(e.type, (a + e.offset) >>> 0);
  } else if (e.op === 'call') {
    const args = e.args.map((x) => evaluate(x, env));
    if (!args.includes(null)) v = env.call?.(e.name, args) ?? null;
  } else if (e.op === 'phi') {
    // The first path whose conditions all hold gives the value.
    for (const p of e.paths) {
      const h = holds(p.when, env);
      if (h === null) break;
      if (h) {
        v = evaluate(p.value, env);
        break;
      }
    }
  } else if (!['param', 'global', 'unknown'].includes(e.op)) {
    const f = OPS[e.op];
    const args = e.args.map((x) => evaluate(x, env));
    if (f && !args.includes(null)) v = f(...args);
  }
  env.memo?.set(e, v);
  return v;
}
// endregion: evaluate
// Do all of a guard's conditions hold? null when one of them can't be known.
// region: holds
export function holds(when, env) {
  for (const { cond, holds: want } of when) {
    const c = evaluate(cond, env);
    if (c === null) return null;
    if ((c !== 0) !== want) return false;
  }
  return true;
}
// endregion: holds
// Memory you can write without touching the game: reads fall through to the
// bytes you pass (the game's own, read while it is not running), writes stay in
// a Map of words.
// region: overlay
export function overlay(bytes) {
  const { buffer, byteOffset, byteLength } = bytes;
  const base = new DataView(buffer, byteOffset, byteLength);
  const words = new Map(); // address to the 32-bit word written there
  const word = (a) => {
    if (words.has(a)) return words.get(a);
    return a + 4 <= base.byteLength ? base.getInt32(a, true) : null;
  };
  const load = (type, a) => {
    if (a % 4 !== 0) {
      // Only a byte can be read off a word's boundary.
      if (type !== 'i32.load8_u') return null;
      const w = word(a & ~3);
      return w === null ? null : (w >>> (8 * (a & 3))) & 255;
    }
    const w = word(a);
    if (w === null) return null;
    if (type === 'i32.load') return w;
    if (type === 'f32.load') return floatOf(w);
    if (type === 'i32.load8_u') return w & 255;
    return null;
  };
  const store = (type, a, v) => {
    if (a % 4 !== 0 || v === null) return false;
    if (type === 'i32.store') words.set(a, v | 0);
    else if (type === 'f32.store') words.set(a, bitsOf(v));
    else return false;
    return true;
  };
  return { load, store, words };
}
// endregion: overlay
// Run a list of lifted stores once against memory m (from overlay): every value is
// worked out from memory as it was before the first store, then the stores whose
// guards hold are written in order. Returns how many were written (the overlay keeps
// 32-bit words only, so a byte store is not counted).
// region: apply
export function apply(list, m, { call = () => null, given } = {}) {
  const env = { load: m.load, call, given, memo: new Map() };
  // Every value from memory as it was before the first store.
  const writes = [];
  for (const st of list) {
    if (st.inLoop) continue;
    if (holds(st.guard, env) !== true) continue;
    const a = evaluate(st.addr, env);
    if (a === null) continue;
    const value = evaluate(st.value, env);
    writes.push([st.type, (a + st.offset) >>> 0, value]);
  }
  let n = 0;
  for (const [type, a, v] of writes) if (m.store(type, a, v)) n++;
  return n;
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
  if (out.has(e)) return out; // shared parts are visited once
  out.add(e);
  if (e.args) for (const a of e.args) parts(a, out);
  if (e.op === 'load') parts(e.addr, out);
  if (e.op === 'phi') {
    for (const p of e.paths) {
      parts(p.value, out);
      for (const x of p.when) parts(x.cond, out);
    }
  }
  return out;
}
// endregion: parts

// A place is an address expression and an offset: field +16 of the struct whose
// address is kept at 0x13120 is (load of 0x13120, 16). Its key names it in Maps.
export const placeKey = (addr, offset) => `${idOf(addr)}+${offset}`;
// The loads inside e: { key, addr, offset, type, load } for each.
// region: loads-in
export function loadsIn(e) {
  const out = [];
  for (const x of parts(e)) {
    if (x.op !== 'load') continue;
    const { addr, offset, type } = x;
    const key = placeKey(addr, offset);
    out.push({ key, addr, offset, type, load: x });
  }
  return out;
}
// endregion: loads-in
// Cross-references: for every place the lifted functions touch, the functions that
// read it and the stores that write it. A store at a computed address is left out.
// region: xrefs
export function xrefs(lifted) {
  const places = new Map();
  const at = (addr, offset) => {
    const key = placeKey(addr, offset);
    if (!places.has(key)) {
      const reads = new Set();
      places.set(key, { key, addr, offset, reads, writes: [] });
    }
    return places.get(key);
  };
  for (const [name, f] of lifted) {
    // Every expression the function uses: what it returns, its calls,
    // and each store's value, address and conditions.
    const seen = f.returns.map((r) => r.value).filter(Boolean);
    seen.push(...f.calls.map((c) => c.call));
    for (const st of f.stores) {
      if (st.inLoop) continue;
      const fixed = st.addr.op === 'const' || st.addr.op === 'load';
      const place = fixed ? at(st.addr, st.offset) : null;
      if (place) place.writes.push({ fn: name, ...st });
      seen.push(st.value, st.addr, ...st.guard.map((x) => x.cond));
    }
    for (const e of seen) {
      for (const l of loadsIn(e)) at(l.addr, l.offset).reads.add(name);
    }
  }
  return places;
}
// endregion: xrefs
// The stores in list that decide the places in targets (place keys): those stores,
// then the stores to every place their values and guards read, until nothing is added.
// region: slice
export function slice(list, targets) {
  const want = new Set(targets);
  const keep = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const st of list) {
      if (st.inLoop || keep.has(st)) continue;
      if (!want.has(placeKey(st.addr, st.offset))) continue;
      keep.add(st);
      grew = true;
      // Whatever decides this store is wanted too.
      const conds = st.guard.map((x) => x.cond);
      for (const e of [st.value, st.addr, ...conds]) {
        for (const l of loadsIn(e)) want.add(l.key);
      }
    }
  }
  return list.filter((st) => keep.has(st));
}
// endregion: slice
