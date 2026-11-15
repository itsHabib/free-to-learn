// Unit 08 Machine. Runs the program listings in programs/*.json
// one instruction at a time, keeping everything it knows in one plain object
// (machine.state), so a debugger can copy, compare and restore it.
//
// state = { memory, globals, stack, frames, tick, calls, result }
//   memory  Uint8Array, the linear memory
//   globals the global variables (numbers)
//   stack   the value stack (numbers; an i64 is a BigInt)
//   frames  one entry per function call in progress, innermost last:
//           { func, at, locals, base, labels }, labels = [{ end, height, arity, loop }]
//   tick    instructions executed since the machine was made
//   calls   export calls started
//   result  what the last finished export call returned (undefined for none)
const PAGE = 65536;

// The course hands the machine a program already loaded (public/program.mjs
// loadProgram). A raw listing is accepted too and loaded the same way here, so
// this file needs nothing but itself.
export function loaded(program) {
  if (program?.loaded === true) return program;
  if (program?.format !== 'ttd2-program-1')
    throw Error('Machine: not a program listing (format ttd2-program-1)');
  const p = globalThis.structuredClone(program);
  for (const f of p.functions)
    f.code = f.code.map((ins) =>
      ins[0] === 'i64.const'
        ? [ins[0], BigInt(String(ins[1]).replace(/n$/, ''))]
        : ins,
    );
  p.data = p.data.map((d) => ({
    offset: d.offset,
    bytes:
      typeof d.bytes === 'string'
        ? Uint8Array.from(Buffer.from(d.bytes, 'hex'))
        : d.bytes,
  }));
  const byIndex = new Map(p.functions.map((f) => [f.index, f]));
  Object.defineProperties(p, {
    loaded: { value: true },
    func: { value: (index) => byIndex.get(index) },
    typeOf: {
      value: (index) =>
        index < p.imports.length
          ? p.types[p.imports[index].type]
          : p.types[byIndex.get(index)?.type],
    },
    exportIndex: {
      value: (name) =>
        p.exports.find((x) => x.kind === 'func' && x.name === name)?.index,
    },
  });
  return p;
}

export class Machine {
  constructor(program, imports = {}) {
    this.program = loaded(program);
    // Per function: a number for each instruction (faster to switch on than its name)
    // and, for each block, the position of its matching end.
    this.prepared = new Map(
      this.program.functions.map((f) => [f.index, prepare(f)]),
    );
    this.imports = this.program.imports.map((i) => {
      const f = imports[i.name];
      if (typeof f !== 'function')
        throw Error(`Machine: no function given for the import ${i.name}`);
      return f;
    });
    // region: initial-state
    const memory = new Uint8Array(this.program.memory.min * PAGE);
    for (const d of this.program.data) memory.set(d.bytes, d.offset);
    this.state = {
      memory,
      globals: this.program.globals.map((g) => g.init),
      stack: [],
      frames: [],
      tick: 0,
      calls: 0,
      result: undefined,
    };
    // endregion: initial-state
  }

  // region: call-entry
  get running() {
    return this.state.frames.length > 0;
  }

  // Start a call to an export. Nothing runs until step().
  begin(name, args = []) {
    if (this.running)
      throw Error(`Machine: ${name} called while another call is unfinished`);
    const e = this.program.exports.find(
      (x) => x.name === name && x.kind === 'func',
    );
    if (!e) throw Error(`Machine: no exported function named ${name}`);
    const type = this.program.typeOf(e.index);
    if (args.length !== type.params.length)
      throw Error(
        `Machine: ${name} takes ${type.params.length} arguments, got ${args.length}`,
      );
    this.state.calls++;
    this.state.result = undefined;
    this.enter(
      e.index,
      args.map((a, i) => coerce(type.params[i], a)),
    );
  }

  // Run a whole export call and return its result.
  invoke(name, args = []) {
    this.begin(name, args);
    while (this.running) this.step();
    return this.state.result;
  }

  enter(index, args) {
    const fn = this.prepared.get(index);
    const locals = [...args, ...fn.locals.map(zeroOf)];
    this.state.frames.push({
      func: index,
      at: 0,
      locals,
      base: this.state.stack.length,
      labels: [],
    });
  }
  // endregion: call-entry

  // Execute one instruction. Returns { tick, func, at, op, writes }, where each
  // write is { address, size, before, after } with before and after as byte arrays.
  // region: step-start
  step() {
    const s = this.state;
    const frame = s.frames[s.frames.length - 1];
    if (!frame)
      throw Error('Machine: no call in progress; use begin(name, args) first');
    const fn = this.prepared.get(frame.func);
    const at = frame.at;
    const ins = fn.code[at];
    const op = fn.ops[at];
    const event = {
      tick: s.tick + 1,
      func: frame.func,
      at,
      op: ins[0],
      writes: [],
    };
    const st = s.stack;
    frame.at = at + 1;
    // endregion: step-start
    switch (op) {
      case 0:
        /* block */ frame.labels.push({
          end: fn.ends[at],
          height: st.length,
          arity: ins[1] ? 1 : 0,
          loop: false,
        });
        break;
      case 1:
        /* loop */ frame.labels.push({
          end: at,
          height: st.length,
          arity: 0,
          loop: true,
        });
        break;
      case 2:
        /* br */ this.branch(frame, ins[1]);
        break;
      case 3:
        /* br_if */ if (st.pop() !== 0) this.branch(frame, ins[1]);
        break;
      case 4 /* end */:
        if (frame.labels.length) frame.labels.pop();
        else this.leave(frame);
        break;
      case 5:
        /* return */ this.leave(frame);
        break;
      case 6: /* call */ {
        const callee = ins[1];
        const type = this.program.typeOf(callee);
        const args = st.splice(
          st.length - type.params.length,
          type.params.length,
        );
        if (callee < this.imports.length) {
          const r = this.imports[callee](...args);
          if (type.results.length) st.push(coerce(type.results[0], r));
        } else this.enter(callee, args);
        break;
      }
      case 7:
        /* local.get */ st.push(frame.locals[ins[1]]);
        break;
      case 8:
        /* local.set */ frame.locals[ins[1]] = st.pop();
        break;
      case 9:
        /* local.tee */ frame.locals[ins[1]] = st[st.length - 1];
        break;
      case 10:
        /* global.get */ st.push(s.globals[ins[1]]);
        break;
      case 11:
        /* global.set */ s.globals[ins[1]] = st.pop();
        break;
      case 12: /* select */ {
        const c = st.pop(),
          b = st.pop(),
          a = st.pop();
        st.push(c !== 0 ? a : b);
        break;
      }
      case 13:
        /* i32.const */ st.push(ins[1]);
        break;
      case 14:
        /* i64.const */ st.push(ins[1]);
        break;
      case 15:
        /* f32.const */ st.push(Math.fround(ins[1]));
        break;
      // loads: [align, offset]
      case 20:
        st.push(this.view(st.pop(), ins[2], 4).getInt32(0, true));
        break; // i32.load
      case 21:
        st.push(this.view(st.pop(), ins[2], 1).getUint8(0));
        break; // i32.load8_u
      case 22:
        st.push(this.view(st.pop(), ins[2], 4).getFloat32(0, true));
        break; // f32.load
      // stores: [align, offset]
      case 30: {
        const v = st.pop();
        this.store(event, st.pop(), ins[2], 4, (d) => d.setInt32(0, v, true));
        break;
      } // i32.store
      case 31: {
        const v = st.pop();
        this.store(event, st.pop(), ins[2], 1, (d) => d.setUint8(0, v & 255));
        break;
      } // i32.store8
      case 32: {
        const v = st.pop();
        this.store(event, st.pop(), ins[2], 2, (d) =>
          d.setUint16(0, v & 65535, true),
        );
        break;
      } // i32.store16
      case 33: {
        const v = st.pop();
        this.store(event, st.pop(), ins[2], 4, (d) => d.setFloat32(0, v, true));
        break;
      } // f32.store
      case 34: {
        const v = st.pop();
        this.store(event, st.pop(), ins[2], 8, (d) =>
          d.setBigInt64(0, v, true),
        );
        break;
      } // i64.store
      // i32 arithmetic and comparisons
      case 40:
        st.push(st.pop() === 0 ? 1 : 0);
        break; // i32.eqz
      case 41: {
        const b = st.pop(),
          a = st.pop();
        st.push(a !== b ? 1 : 0);
        break;
      } // i32.ne
      case 42: {
        const b = st.pop(),
          a = st.pop();
        st.push(a < b ? 1 : 0);
        break;
      } // i32.lt_s
      case 43: {
        const b = st.pop() >>> 0,
          a = st.pop() >>> 0;
        st.push(a < b ? 1 : 0);
        break;
      } // i32.lt_u
      case 44: {
        const b = st.pop(),
          a = st.pop();
        st.push(a > b ? 1 : 0);
        break;
      } // i32.gt_s
      case 45: {
        const b = st.pop() >>> 0,
          a = st.pop() >>> 0;
        st.push(a > b ? 1 : 0);
        break;
      } // i32.gt_u
      case 46: {
        const b = st.pop(),
          a = st.pop();
        st.push(a <= b ? 1 : 0);
        break;
      } // i32.le_s
      case 47: {
        const b = st.pop(),
          a = st.pop();
        st.push(a >= b ? 1 : 0);
        break;
      } // i32.ge_s
      case 48: {
        const b = st.pop(),
          a = st.pop();
        st.push((a + b) | 0);
        break;
      } // i32.add
      case 49: {
        const b = st.pop(),
          a = st.pop();
        st.push((a - b) | 0);
        break;
      } // i32.sub
      case 50: {
        const b = st.pop(),
          a = st.pop();
        st.push(Math.imul(a, b));
        break;
      } // i32.mul
      case 51: {
        const b = st.pop(),
          a = st.pop(); // i32.div_s
        if (b === 0) throw trap('integer divide by zero');
        if (a === -2147483648 && b === -1) throw trap('integer overflow');
        st.push((a / b) | 0);
        break;
      }
      case 52: {
        const b = st.pop() >>> 0,
          a = st.pop() >>> 0; // i32.div_u
        if (b === 0) throw trap('integer divide by zero');
        st.push(Math.floor(a / b) | 0);
        break;
      }
      case 53: {
        const b = st.pop(),
          a = st.pop(); // i32.rem_s
        if (b === 0) throw trap('integer divide by zero');
        st.push(b === -1 ? 0 : (a % b) | 0);
        break;
      }
      case 54: {
        const b = st.pop() >>> 0,
          a = st.pop() >>> 0; // i32.rem_u
        if (b === 0) throw trap('integer divide by zero');
        st.push((a % b) | 0);
        break;
      }
      case 55: {
        const b = st.pop(),
          a = st.pop();
        st.push(a & b);
        break;
      } // i32.and
      case 56: {
        const b = st.pop(),
          a = st.pop();
        st.push(a | b);
        break;
      } // i32.or
      case 57: {
        const b = st.pop(),
          a = st.pop();
        st.push(a ^ b);
        break;
      } // i32.xor
      case 58: {
        const b = st.pop(),
          a = st.pop();
        st.push(a << (b & 31));
        break;
      } // i32.shl
      case 59: {
        const b = st.pop(),
          a = st.pop();
        st.push(a >> (b & 31));
        break;
      } // i32.shr_s
      case 60: {
        const b = st.pop(),
          a = st.pop();
        st.push((a >>> (b & 31)) | 0);
        break;
      } // i32.shr_u
      // f32
      case 70: {
        const b = st.pop(),
          a = st.pop();
        st.push(Math.fround(a + b));
        break;
      } // f32.add
      case 71: {
        const b = st.pop(),
          a = st.pop();
        st.push(Math.fround(a - b));
        break;
      } // f32.sub
      case 72: {
        const b = st.pop(),
          a = st.pop();
        st.push(Math.fround(a * b));
        break;
      } // f32.mul
      case 73: {
        const b = st.pop(),
          a = st.pop();
        st.push(Math.fround(a / b));
        break;
      } // f32.div
      case 74:
        st.push(Math.fround(Math.sqrt(st.pop())));
        break; // f32.sqrt
      case 75:
        st.push(-st.pop());
        break; // f32.neg
      case 76: {
        const b = st.pop(),
          a = st.pop();
        st.push(a < b ? 1 : 0);
        break;
      } // f32.lt
      case 77: {
        const b = st.pop(),
          a = st.pop();
        st.push(a > b ? 1 : 0);
        break;
      } // f32.gt
      case 78: {
        const b = st.pop(),
          a = st.pop();
        st.push(a <= b ? 1 : 0);
        break;
      } // f32.le
      case 79: {
        const b = st.pop(),
          a = st.pop();
        st.push(a >= b ? 1 : 0);
        break;
      } // f32.ge
      case 80:
        st.push(Math.fround(st.pop()));
        break; // f32.convert_i32_s
      case 81:
        st.push(Math.fround(st.pop() >>> 0));
        break; // f32.convert_i32_u
      case 82:
        st.push(Math.fround(st.pop()));
        break; // f32.demote_f64
      case 83:
        break; // f64.promote_f32
      case 84: {
        SCRATCH.setFloat32(0, st.pop(), true);
        st.push(SCRATCH.getInt32(0, true));
        break;
      } // i32.reinterpret_f32
      case 85: {
        SCRATCH.setInt32(0, st.pop(), true);
        st.push(SCRATCH.getFloat32(0, true));
        break;
      } // f32.reinterpret_i32
      case 86: {
        const x = st.pop(); // i32.trunc_sat_f32_s
        st.push(
          Number.isNaN(x)
            ? 0
            : x >= 2147483647
              ? 2147483647
              : x <= -2147483648
                ? -2147483648
                : Math.trunc(x) | 0,
        );
        break;
      }
      default:
        throw Error(`Machine: instruction ${ins[0]} is not supported`);
    }
    s.tick++;
    return event;
  }

  // region: branch
  branch(frame, depth) {
    const st = this.state.stack;
    // A branch past every open block targets the function body itself: it returns.
    if (depth === frame.labels.length) {
      this.leave(frame);
      return;
    }
    const label = frame.labels[frame.labels.length - 1 - depth];
    const kept = label.arity ? st.slice(st.length - label.arity) : [];
    st.length = label.height;
    st.push(...kept);
    if (label.loop) {
      frame.labels.length -= depth; // keep the loop's own label
      frame.at = label.end + 1; // back to the first instruction inside the loop
    } else {
      frame.labels.length -= depth + 1;
      frame.at = label.end + 1; // just past the block's end
    }
  }
  // endregion: branch

  // region: return-frame
  leave(frame) {
    const s = this.state;
    const type = this.program.typeOf(frame.func);
    const results = type.results.length
      ? s.stack.slice(s.stack.length - type.results.length)
      : [];
    s.stack.length = frame.base;
    s.frames.pop();
    if (s.frames.length) s.stack.push(...results);
    else s.result = results[0];
  }
  // endregion: return-frame

  // region: memory
  view(base, offset, size) {
    const address = (base >>> 0) + offset;
    const memory = this.state.memory;
    if (address + size > memory.length)
      throw trap(`out of bounds memory access at ${address}`);
    return new DataView(memory.buffer, memory.byteOffset + address, size);
  }

  store(event, base, offset, size, write) {
    const view = this.view(base, offset, size);
    const address = view.byteOffset - this.state.memory.byteOffset;
    const before = Array.from(
      this.state.memory.subarray(address, address + size),
    );
    write(view);
    event.writes.push({
      address,
      size,
      before,
      after: Array.from(this.state.memory.subarray(address, address + size)),
    });
  }
  // endregion: memory
}

const SCRATCH = new DataView(new ArrayBuffer(8));
function trap(message) {
  const e = Error(`trap: ${message}`);
  e.trap = true;
  return e;
}
function zeroOf(type) {
  return type === 'i64' ? 0n : 0;
}
function coerce(type, v) {
  if (type === 'i32') return v | 0;
  if (type === 'f32') return Math.fround(v);
  if (type === 'i64') return BigInt.asIntN(64, BigInt(v));
  return +v;
}
const OPS = {
  block: 0,
  loop: 1,
  br: 2,
  br_if: 3,
  end: 4,
  return: 5,
  call: 6,
  'local.get': 7,
  'local.set': 8,
  'local.tee': 9,
  'global.get': 10,
  'global.set': 11,
  select: 12,
  'i32.const': 13,
  'i64.const': 14,
  'f32.const': 15,
  'i32.load': 20,
  'i32.load8_u': 21,
  'f32.load': 22,
  'i32.store': 30,
  'i32.store8': 31,
  'i32.store16': 32,
  'f32.store': 33,
  'i64.store': 34,
  'i32.eqz': 40,
  'i32.ne': 41,
  'i32.lt_s': 42,
  'i32.lt_u': 43,
  'i32.gt_s': 44,
  'i32.gt_u': 45,
  'i32.le_s': 46,
  'i32.ge_s': 47,
  'i32.add': 48,
  'i32.sub': 49,
  'i32.mul': 50,
  'i32.div_s': 51,
  'i32.div_u': 52,
  'i32.rem_s': 53,
  'i32.rem_u': 54,
  'i32.and': 55,
  'i32.or': 56,
  'i32.xor': 57,
  'i32.shl': 58,
  'i32.shr_s': 59,
  'i32.shr_u': 60,
  'f32.add': 70,
  'f32.sub': 71,
  'f32.mul': 72,
  'f32.div': 73,
  'f32.sqrt': 74,
  'f32.neg': 75,
  'f32.lt': 76,
  'f32.gt': 77,
  'f32.le': 78,
  'f32.ge': 79,
  'f32.convert_i32_s': 80,
  'f32.convert_i32_u': 81,
  'f32.demote_f64': 82,
  'f64.promote_f32': 83,
  'i32.reinterpret_f32': 84,
  'f32.reinterpret_i32': 85,
  'i32.trunc_sat_f32_s': 86,
};

function prepare(f) {
  const ops = f.code.map((ins) => {
    const n = OPS[ins[0]];
    if (n === undefined)
      throw Error(`Machine: instruction ${ins[0]} is not supported`);
    return n;
  });
  const ends = new Array(f.code.length).fill(-1);
  const open = [];
  f.code.forEach((ins, i) => {
    if (ins[0] === 'block' || ins[0] === 'loop') open.push(i);
    else if (ins[0] === 'end' && open.length) ends[open.pop()] = i;
  });
  return { code: f.code, ops, ends, locals: f.locals };
}
