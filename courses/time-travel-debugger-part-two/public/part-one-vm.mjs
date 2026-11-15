// Supplied by the course: part one's vm.mjs interface on top of YOUR part-two
// machine. `node lab.mjs wall` copies this file next to a part-one debugger as
// vm.mjs, so that debugger runs unchanged on a real game.
//
// Part one's debugger only ever does three things with a state: it copies it
// (clone), hands it to execute(program, state), which returns a new state, and
// tests it with matches(state, condition). Here a state is
//   { pc, tick, halted, call, machine }
// where machine is your Machine's whole state object. execute() copies the
// whole state with structuredClone and runs one instruction on the copy: that
// copy, 131,072 bytes of memory and all, is what lab.mjs wall measures.
//
// The program part one's Debugger is constructed with is a session object the
// lab builds: { Machine, program, imports, calls, length }. Machine is your class,
// program a loaded listing, calls the list of calls to run one after another.
let current = null;

export const clone = (value) => structuredClone(value);

export function validateProgram(session) {
  if (!session || typeof session.Machine !== 'function' || !Array.isArray(session.calls) || !session.calls.length) {
    throw Error('VM adapter: build the session with lab.mjs wall');
  }
  current = { session, machine: new session.Machine(session.program, session.imports) };
  return session;
}

export function initial() {
  if (!current) throw Error('VM adapter: validateProgram must run before initial');
  const m = new current.session.Machine(current.session.program, current.session.imports);
  return { pc: 0, tick: 0, halted: false, call: 0, machine: m.state };
}

const asNumber = (bytes) => bytes.reduce((n, b, i) => n + b * 2 ** (8 * i), 0);

export function execute(session, state) {
  if (state.halted) throw Error('VM: halted; no instruction executed.');
  const next = structuredClone(state);
  const m = current.machine;
  m.state = next.machine;
  if (!m.running) {
    const c = session.calls[next.call];
    m.begin(c.name, c.args);
  }
  const e = m.step();
  if (!m.running) next.call++;
  next.tick++;
  next.halted = next.call >= session.calls.length;
  const top = m.state.frames[m.state.frames.length - 1];
  next.pc = top ? top.at : 0;
  const event = {
    tick: next.tick, pc: state.pc, op: e.op, emitted: [],
    writes: e.writes.map((w) => ({ address: w.address, before: asNumber(w.before), after: asNumber(w.after) })),
  };
  return { state: next, event };
}

// Part one's conditions. { kind: 'mem', address, equals } reads one byte of the
// game's memory; part one's registers do not exist here.
export function matches(state, condition) {
  if (!condition || condition.kind !== 'mem' || !Number.isInteger(condition.address) || !Number.isSafeInteger(condition.equals)) {
    throw Error('Condition: on the game use {kind:"mem",address:A,equals:V}, where A is a byte address.');
  }
  const memory = state.machine.memory;
  if (condition.address < 0 || condition.address >= memory.length) throw Error(`Condition: address must be 0-${memory.length - 1}.`);
  return memory[condition.address] === condition.equals;
}
