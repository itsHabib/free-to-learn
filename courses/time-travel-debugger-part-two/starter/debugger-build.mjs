// Unit 10 debugger: run backwards over one recording. API.md, "debugger.mjs", is
// the contract. Lesson 12 adds stack(), stepOut() and function stops to this file.
//
// Position t is the state after t instructions of the whole run, counted across
// calls. Between two calls no function is running, and the next instruction is
// the first one of the next call. The constructor replays the recording once and
// keeps a snapshot every `every` instructions; a page of memory that no
// instruction wrote since the previous snapshot is that snapshot's page object.
//
// Options: { every = 1000, pageSize = 4096, check = true }. With check, the first
// pass compares memory after every call with the recording's hash.
import { createHash } from 'node:crypto';
import { Machine } from './machine.mjs';
import { recordedImports, ReplayDivergence } from './recorder.mjs';

export class Debugger {
  // region: constructor
  constructor() {
    throw Error('constructor: not written yet (lesson 10)');
  }
  // endregion: constructor

  // region: first-pass
  firstPass() {
    throw Error('first-pass: not written yet (lesson 10)');
  }
  // endregion: first-pass

  // region: capture
  capture() {
    throw Error('capture: not written yet (lesson 10)');
  }
  // endregion: capture

  // region: restore
  restore() {
    throw Error('restore: not written yet (lesson 10)');
  }
  // endregion: restore

  // rr's checksum mode: after each call, memory must be what the recording says.
  checkCall(k) {
    const want = this.recording.hashes?.[k];
    const { memory, tick } = this.machine.state;
    const hash = createHash('sha256').update(memory).digest('hex');
    if (want !== undefined && hash !== want)
      throw new ReplayDivergence({
        tick,
        call: k,
        reason: `memory after call ${k} differs from the recording`,
      });
  }

  // region: move
  forward() {
    throw Error('move: not written yet (lesson 10)');
  }

  moveTo() {
    throw Error('move: not written yet (lesson 10)');
  }

  seek() {
    throw Error('move: not written yet (lesson 10)');
  }

  step() {
    throw Error('move: not written yet (lesson 10)');
  }

  stepBack() {
    throw Error('move: not written yet (lesson 10)');
  }
  // endregion: move

  read(address, size) {
    const memory = this.machine.state.memory;
    if (
      !Number.isInteger(address) ||
      !Number.isInteger(size) ||
      address < 0 ||
      size < 0 ||
      address + size > memory.length
    )
      throw RangeError(
        `read: ${size} bytes at ${address} are not inside memory`,
      );
    return memory.slice(address, address + size);
  }

  // The instruction that runs next: the innermost frame's or, between calls, the
  // first instruction of the next call's function. null at end.
  nextInstruction() {
    const { frames, calls } = this.machine.state;
    const top = frames.at(-1);
    if (top) return { func: top.func, at: top.at };
    if (calls < this.callFunc.length)
      return { func: this.callFunc[calls], at: 0 };
    return null;
  }

  where() {
    const { frames, calls } = this.machine.state;
    const next = this.nextInstruction();
    return {
      tick: this.tick,
      call: frames.length ? calls - 1 : calls,
      func: next ? next.func : null,
      at: next ? next.at : null,
    };
  }

  state() {
    return globalThis.structuredClone(this.machine.state);
  }

  // region: stops
  stopHere() {
    throw Error('stops: not written yet (lesson 10)');
  }

  continue() {
    throw Error('stops: not written yet (lesson 10)');
  }
  // endregion: stops

  // region: search-back
  continueBack() {
    throw Error('search-back: not written yet (lesson 10)');
  }

  searchBack() {
    throw Error('search-back: not written yet (lesson 10)');
  }

  mayHaveWritten() {
    throw Error('search-back: not written yet (lesson 10)');
  }
  // endregion: search-back

  // region: last-write
  lastWrite() {
    throw Error('last-write: not written yet (lesson 10)');
  }
  // endregion: last-write

  // region: stack
  stack() {
    throw Error('stack: not written yet (lesson 12)');
  }
  // endregion: stack

  // region: step-out
  stepOut() {
    throw Error('stepOut: not written yet (lesson 12)');
  }
  // endregion: step-out
}

// Whether a write changed a byte inside one of the watched ranges. A byte the
// store rewrote with the same value does not count. A watch without a size
// watches one byte.
function changesWatched(write, watches) {
  for (let i = 0; i < write.size; i++) {
    const byte = write.address + i;
    if (
      write.before[i] !== write.after[i] &&
      watches.some((w) => byte >= w.address && byte < w.address + (w.size ?? 1))
    )
      return true;
  }
  return false;
}

// The pages that hold the bytes [address, address + size).
function pagesOf(address, size, pageSize) {
  const pages = [];
  const last = Math.floor((address + size - 1) / pageSize);
  for (let p = Math.floor(address / pageSize); p <= last; p++) pages.push(p);
  return pages;
}

function whole(n, what, least = 0) {
  if (!Number.isInteger(n) || n < least)
    throw RangeError(
      `${what}: ${n} is not a whole number of at least ${least}`,
    );
  return n;
}
