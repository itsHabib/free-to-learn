// Unit 11 query: question a recording. API.md, "query.mjs", is the contract.
//
// buildIndex replays the recording once on your machine and keeps two things:
// every write, so that lastWriter can name the last write of a byte before any
// tick, and for every value the program makes, the producers it was made from,
// so that sources can follow a stored value back to where it came from. Both
// questions are answered from what was kept, without running the program again.
//
// It reads the machine's state.stack (the value stack) and state.result (what a
// finished call returned), which lesson 08's machine keeps.
import { Machine } from './machine.mjs';
import { recordedImports } from './recorder.mjs';

// How each of the 62 instructions moves values. Every instruction a program
// uses must be in exactly one of these.
const KIND = {
  block: 'block',
  loop: 'loop',
  br: 'br',
  br_if: 'br_if',
  end: 'end',
  return: 'return',
  call: 'call',
  'local.get': 'local.get',
  'local.set': 'local.set',
  'local.tee': 'local.tee',
  'global.get': 'global.get',
  'global.set': 'global.set',
  select: 'select',
  'i32.const': 'const',
  'i64.const': 'const',
  'f32.const': 'const',
  'i32.load': 'load',
  'f32.load': 'load',
  'i32.load8_u': 'load',
  'i32.store': 'store',
  'i32.store8': 'store',
  'i32.store16': 'store',
  'f32.store': 'store',
  'i64.store': 'store',
};
const LOAD_SIZE = { 'i32.load': 4, 'f32.load': 4, 'i32.load8_u': 1 };
for (const op of [
  'i32.eqz',
  'f32.sqrt',
  'f32.neg',
  'f32.convert_i32_s',
  'f32.convert_i32_u',
  'f32.demote_f64',
  'f64.promote_f32',
  'i32.reinterpret_f32',
  'f32.reinterpret_i32',
  'i32.trunc_sat_f32_s',
])
  KIND[op] = 'unary';
for (const op of [
  'i32.ne',
  'i32.lt_s',
  'i32.lt_u',
  'i32.gt_s',
  'i32.gt_u',
  'i32.le_s',
  'i32.ge_s',
  'i32.add',
  'i32.sub',
  'i32.mul',
  'i32.div_s',
  'i32.div_u',
  'i32.rem_s',
  'i32.rem_u',
  'i32.and',
  'i32.or',
  'i32.xor',
  'i32.shl',
  'i32.shr_s',
  'i32.shr_u',
  'f32.add',
  'f32.sub',
  'f32.mul',
  'f32.div',
  'f32.lt',
  'f32.gt',
  'f32.le',
  'f32.ge',
])
  KIND[op] = 'binary';

// A typed array that grows by doubling: push one number, and done() for a
// copy of exactly what was pushed.
class List {
  constructor(Type, size = 1 << 16) {
    this.a = new Type(size);
    this.n = 0;
  }
  push(x) {
    if (this.n === this.a.length) {
      const bigger = new this.a.constructor(this.a.length * 2);
      bigger.set(this.a);
      this.a = bigger;
    }
    this.a[this.n++] = x;
  }
  done() {
    return this.a.slice(0, this.n);
  }
}

export function buildIndex(program, recording) {
  if (recording?.format !== 'ttd2-recording-1')
    throw Error('buildIndex: not a recording (format ttd2-recording-1)');
  if (program.sha256 && recording.sha256 && program.sha256 !== recording.sha256)
    throw Error(
      `buildIndex: the recording was made with another program (${recording.program})`,
    );
  const calls = recording.calls;

  // One machine, its imports answered from the recording as in lesson 09.
  let m;
  const answered = recordedImports(program, recording, () => m);
  m = new Machine(program, answered.imports);
  const s = m.state;
  const memorySize = s.memory.length;
  const nImports = program.imports.length;

  // Each defined function's instructions, sorted by how they move values.
  const prepared = new Map();
  for (const f of program.functions) {
    const kinds = f.code.map((ins) => {
      if (!KIND[ins[0]])
        throw Error(`buildIndex: instruction ${ins[0]} is not one of the 62`);
      return KIND[ins[0]];
    });
    prepared.set(f.index, {
      code: f.code,
      kinds,
      locals: f.locals.length,
      results: program.typeOf(f.index).results.length,
    });
  }

  // region: keep-writes
  // Every write, one entry in each list, in tick order.
  const wTick = new List(Int32Array);
  const wFunc = new List(Int32Array);
  const wAt = new List(Int32Array);
  const wAddress = new List(Int32Array);
  const wSize = new List(Int32Array);
  // Per byte: the tick of the store that last wrote it so far, 0 if none.
  const writer = new Int32Array(memorySize);
  const keepWrites = (event, t) => {
    for (const w of event.writes) {
      wTick.push(t);
      wFunc.push(event.func);
      wAt.push(event.at);
      wAddress.push(w.address);
      wSize.push(w.size);
      writer.fill(t, w.address, w.address + w.size);
    }
  };
  // endregion: keep-writes

  // region: leaves
  // A producer is one whole number: 0 is nothing (a constant), t > 0 is the
  // instruction at tick t, and the leaves are negative: the answers first, then
  // every argument of every call, then the initial bytes by address.
  const nAnswers = recording.answers.length;
  const argBase = [];
  let nArgs = 0;
  for (const c of calls) {
    argBase.push(nArgs);
    nArgs += c.args.length;
  }
  const argCall = new Int32Array(nArgs);
  const argPos = new Int32Array(nArgs);
  calls.forEach((c, k) =>
    c.args.forEach((_, i) => {
      argCall[argBase[k] + i] = k;
      argPos[argBase[k] + i] = i;
    }),
  );
  const answerId = (a) => -1 - a;
  const argId = (k, i) => -1 - nAnswers - argBase[k] - i;
  const initialId = (address) => -1 - nAnswers - nArgs - address;
  // endregion: leaves

  // region: producers
  // Per tick: where its inputs start in deps, and whether it was a store.
  const depStart = new List(Int32Array);
  const deps = new List(Int32Array);
  const isStore = new List(Uint8Array);
  depStart.push(0); // tick 0 is no instruction
  isStore.push(0);

  // The producers of what the machine holds right now: one per stack value,
  // one per global, and the frames with one per local.
  let P = new Int32Array(1024);
  let sp = 0;
  const G = new Int32Array(program.globals.length);
  const frames = []; // { func, locals, base, labels: [{ height, arity, loop }] }
  const push = (id) => {
    if (sp === P.length) {
      const bigger = new Int32Array(P.length * 2);
      bigger.set(P);
      P = bigger;
    }
    P[sp++] = id;
  };

  // A computed value. With no operand producer it is nothing; with one, it
  // carries that operand's chain, so it takes its producer; with more, it is
  // tick t, whose inputs are the operands' producers.
  const scratch = new Int32Array(8);
  let nScratch = 0;
  const add = (id) => {
    if (id === 0) return;
    for (let i = 0; i < nScratch; i++) if (scratch[i] === id) return;
    scratch[nScratch++] = id;
  };
  const made = (t) => {
    if (nScratch === 0) return 0;
    if (nScratch === 1) return scratch[0];
    for (let i = 0; i < nScratch; i++) deps.push(scratch[i]);
    return t;
  };
  // endregion: producers

  // region: frames
  // A branch keeps its target's results and cuts the producers back with the
  // stack; a loop's label stays, because the loop can be branched to again.
  const branch = (frame, depth) => {
    const label = frame.labels[frame.labels.length - 1 - depth];
    for (let i = 0; i < label.arity; i++)
      P[label.height + i] = P[sp - label.arity + i];
    sp = label.height + label.arity;
    frame.labels.length -= label.loop ? depth : depth + 1;
  };
  // A return hands the results' producers back to the caller; the outermost
  // call's result leaves the machine.
  const leave = () => {
    const frame = frames.pop();
    const n = prepared.get(frame.func).results;
    for (let i = 0; i < n; i++) P[frame.base + i] = P[sp - n + i];
    sp = frame.base + (frames.length ? n : 0);
  };
  // A call's arguments become the new frame's first locals; the other locals
  // start as nothing.
  const enter = (func, args) => {
    const locals = new Int32Array(args.length + prepared.get(func).locals);
    locals.set(args);
    frames.push({ func, locals, base: sp, labels: [] });
  };
  // endregion: frames

  // region: follow
  // Move the producers as the instruction at tick t is about to move values.
  // stack is the machine's value stack before the instruction runs.
  const follow = (kind, ins, frame, t, stack) => {
    switch (kind) {
      case 'block':
        frame.labels.push({ height: sp, arity: ins[1] ? 1 : 0, loop: false });
        break;
      case 'loop':
        frame.labels.push({ height: sp, arity: 0, loop: true });
        break;
      case 'br':
        branch(frame, ins[1]);
        break;
      case 'br_if':
        sp--; // the condition is a decision: on no chain
        if (stack[stack.length - 1] !== 0) branch(frame, ins[1]);
        break;
      case 'end':
        if (frame.labels.length) frame.labels.pop();
        else leave();
        break;
      case 'return':
        leave();
        break;
      case 'call': {
        const n = program.typeOf(ins[1]).params.length;
        if (ins[1] < nImports) {
          sp -= n; // an import's arguments are not followed
          if (program.typeOf(ins[1]).results.length)
            push(answerId(answered.position()));
        } else {
          const args = P.slice(sp - n, sp);
          sp -= n;
          enter(ins[1], args);
        }
        break;
      }
      case 'local.get':
        push(frame.locals[ins[1]]);
        break;
      case 'local.set':
        frame.locals[ins[1]] = P[--sp];
        break;
      case 'local.tee':
        frame.locals[ins[1]] = P[sp - 1];
        break;
      case 'global.get':
        push(G[ins[1]]);
        break;
      case 'global.set':
        G[ins[1]] = P[--sp];
        break;
      case 'const':
        push(0);
        break;
      case 'unary':
        break; // the same operand, so the same chain
      case 'binary':
        nScratch = 0;
        add(P[sp - 2]);
        add(P[sp - 1]);
        sp -= 1;
        P[sp - 1] = made(t);
        break;
      case 'select':
        nScratch = 0;
        add(P[sp - 3]);
        add(P[sp - 2]);
        add(P[sp - 1]);
        sp -= 2;
        P[sp - 1] = made(t);
        break;
      case 'load':
        load(ins, t, stack);
        break;
      case 'store':
        store();
        break;
    }
  };
  // endregion: follow

  // region: memory
  // A load depends on the bytes it read, each on the store that last wrote
  // it, or on the byte itself if no store has. Its address is not followed.
  const load = (ins, t, stack) => {
    const address = (stack[stack.length - 1] >>> 0) + ins[2];
    nScratch = 0;
    for (let i = 0; i < LOAD_SIZE[ins[0]]; i++) {
      if (address + i >= memorySize) break;
      const w = writer[address + i];
      add(w !== 0 ? w : initialId(address + i));
    }
    P[sp - 1] = made(t);
  };
  // A store's only input is its value's producer; its address is not
  // followed. keepWrites then makes this tick the writer of every byte.
  const store = () => {
    const value = P[--sp];
    sp--;
    if (value !== 0) deps.push(value);
  };
  // endregion: memory

  // region: replay
  for (let k = 0; k < calls.length; k++) {
    m.begin(calls[k].name, calls[k].args);
    enter(
      program.exportIndex(calls[k].name),
      calls[k].args.map((_, i) => argId(k, i)),
    );
    while (m.running) {
      const top = s.frames[s.frames.length - 1];
      const frame = frames[frames.length - 1];
      const fn = prepared.get(top.func);
      const ins = fn.code[top.at];
      const kind = fn.kinds[top.at];
      const t = s.tick + 1;
      depStart.push(deps.n);
      isStore.push(kind === 'store' ? 1 : 0);
      follow(kind, ins, frame, t, s.stack);
      const asked = answered.position();
      const event = m.step();
      keepWrites(event, t);
      // The producers must still match the machine: its stack, its frames and
      // the answers it has used.
      const used = kind === 'call' && ins[1] < nImports ? 1 : 0;
      if (
        frame.func !== top.func ||
        sp !== s.stack.length ||
        frames.length !== s.frames.length ||
        answered.position() !== asked + used ||
        (event.writes.length !== 0) !== (kind === 'store')
      )
        throw Error(
          `buildIndex: lost track of the machine at tick ${t} (${ins[0]} at (${event.func}, ${event.at}))`,
        );
    }
    const result = s.result === undefined ? null : s.result;
    if (!Object.is(result, recording.results[k]))
      throw Error(
        `buildIndex: call ${k} returned ${result}, the recording says ${recording.results[k]}`,
      );
  }
  depStart.push(deps.n);
  // endregion: replay

  return makeIndex({
    end: s.tick,
    memorySize,
    leaves: { nAnswers, nArgs, argCall, argPos },
    depStart: depStart.done(),
    deps: deps.done(),
    isStore: isStore.done(),
    writes: {
      tick: wTick.done(),
      func: wFunc.done(),
      at: wAt.done(),
      address: wAddress.done(),
      size: wSize.done(),
    },
  });
}

function makeIndex({
  end,
  memorySize,
  leaves,
  depStart,
  deps,
  isStore,
  writes,
}) {
  // region: by-byte
  // Per byte, the writes that touched it in tick order:
  // byteWrites[byteStart[a]] up to byteWrites[byteStart[a + 1]].
  const byteStart = new Int32Array(memorySize + 1);
  for (let w = 0; w < writes.tick.length; w++)
    for (let i = 0; i < writes.size[w]; i++)
      byteStart[writes.address[w] + i + 1]++;
  for (let a = 0; a < memorySize; a++) byteStart[a + 1] += byteStart[a];
  const byteWrites = new Int32Array(byteStart[memorySize]);
  const next = byteStart.slice(0, memorySize);
  for (let w = 0; w < writes.tick.length; w++)
    for (let i = 0; i < writes.size[w]; i++)
      byteWrites[next[writes.address[w] + i]++] = w;
  // endregion: by-byte

  // region: last-writer
  const lastWriter = (address, beforeTick) => {
    if (!Number.isInteger(address) || address < 0 || address >= memorySize)
      throw Error(
        `lastWriter: ${address} is not an address in memory (0 to ${memorySize - 1})`,
      );
    if (typeof beforeTick !== 'number' || Number.isNaN(beforeTick))
      throw Error(`lastWriter: beforeTick must be a number, got ${beforeTick}`);
    // Binary search for the first write at or after beforeTick.
    let lo = byteStart[address];
    let hi = byteStart[address + 1];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (writes.tick[byteWrites[mid]] < beforeTick) lo = mid + 1;
      else hi = mid;
    }
    if (lo === byteStart[address]) return null;
    const w = byteWrites[lo - 1];
    return {
      tick: writes.tick[w],
      func: writes.func[w],
      at: writes.at[w],
      address: writes.address[w],
      size: writes.size[w],
    };
  };
  // endregion: last-writer

  // region: sources
  // seenTick[t] === epoch: tick t was visited during the current question.
  const { nAnswers, nArgs, argCall, argPos } = leaves;
  const seenTick = new Int32Array(end + 1);
  const seenLeaf = new Int32Array(nAnswers + nArgs + memorySize);
  let epoch = 0;
  const sources = (tick) => {
    if (!Number.isInteger(tick) || tick < 1 || tick > end || !isStore[tick])
      throw Error(
        `sources: tick ${tick} is not the tick of a store instruction`,
      );
    epoch++;
    const stores = [];
    const answers = [];
    const args = [];
    const initial = [];
    const todo = [];
    for (let i = depStart[tick]; i < depStart[tick + 1]; i++)
      todo.push(deps[i]);
    while (todo.length) {
      const id = todo.pop();
      if (id > 0) {
        if (seenTick[id] === epoch) continue;
        seenTick[id] = epoch;
        if (isStore[id]) stores.push(id);
        for (let i = depStart[id]; i < depStart[id + 1]; i++)
          todo.push(deps[i]);
        continue;
      }
      const leaf = -1 - id;
      if (seenLeaf[leaf] === epoch) continue;
      seenLeaf[leaf] = epoch;
      if (leaf < nAnswers) answers.push(leaf);
      else if (leaf < nAnswers + nArgs) args.push(leaf - nAnswers);
      else initial.push(leaf - nAnswers - nArgs);
    }
    const up = (a, b) => a - b;
    return {
      stores: stores.sort(up),
      answers: answers.sort(up),
      args: args.sort(up).map((x) => [argCall[x], argPos[x]]),
      initial: initial.sort(up),
    };
  };
  // endregion: sources

  return { end, lastWriter, sources };
}
