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
  throw Error('keep-writes: not written yet (lesson 11)');
  // endregion: keep-writes

  // region: leaves
  throw Error('leaves: not written yet (lesson 11)');
  // endregion: leaves

  // region: producers
  throw Error('producers: not written yet (lesson 11)');
  // endregion: producers

  // region: frames
  throw Error('frames: not written yet (lesson 11)');
  // endregion: frames

  // region: follow
  throw Error('follow: not written yet (lesson 11)');
  // endregion: follow

  // region: memory
  throw Error('memory: not written yet (lesson 11)');
  // endregion: memory

  // region: replay
  throw Error('replay: not written yet (lesson 11)');
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
  throw Error('by-byte: not written yet (lesson 11)');
  // endregion: by-byte

  // region: last-writer
  throw Error('last-writer: not written yet (lesson 11)');
  // endregion: last-writer

  // region: sources
  throw Error('sources: not written yet (lesson 11)');
  // endregion: sources

  return { end, lastWriter, sources };
}
