// Unit 08: a machine worth debugging. The answer key is Node's own WebAssembly
// engine: it runs the games beside your machine here, and it ran the small
// programs in fixtures/08/programs.json when the course was built (their results,
// traps, import calls and memory are Node's). Instruction counts and the order
// instructions run in, which Node cannot show, follow the rules in lesson 08.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, show, program as readProgram, wasmBytes, courseRoot, NOT_WRITTEN, CheckFailure, firstDifference, same, countSteps } from './harness.mjs';
import { loadProgram } from '../public/program.mjs';
import { makeWorld } from '../public/world.mjs';
import { session, plan } from '../public/sessions.mjs';
import { hashMemory } from '../public/hash.mjs';

export const title = 'A machine worth debugging';

// ---------------------------------------------------------------- shared with tools/make-fixtures.mjs

// The imports the small programs call. Each one notes its calls in `log`.
export function syntheticImports(log) {
  return {
    add3: (a, b, c) => { log.push(['add3', [a, b, c]]); return (a * 100 + b * 10 + c) | 0; },
    third: (x) => { log.push(['third', [x]]); return x / 3; },            // returns f32: the machine rounds the answer
    scale: (x) => { log.push(['scale', [x]]); return x * 1.0000001; },    // f64 in, f64 out
    tap: (x) => { log.push(['tap', [x]]); },                               // returns nothing
  };
}
// Numbers JSON cannot hold travel as strings.
export const enc = (x) => Object.is(x, -0) ? '-0' : Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : x;
export const dec = (x) => x === '-0' ? -0 : x === 'NaN' ? NaN : x === 'Infinity' ? Infinity : x === '-Infinity' ? -Infinity : x;

// ---------------------------------------------------------------- helpers

const cache = new Map();
function fixture(name) {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(join(courseRoot, 'checks', 'fixtures', '08', `${name}.json`), 'utf8')));
  return cache.get(name);
}

export const WIDTH = { 'i32.store8': 1, 'i32.store16': 2, 'i32.store': 4, 'f32.store': 4, 'i64.store': 8 };
const fromHex = (h) => Array.from(Buffer.from(h, 'hex'));
const bytesOf = (v) => (ArrayBuffer.isView(v) || Array.isArray(v)) ? Array.from(v) : v;
const plural = (n, word) => `${Number(n).toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

function whereInWork(error, workDir) {
  for (const line of String(error?.stack ?? '').split('\n')) {
    const i = workDir ? line.indexOf(workDir) : -1;
    if (i >= 0) {
      const m = line.slice(i + workDir.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return ` (${m[1]} line ${m[2]})`;
    }
  }
  return '';
}

// Run learner code; an unexpected error becomes a failure that says where it happened.
// "not written yet" and check failures pass through unchanged.
function attempt(run, { checked, input, expected, workDir }) {
  try { return run(); } catch (error) {
    if (error instanceof CheckFailure || String(error?.message ?? '').includes(NOT_WRITTEN)) throw error;
    fail({ checked, input, observed: `your code threw ${error?.name ?? 'an error'}: ${String(error?.message ?? error).split('\n')[0]}${whereInWork(error, workDir)}`, expected });
  }
}

function newMachine(Machine, program, imports, context) {
  return attempt(() => new Machine(program, imports), { checked: `new Machine(program, imports) for ${program.name}`, expected: 'a machine', ...context });
}

const asView = (m) => ArrayBuffer.isView(m) ? Buffer.from(m.buffer, m.byteOffset, m.byteLength) : Buffer.from(m);
// The first address where two memories differ, with the bytes around it, or null.
function memoryDifference(ours, theirs) {
  if (!ArrayBuffer.isView(ours) && !Array.isArray(ours)) return { address: null, text: `state.memory is ${show(ours, 60)}, not a Uint8Array` };
  const a = asView(ours), b = asView(theirs);
  if (a.length === b.length && Buffer.compare(a, b) === 0) return null;
  if (a.length !== b.length) return { address: null, text: `yours has ${plural(a.length, 'byte')}, Node's engine ${plural(b.length, 'byte')}` };
  let k = 0;
  while (a[k] === b[k]) k++;
  const from = Math.max(0, k - 2), to = Math.min(a.length, k + 6);
  return { address: k, ours: Array.from(a.subarray(from, to)), theirs: Array.from(b.subarray(from, to)), from };
}
const memoryText = (d, who = "Node's engine") => d.address === null ? d.text : `first difference at address ${d.address}: bytes ${d.from} to ${d.from + d.ours.length - 1} are ${show(d.ours)} on yours and ${show(d.theirs)} on ${who}`;

const pick = (e) => ({ tick: e?.tick, func: e?.func, at: e?.at, op: e?.op, writes: Array.isArray(e?.writes) ? e.writes.map(w => ({ address: w?.address, size: w?.size, before: bytesOf(w?.before), after: bytesOf(w?.after) })) : e?.writes });
const opAt = (program, func, at) => program.func(func)?.code?.[at]?.[0];
const insText = (program, func, at) => { const ins = program.func(func)?.code?.[at]; return ins ? `(${func}, ${at}) ${ins.filter(x => x !== null).join(' ')}` : `(${func}, ${at})`; };
const body = (program, name) => program.func(program.exportIndex(name)).code.map(ins => ins.filter(x => x !== null).join(' ')).join(' · ');

// How control moves, for messages about the order instructions run in.
const RULES = 'A branch to a block goes to just after its end (that end does not run); a branch to a loop goes to just after the loop instruction (the loop instruction does not run again); a call goes to instruction 0 of the function it calls; return, and a function\'s last end, go back to just after the call.';

function hintAfter(program, func, at) {
  const op = opAt(program, func, at);
  if (op === 'br' || op === 'br_if') return 'The instruction before it was a branch. ' + RULES;
  if (op === 'call') return 'The instruction before it was a call. A call to a defined function goes to its instruction 0; a call to an import runs no instruction of the program and goes on just after the call.';
  if (op === 'return' || op === 'end') return 'The instruction before it ended a block or returned. ' + RULES;
  return RULES;
}

// ---------------------------------------------------------------- the small programs

// Run every call of one topic's programs on your machine; compare with what Node did.
async function runPrograms(topic, { cls, workDir }) {
  const Machine = await cls('machine.mjs', 'Machine');
  // Note every event, as lessons 09 to 13 count instructions: by wrapping Machine.prototype.step.
  const proto = Machine.prototype, original = proto.step;
  if (typeof original !== 'function') fail({ checked: 'step() is a method of your Machine class', observed: 'Machine.prototype.step is not a function', expected: 'class Machine { step() { ... } }: lessons 09 to 13 count instructions by counting calls to Machine.prototype.step' });
  let events = [];
  proto.step = function (...a) { const e = original.apply(this, a); events.push(e); return e; };
  for (const entry of fixture('programs').programs.filter(p => p.topic === topic)) {
    const program = loadProgram(entry.listing);
    for (const run of entry.runs) {
      let m = null, log = [], before = [];
      for (const call of run.calls) {
        const args = call.args.map(dec);
        const label = `${call.name}(${args.map(x => show(x)).join(', ')})`;
        const input = `${label} in the ${program.name} program${before.length ? `, after ${before.join(', ')} on the same machine` : ', on a new machine'}; the function: ${body(program, call.name)} (checks/fixtures/08/programs.json has the whole program)`;
        const context = { input, workDir };
        if (!m) {
          log = [];
          m = newMachine(Machine, program, syntheticImports(log), context);
        }
        log.length = 0; events = [];
        const tick0 = m.state?.tick;
        let result, error = null;
        try { result = m.invoke(call.name, args); } catch (e) {
          if (e instanceof CheckFailure || String(e?.message ?? '').includes(NOT_WRITTEN)) throw e;
          error = e;
        }
        const message = error ? String(error?.message ?? error).split('\n')[0] : '';
        if (call.trap) {
          if (!error) fail({ checked: `${label} traps`, input, observed: `your machine returned ${show(result)}`, expected: `a trap: Node's engine stops with "${call.trap}". Throw an Error whose message starts with "trap:"` });
          if (!message.startsWith('trap:')) fail({ checked: `${label} traps`, input, observed: `your machine threw ${error?.name ?? 'Error'}: ${message}${whereInWork(error, workDir)}`, expected: `an Error whose message starts with "trap:" (Node's engine says "${call.trap}")` });
        } else if (error) {
          fail({ checked: `${label} runs to its end`, input, observed: `your machine threw ${error?.name ?? 'Error'}: ${message}${whereInWork(error, workDir)}`, expected: `the call returns ${call.result === null ? 'nothing' : show(dec(call.result))}, as on Node's engine` });
        } else {
          const want = call.result === null ? undefined : dec(call.result);
          if (!Object.is(result, want)) fail({ checked: `the result of ${label}`, input, observed: `your machine returned ${show(result)}`, expected: `${show(want)}, as on Node's engine${typeof want === 'number' && typeof result === 'number' && Number.isInteger(want) && result === want ? ' (an i32 is never -0)' : ''}` });
        }
        const wantLog = (call.imports ?? []).map(([n, a]) => [n, a.map(dec)]);
        if (!same(log, wantLog)) fail({ checked: `the imports ${label} calls, with their arguments in order`, input, observed: `your machine called ${show(log.map(([n, a]) => `${n}(${a.map(x => show(x)).join(', ')})`))}`, expected: `${show(wantLog.map(([n, a]) => `${n}(${a.map(x => show(x)).join(', ')})`))}, as on Node's engine. A call to an import pops its arguments; the first argument is the deepest of them on the stack`, diff: firstDifference(log, wantLog) });
        if (!call.trap) {
          const ran = m.state.tick - tick0;
          if (ran !== events.length) fail({ checked: `every instruction of ${label} goes through step()`, input, observed: `state.tick went up by ${ran} but Machine.prototype.step ran ${plural(events.length, 'time')}`, expected: 'invoke begins the call, then calls this.step() until the call returns; step() adds 1 to state.tick. Lessons 09 to 13 count instructions by counting calls to Machine.prototype.step' });
          if (call.trace) checkTrace(program, events, call.trace, { label, input });
          if (call.ticks !== undefined && events.length !== call.ticks) fail({ checked: `how many instructions ${label} runs`, input, observed: plural(events.length, 'instruction'), expected: `${plural(call.ticks, 'instruction')}. ${RULES}` });
          if (call.writes) {
            const ours = events.flatMap(e => (e.writes ?? []).map(w => ({ address: w.address, size: w.size, before: bytesOf(w.before), after: bytesOf(w.after) })));
            const want = call.writes.map(([address, size, b, a]) => ({ address, size, before: fromHex(b), after: fromHex(a) }));
            if (!same(ours, want)) fail({ checked: `the writes ${label} reports`, input, observed: show(ours), expected: `${show(want)}: one write per store, { address, size, before, after }, address being where the first byte goes (the popped address plus the offset), before read from memory before the store`, diff: firstDifference(ours, want) });
          }
        }
        if (call.memory) {
          const memory = m.state.memory;
          const expected = new Uint8Array(entry.listing.memory.min * 65536);
          for (const [a, v] of call.memory) expected[a] = v;
          const d = memoryDifference(memory, expected);
          if (d) fail({ checked: `memory after ${label}`, input, observed: memoryText(d), expected: call.trap ? 'memory unchanged by the store that traps: a store that would reach past the end writes nothing' : 'the bytes Node\'s engine holds after the same calls; values are stored lowest byte first, at the popped address plus the offset' });
        }
        before.push(label);
        if (call.trap || entry.fresh) { m = null; before = []; }
      }
    }
  }
}

function checkTrace(program, events, flat, { label, input }) {
  const n = Math.max(events.length, flat.length / 2);
  for (let k = 0; k < n; k++) {
    const e = events[k];
    const wf = flat[2 * k], wa = flat[2 * k + 1];
    if (e && wf !== undefined && e.func === wf && e.at === wa && e.op === opAt(program, wf, wa)) continue;
    const prev = k > 0 ? `After instruction ${k} of the call, ${insText(program, flat[2 * k - 2], flat[2 * k - 1])}, ` : 'At the start of the call, ';
    const ours = e ? `${insText(program, e.func, e.at)}${e.op !== opAt(program, e.func, e.at) ? ` (but your event's op is ${show(e.op)})` : ''}` : 'nothing: your call had ended';
    const want = wf !== undefined ? insText(program, wf, wa) : 'nothing: the call has ended';
    fail({ checked: `the order in which ${label} runs its instructions`, input, observed: `${prev}your machine ran ${ours}`, expected: `${want}. ${k > 0 ? hintAfter(program, flat[2 * k - 2], flat[2 * k - 1]) : RULES}` });
  }
}

// ---------------------------------------------------------------- Node beside your machine

async function nodeGame(game, imports) {
  const { instance } = await WebAssembly.instantiate(wasmBytes(`targets/${game}.wasm`), { env: imports });
  return instance.exports;
}
const getterNames = (program) => program.exports.filter(e => e.kind === 'func' && !e.name.startsWith('game_')).map(e => e.name);
const callText = (c) => `${c.name}(${c.args.join(', ')})`;

// Run a session on your machine and on Node's engine with the same answers;
// compare after every call.
async function agree(Machine, game, { seed, mode, world, shots, flight }, workDir) {
  const program = readProgram(game);
  const calls = session({ seed, mode, plan: plan({ seed, shots, flight }) });
  const w1 = makeWorld(world), w2 = makeWorld(world);
  const describe = `${game}: session({ seed: ${seed}, mode: ${mode}, plan: plan({ seed: ${seed}, shots: ${shots}, flight: ${flight} }) }), ${calls.length} calls, both answered by makeWorld(${world})`;
  const m = newMachine(Machine, program, w1.imports, { input: describe, workDir });
  const node = await nodeGame(game, w2.imports);
  const getters = getterNames(program);
  for (let k = 0; k < calls.length; k++) {
    const c = calls[k];
    const at = `call ${k}, ${callText(c)}`;
    const input = `${describe}; the calls before it: ${calls.slice(Math.max(0, k - 3), k).map(callText).join(', ') || 'none'}`;
    const ours = attempt(() => m.invoke(c.name, c.args), { checked: `${at} runs on your machine`, input, expected: `the call runs to its end, as on Node's engine`, workDir });
    const theirs = node[c.name](...c.args);
    if (!Object.is(ours, theirs)) fail({ checked: `what ${at} returns`, input, observed: `yours returned ${show(ours)}`, expected: `${show(theirs)}, as on Node's engine` });
    for (const g of getters) {
      const x = attempt(() => m.invoke(g, []), { checked: `the getter ${g} after ${at}`, input, expected: 'a number', workDir });
      const y = node[g]();
      if (!Object.is(x, y)) fail({ checked: `${g}() after ${at}`, input, observed: `yours returns ${show(x)}`, expected: `${show(y)}, as on Node's engine. Every call before this one agreed` });
    }
    const d = memoryDifference(m.state.memory, new Uint8Array(node.memory.buffer));
    if (d) fail({ checked: `memory after ${at}`, input, observed: memoryText(d), expected: 'the same 131,072 bytes as Node\'s engine. Every call before this one agreed, so an instruction this call ran stored something else, or somewhere else' });
  }
  return { calls: calls.length, ticks: m.state.tick };
}

// ---------------------------------------------------------------- the cases

const store = (op) => WIDTH[op] !== undefined;

export const cases = [
  {
    id: '08.memory-starts',
    title: 'A new machine holds the program\'s starting memory and globals, and has run nothing',
    requirement: 'state.memory is a Uint8Array of memory.min × 65,536 bytes, zero except each data segment copied in at its offset; state.globals holds each global\'s init value; state.tick and state.calls are 0, state.frames is empty and running is false.',
    async run({ cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      const shape = (m, program, input, length, globals, expectedMemory, who) => {
        const s = m.state;
        if (!s || typeof s !== 'object') fail({ checked: 'machine.state', input, observed: `machine.state is ${show(s)}`, expected: 'one plain object holding everything the machine knows' });
        if (!(s.memory instanceof Uint8Array)) fail({ checked: 'state.memory is a Uint8Array', input, observed: `state.memory is ${s.memory === undefined ? 'missing' : Object.prototype.toString.call(s.memory)}`, expected: `a Uint8Array of ${plural(length, 'byte')}` });
        if (s.memory.length !== length) fail({ checked: 'the size of state.memory', input, observed: plural(s.memory.length, 'byte'), expected: `${plural(length, 'byte')}: memory.min (${program.memory.min}) times 65,536` });
        const d = memoryDifference(s.memory, expectedMemory);
        if (d) fail({ checked: 'the bytes of a new machine\'s memory', input, observed: memoryText(d, who), expected: `zero everywhere except the data segments, each copied in at its offset (${program.data.map(x => `${x.bytes.length} bytes at ${x.offset}`).join(', ')})` });
        const gl = s.globals;
        if (!Array.isArray(gl) && !ArrayBuffer.isView(gl)) fail({ checked: 'state.globals', input, observed: `state.globals is ${show(gl)}`, expected: `an array: ${show(globals)}` });
        if (!same(Array.from(gl), globals)) fail({ checked: 'the globals of a new machine', input, observed: show(Array.from(gl)), expected: `${show(globals)}: each global's init value from the listing`, diff: firstDifference(Array.from(gl), globals) });
        if (s.tick !== 0) fail({ checked: 'state.tick of a new machine', input, observed: show(s.tick), expected: '0: no instruction has run' });
        if (s.calls !== 0) fail({ checked: 'state.calls of a new machine', input, observed: show(s.calls), expected: '0: no call has begun' });
        if (!Array.isArray(s.frames) || s.frames.length !== 0) fail({ checked: 'state.frames of a new machine', input, observed: show(s.frames), expected: '[]: an empty array, no call in progress' });
        const running = attempt(() => m.running, { checked: 'machine.running', input, expected: 'false', workDir });
        if (running !== false) fail({ checked: 'machine.running of a new machine', input, observed: show(running), expected: 'false' });
      };
      for (const game of ['lob', 'lob2']) {
        const program = readProgram(game);
        const input = `new Machine(readProgram('${game}'), makeWorld(1).imports)`;
        const m = newMachine(Machine, program, makeWorld(1).imports, { input, workDir });
        const node = await nodeGame(game, makeWorld(1).imports);
        shape(m, program, input, program.memory.min * 65536, program.globals.map(g => g.init), new Uint8Array(node.memory.buffer), 'Node\'s engine before any call');
      }
      const layout = fixture('programs').layout;
      const program = loadProgram(layout.listing);
      const input = `a small program with one page of memory, three data segments (${program.data.map(x => `${x.bytes.length} bytes at ${x.offset}`).join(', ')}) and three globals (checks/fixtures/08/programs.json, "layout")`;
      const expected = new Uint8Array(layout.length);
      for (const [a, v] of layout.memory) expected[a] = v;
      shape(newMachine(Machine, program, {}, { input, workDir }), program, input, layout.length, layout.globals, expected, 'Node\'s engine');
    },
  },
  {
    id: '08.frames',
    title: 'A call to a defined function pushes a frame, and its caller waits at the instruction after the call',
    requirement: 'When a call instruction calls a function the program defines, step() pushes a frame { func: the callee, at: 0 } on top of state.frames, and the caller\'s frame names, as its at, the instruction after the call: that is where it carries on when the callee returns.',
    timeLimitMs: 20000,
    async run({ cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      const program = readProgram('lob');
      const view = (m) => (Array.isArray(m.state.frames) ? m.state.frames.map((f) => ({ func: f?.func, at: f?.at })) : m.state.frames);
      for (const [seed, mode, call] of [[3, 0, 'game_init'], [8, 1, 'game_init']]) {
        const input = `new Machine(readProgram('lob'), makeWorld(${seed}).imports), begin('${call}', [${seed}, ${mode}]), then step()`;
        const m = newMachine(Machine, program, makeWorld(seed).imports, { input, workDir });
        attempt(() => m.begin(call, [seed, mode]), { checked: `begin('${call}', ...)`, input, expected: 'the call begins', workDir });
        let found = 0;
        while (m.running && found < 2) {
          const frames = m.state.frames;
          const top = frames[frames.length - 1];
          const ins = program.func(top.func).code[top.at];
          const depth = frames.length;
          const e = pick(attempt(() => m.step(), { checked: 'step()', input, expected: 'an event', workDir }));
          if (ins[0] !== 'call' || ins[1] < program.imports.length) continue;
          found++;
          const after = view(m);
          const caller = after[depth - 1], callee = after[depth];
          const where = `${input}: the call at instruction ${e.at} of function ${e.func}, to function ${ins[1]}`;
          if (after.length !== depth + 1 || !callee || callee.func !== ins[1] || callee.at !== 0) fail({ checked: 'the frame a call pushes', input: where, observed: `state.frames is ${show(after)}`, expected: `${depth + 1} frames, the last { func: ${ins[1]}, at: 0 }` });
          if (!caller || caller.func !== e.func || caller.at !== e.at + 1) fail({ checked: 'the caller\'s frame during a call', input: where, observed: `the caller's frame is ${show(caller)}`, expected: `{ func: ${e.func}, at: ${e.at + 1} }: the caller carries on at the instruction after the call` });
          while (m.running && m.state.frames.length > depth) m.step();
          const back = view(m)[depth - 1];
          if (!back || back.func !== e.func || back.at !== e.at + 1) fail({ checked: 'where the caller carries on after the callee returns', input: where, observed: `the caller's frame is ${show(back)} after the return`, expected: `{ func: ${e.func}, at: ${e.at + 1} }` });
        }
        if (found < 2) fail({ checked: 'game_init calls two defined functions', input, observed: `${found} found`, expected: 'new_round and update_hud are both called' });
      }
    },
  },
  {
    id: '08.one-step',
    title: 'begin runs nothing; each step runs one instruction and returns its event',
    requirement: 'After begin(\'game_init\', [seed, mode]): running is true, state.calls is 1, state.tick is 0 and state.frames is [{ func: 4, at: 0, ... }]. Each step() returns { tick, func, at, op, writes } for the instruction named by the innermost frame\'s func and at, adds 1 to state.tick, and reports one write for a store and none otherwise. The first 300 instructions follow the listing\'s loop exactly, and game_init runs exactly as many instructions as the rules for branches give. step() is a method of the class, and invoke runs every instruction through it.',
    timeLimitMs: 20000,
    async run({ cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      if (typeof Machine.prototype.step !== 'function') fail({ checked: 'step() is a method of your Machine class', observed: 'Machine.prototype.step is not a function', expected: 'class Machine { step() { ... } }: the checks of lessons 09 to 13 count instructions by counting calls to Machine.prototype.step' });
      const counter = countSteps(Machine); // as lessons 09 to 13 count: calls to Machine.prototype.step
      const program = readProgram('lob');
      const init = program.exportIndex('game_init');
      const steps = fixture('first-steps');
      for (const { seed, mode, ticks } of steps.lengths) {
        const input = `new Machine(readProgram('lob'), makeWorld(${seed}).imports), then begin('game_init', [${seed}, ${mode}])`;
        const m = newMachine(Machine, program, makeWorld(seed).imports, { input, workDir });
        const startMemory = Buffer.from(ArrayBuffer.isView(m.state?.memory) ? m.state.memory : []);
        attempt(() => m.begin('game_init', [seed, mode]), { checked: 'begin(\'game_init\', [seed, mode])', input, expected: 'the call begins', workDir });
        const s = m.state;
        if (m.running !== true) fail({ checked: 'machine.running after begin', input, observed: show(m.running), expected: 'true: a call is unfinished' });
        if (s.tick !== 0) fail({ checked: 'state.tick after begin', input, observed: show(s.tick), expected: '0: begin runs nothing' });
        if (s.calls !== 1) fail({ checked: 'state.calls after begin', input, observed: show(s.calls), expected: '1: one call has begun' });
        if (memoryDifference(s.memory, startMemory)) fail({ checked: 'memory after begin', input, observed: 'memory changed', expected: 'unchanged: begin runs nothing' });
        if (!Array.isArray(s.frames) || s.frames.length !== 1 || s.frames[0]?.func !== init || s.frames[0]?.at !== 0) fail({ checked: 'state.frames after begin', input, observed: show(Array.isArray(s.frames) ? s.frames.map(f => ({ func: f?.func, at: f?.at })) : s.frames), expected: `one frame, { func: ${init}, at: 0 }: game_init is function ${init}, and its next instruction is its first` });
        const first = pick(attempt(() => m.step(), { checked: 'the first step() of game_init', input, expected: 'its event', workDir }));
        const want = { tick: 1, func: init, at: 0, op: 'i32.const', writes: [] };
        if (!same(first, want)) fail({ checked: 'the event of the first step()', input, observed: show(first), expected: show(want), diff: firstDifference(first, want) });
        if (m.state.tick !== 1) fail({ checked: 'state.tick after one step', input, observed: show(m.state.tick), expected: '1' });
        if (m.state.frames?.length !== 1 || m.state.frames[0]?.at !== 1) fail({ checked: 'state.frames after one step', input, observed: show(Array.isArray(m.state.frames) ? m.state.frames.map(f => ({ func: f?.func, at: f?.at })) : m.state.frames), expected: `one frame, { func: ${init}, at: 1 }: the position of the next instruction` });
        // Step on to the end of game_init: every event must match the frame it ran in.
        let tick = 1;
        while (m.running) {
          const top = m.state.frames[m.state.frames.length - 1];
          const topFunc = top?.func, topAt = top?.at; // read before the step: it may change the frame in place
          const name = top ? insText(program, topFunc, topAt) : 'nothing';
          const e = attempt(() => m.step(), { checked: `step() at tick ${tick}`, input: `${input}; the next instruction is ${name}`, expected: 'its event', workDir });
          tick++;
          if (!e || typeof e !== 'object') fail({ checked: `what step() returns at tick ${tick}`, input, observed: show(e), expected: 'the event { tick, func, at, op, writes }' });
          const k = tick - 1; // index into the fixture's first instructions (first[0] is instruction 1)
          if (k < steps.first.length) {
            const [wf, wa, ww] = steps.first[k];
            const ours = pick(e);
            const wantEvent = { tick, func: wf, at: wa, op: opAt(program, wf, wa), writes: ww.map(([address, size, b, a]) => ({ address, size, before: fromHex(b), after: fromHex(a) })) };
            if (!same(ours, wantEvent)) fail({ checked: `instruction ${tick} of game_init`, input, observed: show(ours), expected: `${show(wantEvent)}${ours.func === wf && ours.at !== wa && k > 0 ? `. ${hintAfter(program, steps.first[k - 1][0], steps.first[k - 1][1])}` : ''}`, diff: firstDifference(ours, wantEvent) });
          }
          if (e?.tick !== tick || m.state.tick !== tick) fail({ checked: `the tick of instruction ${tick}`, input, observed: `the event says tick ${show(e?.tick)} and state.tick is ${show(m.state.tick)}`, expected: `both ${tick}: the event's tick is the number of instructions run, counting this one` });
          if (e.func !== topFunc || e.at !== topAt) fail({ checked: `which instruction step() ran at tick ${tick}`, input, observed: `the event names (${e.func}, ${e.at}) but the innermost frame said ${name} was next`, expected: 'the instruction the innermost frame names: frames[frames.length - 1] holds the func and at of the next instruction' });
          if (e.op !== opAt(program, e.func, e.at)) fail({ checked: `the op of instruction ${tick}`, input, observed: show(e.op), expected: `${show(opAt(program, e.func, e.at))}, the name of ${insText(program, e.func, e.at)} in the listing` });
          if (!Array.isArray(e.writes)) fail({ checked: `the writes of instruction ${tick}`, input, observed: show(e.writes), expected: 'an array, [] when the instruction stores nothing' });
          if (store(e.op) ? e.writes.length !== 1 : e.writes.length !== 0) fail({ checked: `the writes of ${insText(program, e.func, e.at)} at tick ${tick}`, input, observed: plural(e.writes.length, 'write'), expected: store(e.op) ? 'exactly one write: every store reports one, even when it writes the bytes already there' : 'none: only stores write' });
          if (store(e.op) && e.writes[0]?.size !== WIDTH[e.op]) fail({ checked: `the size of the write of ${insText(program, e.func, e.at)} at tick ${tick}`, input, observed: show(e.writes[0]?.size), expected: `${WIDTH[e.op]}: ${e.op} writes ${plural(WIDTH[e.op], 'byte')}` });
          if (tick > 400000) fail({ checked: 'game_init ends', input, observed: 'more than 400,000 instructions and still running', expected: `game_init(${seed}, ${mode}) runs ${plural(ticks, 'instruction')}. ${RULES}` });
        }
        if (m.state.frames.length !== 0) fail({ checked: 'state.frames after game_init returns', input, observed: show(m.state.frames.map(f => ({ func: f?.func, at: f?.at }))), expected: '[]' });
        if (tick !== ticks) fail({ checked: `how many instructions game_init(${seed}, ${mode}) runs`, input, observed: plural(tick, 'instruction'), expected: `${plural(ticks, 'instruction')}. ${RULES} If 08.control and 08.numbers pass, compare your machine with Node's engine: node lab.mjs agree ...` });
        // invoke runs every instruction through Machine.prototype.step and returns undefined for a function without a result.
        counter.reset();
        const before = m.state.tick;
        const r = attempt(() => m.invoke('game_key', [3]), { checked: 'invoke(\'game_key\', [3])', input: `${input}, then invoke('game_key', [3])`, expected: 'undefined', workDir });
        if (r !== undefined) fail({ checked: 'what invoke returns for a function with no result', input: `${input}, then invoke('game_key', [3])`, observed: show(r), expected: 'undefined' });
        if (counter.count !== m.state.tick - before || counter.count === 0) fail({ checked: 'invoke runs every instruction through step()', input: `${input}, then invoke('game_key', [3])`, observed: `state.tick went up by ${m.state.tick - before} and Machine.prototype.step was called ${plural(counter.count, 'time')}`, expected: 'the same number: invoke calls this.step() until the call returns, and step is a method of the class. Lessons 09 to 13 count instructions by counting calls to Machine.prototype.step' });
      }
    },
  },
  {
    id: '08.control',
    title: 'Blocks, loops, branches, returns, calls, imports and globals behave as in Node\'s engine',
    requirement: 'Small programs with blocks that leave a value, nested branches out of one to three levels, loops, return from inside blocks, calls between functions with locals and results, import calls and globals: each call returns what Node\'s engine returns, calls the same imports with the same arguments, and runs the same instructions in the same order.',
    async run(ctx) { await runPrograms('control', ctx); },
  },
  {
    id: '08.memory',
    title: 'Loads and stores of every width, at their offsets, lowest byte first, and traps outside memory',
    requirement: 'i32.load, i32.load8_u, f32.load, i32.store, i32.store8, i32.store16, f32.store and i64.store read and write the bytes Node\'s engine does, at the popped address plus the offset; each store reports { address, size, before, after }; an access that reaches past the last byte, including one whose address is negative (a huge unsigned number), throws an Error whose message starts with "trap:" and writes nothing.',
    async run(ctx) { await runPrograms('memory', ctx); },
  },
  {
    id: '08.numbers',
    title: 'Integer and float instructions give Node\'s answers on the cases most likely to go wrong',
    requirement: 'Wrapping add, sub and mul; signed and unsigned division and remainder, with traps for division by zero and for -2147483648 / -1; shifts by 32 or more and by negative counts; signed and unsigned comparisons; select; f32 arithmetic rounded to 32 bits after every instruction; f32.neg of 0; the conversions, including -1 as unsigned and trunc_sat of NaN and of numbers beyond the i32 range; reinterpret both ways; demote and promote.',
    async run(ctx) { await runPrograms('numbers', ctx); },
  },
  {
    id: '08.writes',
    title: 'Every store in a run of Lob reports the bytes it wrote, and only stores do',
    requirement: 'Over a run of Lob that moves its state, re-keys it and fires: each store reports one write of its width; before holds the bytes memory had there just before the store; after holds what it wrote; applying every after in order to Node\'s memory before the call gives Node\'s memory after it.',
    timeLimitMs: 20000,
    async run({ cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      const program = readProgram('lob');
      const seed = 909, mode = 14, world = 3;
      const calls = session({ seed, mode, plan: [['up', 2], ['right', 1], ['fire'], ['frames', 45], ['new'], ['down', 3], ['left', 1], ['fire'], ['frames', 4]] });
      const describe = `lob, session({ seed: ${seed}, mode: ${mode}, ... }): ${calls.length} calls (mode 14 moves the state each round, re-keys it and moves the flag), answered by makeWorld(${world})`;
      const m = newMachine(Machine, program, makeWorld(world).imports, { input: describe, workDir });
      const node = await nodeGame('lob', makeWorld(world).imports);
      const shadow = Uint8Array.from(new Uint8Array(node.memory.buffer));
      const seen = new Set();
      for (let k = 0; k < calls.length; k++) {
        const c = calls[k];
        const input = `${describe}; call ${k}, ${callText(c)}`;
        attempt(() => m.begin(c.name, c.args), { checked: `begin for call ${k}`, input, expected: 'the call begins', workDir });
        let n = 0;
        while (m.running) {
          const e = attempt(() => m.step(), { checked: `step() in call ${k}`, input, expected: 'its event', workDir });
          if (!e || typeof e !== 'object') fail({ checked: `what step() returns in call ${k}`, input, observed: show(e), expected: 'the event { tick, func, at, op, writes }' });
          if (++n > 200000) fail({ checked: `call ${k} ends`, input, observed: 'more than 200,000 instructions', expected: 'the call returns' });
          const where = `${insText(program, e.func, e.at)} at tick ${e.tick}`;
          const writes = e?.writes;
          if (!Array.isArray(writes)) fail({ checked: `the writes of ${where}`, input, observed: show(writes), expected: 'an array' });
          if (!store(e.op)) { if (writes.length) fail({ checked: `the writes of ${where}`, input, observed: show(writes.map(pick)), expected: '[]: only stores write' }); continue; }
          seen.add(e.op);
          if (writes.length !== 1) fail({ checked: `the writes of ${where}`, input, observed: plural(writes.length, 'write'), expected: 'exactly one write: a store that writes the bytes already there still reports a write' });
          const w = writes[0];
          const before = bytesOf(w?.before), after = bytesOf(w?.after);
          const ok = (b) => Array.isArray(b) && b.length === WIDTH[e.op] && b.every(x => Number.isInteger(x) && x >= 0 && x <= 255);
          if (w?.size !== WIDTH[e.op] || !Number.isInteger(w?.address) || w.address < 0 || w.address + WIDTH[e.op] > shadow.length || !ok(before) || !ok(after)) fail({ checked: `the write of ${where}`, input, observed: show({ address: w?.address, size: w?.size, before, after }), expected: `{ address, size: ${WIDTH[e.op]}, before, after }: an address inside memory, and before and after as ${WIDTH[e.op]} byte values each` });
          const was = Array.from(shadow.subarray(w.address, w.address + w.size));
          if (!same(before, was)) fail({ checked: `before, in the write of ${where}`, input, observed: `before is ${show(before)}`, expected: `${show(was)}: the bytes at ${w.address} just before the store (Node's memory before this call, with the earlier writes of the call applied). Read before from memory before you store` });
          shadow.set(after, w.address);
          const now = Array.from(m.state.memory.subarray(w.address, w.address + w.size));
          if (!same(now, after)) fail({ checked: `after, in the write of ${where}`, input, observed: `after is ${show(after)} but your memory at ${w.address} now holds ${show(now)}`, expected: 'after holds the bytes the store left in memory at the write\'s address, which is the popped address plus the offset' });
        }
        attempt(() => node[c.name](...c.args), { checked: 'Node\'s engine', input, expected: 'runs', workDir });
        const d = memoryDifference(shadow, new Uint8Array(node.memory.buffer));
        if (d) fail({ checked: `the writes of call ${k} account for every byte it changed`, input, observed: `Node's memory before the call with your writes applied: ${memoryText(d)}`, expected: 'Node\'s memory after the call: every store reports its write, at its address, with the bytes it wrote' });
        const own = memoryDifference(m.state.memory, shadow);
        if (own) fail({ checked: `your memory after call ${k}`, input, observed: memoryText(own, 'Node\'s engine'), expected: 'Node\'s memory after the call' });
      }
      const missing = Object.keys(WIDTH).filter(op => !seen.has(op));
      if (missing.length) fail({ checked: 'the run stores with every width', input: describe, observed: `no ${missing.join(', ')} ran`, expected: 'every store instruction ran (this is a fault in the check, not in your code: report it)' });
    },
  },
  {
    id: '08.lob-agrees',
    title: 'Lob on your machine agrees with Node\'s engine after every call, in every mode',
    requirement: 'For sessions of Lob in modes 1, 2, 4, 8 and 15 (each with its own seed), answered by two worlds made from the same seed: after every call, the call\'s result, every getter (r_angle ... r_state) and all 131,072 bytes of memory are the same on your machine as on Node\'s engine.',
    timeLimitMs: 40000,
    async run({ cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      for (const s of [{ seed: 11, mode: 1, world: 41 }, { seed: 222, mode: 2, world: 42 }, { seed: 3333, mode: 4, world: 43 }, { seed: 44, mode: 8, world: 44 }, { seed: 5, mode: 15, world: 45 }]) {
        await agree(Machine, 'lob', { ...s, shots: 2, flight: 200 }, workDir);
      }
    },
  },
  {
    id: '08.lob2-agrees',
    title: 'Lob II on your machine agrees with Node\'s engine after every call',
    requirement: 'For sessions of Lob II (programs/lob2.json, targets/lob2.wasm) in modes 0, 1, 2, 4 and 7: after every call, the result, every getter (g0 ... g7) and all of memory are the same on your machine as on Node\'s engine.',
    timeLimitMs: 40000,
    async run({ cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      for (const s of [{ seed: 17, mode: 0, world: 51 }, { seed: 1717, mode: 1, world: 52 }, { seed: 99, mode: 2, world: 53 }, { seed: 123456, mode: 4, world: 54 }, { seed: 8, mode: 7, world: 55 }]) {
        await agree(Machine, 'lob2', { ...s, shots: 2, flight: 200 }, workDir);
      }
    },
  },
  {
    id: '08.plain-state',
    title: 'A copy of machine.state, put back, carries on exactly, in the middle of a call and between calls',
    requirement: 'structuredClone(machine.state) works at any moment. Put back with machine.state = copy, on the same machine or on a new one, the machine runs the same instructions with the same events and ends with the same memory and ticks as it did the first time, whether the copy was taken inside a nested call or between calls.',
    timeLimitMs: 20000,
    async run({ cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      const program = readProgram('lob');
      const seed = 31, mode = 14;
      // Mode 14 has no server: the game asks only sin and cos, whose answers depend on their
      // arguments alone, so running the same instructions again gets the same answers.
      const calls = session({ seed, mode, plan: [['right', 3], ['up', 4], ['fire'], ['frames', 90], ['new'], ['left', 2], ['fire'], ['frames', 40]] });
      const describe = `lob, session({ seed: ${seed}, mode: ${mode}, ... }) with ${calls.length} calls`;
      const m = newMachine(Machine, program, makeWorld(1).imports, { input: describe, workDir });
      const clone = (what, input) => attempt(() => structuredClone(m.state), { checked: `structuredClone(machine.state) ${what}`, input, expected: 'a copy: state holds only plain data (numbers, BigInts, strings, arrays, plain objects, typed arrays), no functions and no class instances whose methods it needs', workDir });
      // Step n instructions, beginning the session's next call whenever the last one has returned.
      const drive = (mm, next, n, input, { until = null, what = 'running the session' } = {}) => {
        const events = [];
        for (let i = 0; i < n; i++) {
          if (!mm.running) { if (next >= calls.length) break; const c = calls[next++]; attempt(() => mm.begin(c.name, c.args), { checked: `${what}: begin(${callText(c)})`, input, expected: 'the call begins', workDir }); }
          events.push(pick(attempt(() => mm.step(), { checked: `${what}: step() number ${i + 1}`, input, expected: 'the event of the same instruction as the first time', workDir })));
          if (until && until(events[events.length - 1], mm)) return { events, next, found: true };
        }
        return { events, next, memory: Buffer.from(mm.state.memory), tick: mm.state.tick, frames: mm.state.frames.map(f => [f.func, f.at]) };
      };
      const compare = (a, b, checked, input) => {
        const k = a.events.findIndex((e, i) => !same(e, b.events[i]));
        if (k >= 0 || a.events.length !== b.events.length) fail({ checked, input, observed: k >= 0 ? `instruction ${k + 1} after the copy: ${show(b.events[k])}` : `${b.events.length} instructions`, expected: k >= 0 ? `${show(a.events[k])}, as the first time` : `${a.events.length} instructions, as the first time`, diff: k >= 0 ? firstDifference(b.events[k], a.events[k]) : undefined });
        const d = memoryDifference(b.memory, a.memory);
        if (d) fail({ checked, input, observed: `memory at the end: ${memoryText(d, 'the first run')}`, expected: 'the same memory as the first time' });
        if (a.tick !== b.tick || !same(a.frames, b.frames)) fail({ checked, input, observed: `state.tick ${b.tick}, frames ${show(b.frames)}`, expected: `state.tick ${a.tick}, frames ${show(a.frames)}, as the first time` });
      };
      // Copies in the middle of calls, each taken just after an instruction that pushed a value
      // while two or more frames are in progress: the value stack then holds live values.
      const PUSHES = new Set(['i32.const', 'f32.const', 'i64.const', 'local.get', 'local.tee', 'global.get', 'i32.load', 'i32.load8_u', 'f32.load']);
      const W = 1500;
      attempt(() => m.invoke(calls[0].name, calls[0].args), { checked: `call 0, ${callText(calls[0])}`, input: describe, expected: 'runs', workDir });
      let next = 1;
      for (let p = 0; p < 6; p++) {
        const lead = drive(m, next, 30000, describe, { until: (e, mm) => e.tick % 997 > 400 + 50 * p && PUSHES.has(e.op) && mm.state.frames.length >= 2 });
        if (!lead.found) fail({ checked: 'the check finds a place to copy the state', input: describe, observed: 'none within 30,000 instructions', expected: 'an instruction that pushes a value inside a nested call (a fault in the check, not your code, if every other case passes: report it)' });
        next = lead.next;
        const last = lead.events[lead.events.length - 1];
        const midInput = `${describe}: a copy taken at tick ${m.state.tick}, in call ${next - 1}, ${callText(calls[next - 1])}, just after ${insText(program, last.func, last.at)}, with ${m.state.frames.length} frames in progress`;
        const copy = clone('in the middle of a call', midInput);
        const first = drive(m, next, W, midInput);
        attempt(() => { m.state = structuredClone(copy); }, { checked: 'machine.state = copy', input: midInput, expected: 'the machine takes the copy as its state', workDir });
        const again = `the same machine, put back with machine.state = copy, runs the next ${W.toLocaleString('en-US')} instructions as it did the first time`;
        compare(first, drive(m, next, W, midInput, { what: again }), again, midInput);
        const fresh = newMachine(Machine, program, makeWorld(2).imports, { input: midInput, workDir });
        attempt(() => { fresh.state = structuredClone(copy); }, { checked: 'machine.state = copy on a new machine', input: midInput, expected: 'the machine takes the copy as its state', workDir });
        const other = `a new machine given the copy with machine.state = copy runs the next ${W.toLocaleString('en-US')} instructions as the first one did`;
        compare(first, drive(fresh, next, W, midInput, { what: other }), other, midInput);
        next = first.next;
      }
      // Between calls.
      while (m.running) attempt(() => m.step(), { checked: 'step()', input: describe, expected: 'its event', workDir });
      const betweenInput = `${describe}: a copy taken between calls, before call ${next}, ${callText(calls[next])}`;
      const copy2 = clone('between calls', betweenInput);
      const runCalls = (mm) => {
        const out = [];
        for (let k = next; k < Math.min(calls.length, next + 30); k++) {
          const r = attempt(() => mm.invoke(calls[k].name, calls[k].args), { checked: `call ${k}`, input: betweenInput, expected: 'runs', workDir });
          const px = attempt(() => mm.invoke('r_px', []), { checked: 'r_px()', input: betweenInput, expected: 'runs', workDir });
          out.push([callText(calls[k]), r ?? null, mm.state.tick, hashMemory(mm.state.memory).slice(0, 16), px]);
        }
        return { out, memory: Buffer.from(mm.state.memory), calls: mm.state.calls };
      };
      const a = runCalls(m);
      attempt(() => { m.state = structuredClone(copy2); }, { checked: 'machine.state = copy', input: betweenInput, expected: 'the machine takes the copy as its state', workDir });
      const b = runCalls(m);
      const fresh2 = newMachine(Machine, program, makeWorld(3).imports, { input: betweenInput, workDir });
      attempt(() => { fresh2.state = structuredClone(copy2); }, { checked: 'machine.state = copy on a new machine', input: betweenInput, expected: 'the machine takes the copy as its state', workDir });
      const c = runCalls(fresh2);
      for (const [x, who] of [[b, 'the same machine'], [c, 'a new machine']]) {
        if (!same(x.out, a.out)) fail({ checked: `${who}, given the copy, runs the next 30 calls as before`, input: betweenInput, observed: show(x.out.find((r, i) => !same(r, a.out[i]))), expected: `${show(a.out.find((r, i) => !same(r, x.out[i])))} (call, result, state.tick, start of the memory hash, r_px)`, diff: firstDifference(x.out, a.out) });
        const d = memoryDifference(x.memory, a.memory);
        if (d || x.calls !== a.calls) fail({ checked: `${who}, given the copy, ends 30 calls later where it did before`, input: betweenInput, observed: d ? memoryText(d, 'the first run') : `state.calls ${x.calls}`, expected: d ? 'the same memory' : `state.calls ${a.calls}` });
      }
    },
  },
  {
    id: '08.speed',
    title: 'A run of about 900,000 instructions takes your machine less than 5 seconds',
    requirement: 'A session of Lob of about 900,000 instructions, run with invoke, finishes within 5 seconds, and leaves the same memory as Node\'s engine. Lessons 09 to 13 replay runs like it many times.',
    timeLimitMs: 30000,
    async run({ cls, workDir }) {
      const LIMIT_MS = 5000;
      const Machine = await cls('machine.mjs', 'Machine');
      const program = readProgram('lob');
      const seed = 8, mode = 0, world = 4;
      const calls = session({ seed, mode, plan: plan({ seed, shots: 3, flight: 300 }) });
      const describe = `lob, session({ seed: ${seed}, mode: ${mode}, plan: plan({ seed: ${seed}, shots: 3, flight: 300 }) }), ${calls.length} calls answered by makeWorld(${world})`;
      const m = newMachine(Machine, program, makeWorld(world).imports, { input: describe, workDir });
      const started = performance.now();
      for (let k = 0; k < calls.length; k++) {
        attempt(() => m.invoke(calls[k].name, calls[k].args), { checked: `call ${k}, ${callText(calls[k])}`, input: describe, expected: 'runs', workDir });
        const ms = performance.now() - started;
        if (ms > LIMIT_MS) fail({ checked: 'how long your machine takes for the run', input: describe, observed: `after ${(ms / 1000).toFixed(1)} s your machine had run ${k + 1} of ${calls.length} calls, ${plural(m.state.tick, 'instruction')} (${Math.round(m.state.tick / ms * 1000).toLocaleString('en-US')} a second)`, expected: `the whole run, about 900,000 instructions, within ${LIMIT_MS / 1000} s. Look up what each instruction does once, when the machine is made, not on every step; avoid making new arrays or objects on every step except the event` });
      }
      const ms = performance.now() - started;
      const node = await nodeGame('lob', makeWorld(world).imports);
      for (const c of calls) node[c.name](...c.args);
      const d = memoryDifference(m.state.memory, new Uint8Array(node.memory.buffer));
      if (d) fail({ checked: 'memory after the timed run', input: describe, observed: memoryText(d), expected: 'the same memory as Node\'s engine after the same calls (08.lob-agrees finds the first call that differs)' });
      if (m.state.tick < 800000) fail({ checked: 'the length of the timed run', input: describe, observed: `state.tick is ${m.state.tick} after ${(ms / 1000).toFixed(2)} s`, expected: 'about 900,000 instructions' });
    },
  },
];
