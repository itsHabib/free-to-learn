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
  constructor(
    program,
    recording,
    { every = 1000, pageSize = 4096, check = true } = {},
  ) {
    whole(every, 'every', 1);
    whole(pageSize, 'pageSize', 1);
    this.program = program;
    this.recording = recording;
    this.every = every;
    this.pageSize = pageSize;
    // The function each call starts in: what runs next between calls.
    this.callFunc = recording.calls.map(
      (call) =>
        program.exports.find((e) => e.kind === 'func' && e.name === call.name)
          .index,
    );
    // One machine for the whole session. Its imports ask this.answers, which
    // restore() replaces, so a replay answers from the right place.
    const imports = {};
    for (const { name } of program.imports)
      imports[name] = (...args) => this.answers.imports[name](...args);
    this.machine = new Machine(program, imports);
    this.answers = recordedImports(program, recording, () => this.machine);
    this.snapshots = [];
    this.end = this.firstPass(check);
    this.restore(this.snapshots[0]);
  }

  get tick() {
    return this.machine.state.tick;
  }
  // endregion: constructor

  // region: first-pass
  firstPass(check) {
    const m = this.machine;
    const written = new Uint8Array(
      Math.ceil(m.state.memory.length / this.pageSize),
    );
    this.snapshots.push(this.capture());
    for (let k = 0; k < this.recording.calls.length; k++) {
      do {
        const event = this.forward();
        for (const w of event.writes) {
          const first = Math.floor(w.address / this.pageSize);
          const last = Math.floor((w.address + w.size - 1) / this.pageSize);
          for (let p = first; p <= last; p++) written[p] = 1;
        }
        if (m.state.tick % this.every === 0) {
          this.snapshots.push(this.capture(this.snapshots.at(-1), written));
          written.fill(0);
        }
      } while (m.running);
      if (check) this.checkCall(k);
    }
    return m.state.tick;
  }
  // endregion: first-pass

  // region: capture
  capture(previous = null, written = null) {
    const { memory, ...rest } = this.machine.state;
    const pages = [];
    for (let p = 0; p * this.pageSize < memory.length; p++) {
      const start = p * this.pageSize;
      pages.push(
        previous && !written[p]
          ? previous.pages[p]
          : memory.slice(start, start + this.pageSize),
      );
    }
    return {
      tick: rest.tick,
      pages,
      state: globalThis.structuredClone(rest),
      answered: this.answers.position(),
    };
  }
  // endregion: capture

  // region: restore
  restore(snapshot) {
    const bytes = snapshot.pages.reduce((n, page) => n + page.length, 0);
    const memory = new Uint8Array(bytes);
    snapshot.pages.forEach((page, p) => memory.set(page, p * this.pageSize));
    this.machine.state = {
      ...globalThis.structuredClone(snapshot.state),
      memory,
    };
    this.answers = recordedImports(
      this.program,
      this.recording,
      () => this.machine,
      snapshot.answered,
    );
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
    const m = this.machine;
    if (!m.running) {
      const call = this.recording.calls[m.state.calls];
      m.begin(call.name, call.args);
    }
    return m.step();
  }

  moveTo(t) {
    const snapshot = this.snapshots[Math.floor(t / this.every)];
    if (this.tick > t || this.tick < snapshot.tick) this.restore(snapshot);
    while (this.tick < t) this.forward();
  }

  seek(tick) {
    if (!Number.isInteger(tick) || tick < 0 || tick > this.end)
      throw RangeError(`seek: ${tick} is not a position from 0 to ${this.end}`);
    this.moveTo(tick);
    return this.tick;
  }

  step(n = 1) {
    this.moveTo(Math.min(this.end, this.tick + whole(n, 'step')));
    return this.tick;
  }

  stepBack(n = 1) {
    this.moveTo(Math.max(0, this.tick - whole(n, 'stepBack')));
    return this.tick;
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
  stopHere({ breakpoints = [], watches = [], functions = [] }, event) {
    if (event && event.writes.some((w) => changesWatched(w, watches)))
      return 'watchpoint';
    const next = this.nextInstruction();
    if (
      next &&
      breakpoints.some((b) => b.func === next.func && b.at === next.at)
    )
      return 'breakpoint';
    // A function's instruction 0 runs next only where a call to it begins.
    if (next && next.at === 0 && functions.includes(next.func))
      return 'function';
    return null;
  }

  continue(stops = {}) {
    while (this.tick < this.end) {
      const event = this.forward();
      const reason = this.stopHere(stops, event);
      if (reason) return { reason, tick: this.tick };
    }
    return { reason: 'end', tick: this.tick };
  }
  // endregion: stops

  // region: search-back
  continueBack(stops = {}) {
    const here = this.tick;
    if (here === 0) return { reason: 'start', tick: 0 };
    const pages = (stops.watches ?? []).flatMap((w) =>
      pagesOf(w.address, w.size ?? 1, this.pageSize),
    );
    const watchesOnly = !stops.breakpoints?.length && !stops.functions?.length;
    const found = this.searchBack(
      here - 1,
      (event) => {
        const reason = this.stopHere(stops, event);
        return reason ? { reason, tick: this.tick } : null;
      },
      (i) => !watchesOnly || this.mayHaveWritten(i, pages),
    );
    if (found) {
      this.moveTo(found.tick);
      return found;
    }
    this.moveTo(0);
    return { reason: this.stopHere(stops, null) ?? 'start', tick: 0 };
  }

  searchBack(last, test, mayMatch = () => true) {
    for (let i = Math.ceil(last / this.every) - 1; i >= 0; i--) {
      if (!mayMatch(i)) continue;
      const snapshot = this.snapshots[i];
      const stop = Math.min(last, snapshot.tick + this.every);
      this.restore(snapshot);
      let found = null;
      while (this.tick < stop) {
        const finding = test(this.forward());
        if (finding) found = finding;
      }
      if (found) return found;
    }
    return null;
  }

  mayHaveWritten(i, pages) {
    const a = this.snapshots[i];
    const b = this.snapshots[i + 1];
    return !b || pages.some((p) => a.pages[p] !== b.pages[p]);
  }
  // endregion: search-back

  // region: last-write
  lastWrite(address) {
    const size = this.machine.state.memory.length;
    if (!Number.isInteger(address) || address < 0 || address >= size)
      throw RangeError(`lastWrite: ${address} is not an address inside memory`);
    const back = this.capture();
    const page = Math.floor(address / this.pageSize);
    const found = this.searchBack(
      back.tick,
      (event) => {
        const w = event.writes.findLast(
          (w) => address >= w.address && address < w.address + w.size,
        );
        if (!w) return null;
        const { tick, func, at } = event;
        return { tick, func, at, address: w.address, size: w.size };
      },
      (i) => this.mayHaveWritten(i, [page]),
    );
    this.restore(back);
    return found;
  }
  // endregion: last-write

  // region: stack
  stack() {
    return this.machine.state.frames.map((f) => ({ func: f.func, at: f.at }));
  }
  // endregion: stack

  // region: step-out
  // Forward to the first position with fewer frames than now. Between calls no
  // function is running, so stepOut runs the whole next call and stops where it
  // has returned, at the next position between calls. At the end it stays.
  stepOut() {
    const depth = this.machine.state.frames.length;
    if (depth === 0) {
      if (this.tick < this.end) {
        do {
          this.forward();
        } while (this.machine.running);
      }
    } else {
      while (this.machine.state.frames.length >= depth) this.forward();
    }
    return this.tick;
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
