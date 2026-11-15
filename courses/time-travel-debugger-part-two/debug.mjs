#!/usr/bin/env node
// A command line for YOUR debugger: node debug.mjs PROJECT TARGET [SCRIPT]
//   PROJECT  your project folder (it uses your machine.mjs, recorder.mjs,
//            debugger.mjs, query.mjs and names.mjs)
//   TARGET   a ladder build number (1 to 6), or a recording file such as one
//            you saved with record()
//   SCRIPT   a file of commands, one per line; without it, commands are read
//            from the keyboard or from piped input. Type help for the list.
// Typed or piped commands carry on after an error. A script file stops at its
// first error. Every instruction your machine runs is counted; `cost` shows the count.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { loadProgram } from './public/program.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const NOT_WRITTEN = 'not written yet';

export const HELP = `Commands (FUNC is a function index or name; ADDR a byte address, decimal or 0x hex):
  where                 the tick, the call and the instruction that runs next
  stack                 the functions in progress, outermost first, each at the instruction
                        it runs next (a caller's is the one after its call)
  calls                 how many calls the run has
  call N                go to the start of call N (a binary search: about 20 seeks)
  seek TICK | step [N] | back [N]
  break FUNC[:AT]       stop before that instruction (without :AT, where a call to FUNC begins)
  watch ADDR [SIZE]     stop right after an instruction changes one of these bytes
  clear                 remove every breakpoint and watch
  continue | rcontinue  run forward / backward to the next stop
  finish                run until the current function returns
  read ADDR [SIZE] [u8|i32|f32|text]
  listing [FUNC:AT] [N] the instructions from N before AT to N after it (default: around
                        what runs next, with N 8)
  last-write ADDR       go to the last write of ADDR at or before here (your Debugger.lastWrite)
  who ADDR              the same question asked of your index (your query.mjs; builds it once)
  sources               where the value stored by the instruction at this tick came from
  writes [N]            step N instructions (default 20), listing every byte each one changed
  getters               every getter's value at this point (between calls)
  diverge               the first call after which this build's getters differ from the good build's
  compare               this build's getters beside the good build's after the same calls (and,
                        for a build of Lob, its status line, message line and help text)
  answer                name the write made by the instruction at this tick as your answer
  cost                  instructions your machine has run so far
  help | quit
Typed or piped commands carry on after an error. A script file stops at its first error.`;

function counter(Machine) {
  const proto = Machine.prototype;
  if (proto.__counted) return proto.__counted;
  const original = proto.step;
  const c = { count: 0, reset() { this.count = 0; } };
  proto.step = function (...args) { c.count++; return original.apply(this, args); };
  Object.defineProperty(proto, '__counted', { value: c });
  return c;
}

// What a target needs: the program, the recording, the .wasm file to read names
// from, the line table if there is one, and the good build to compare with.
export function resolveTarget(target) {
  const rungs = existsSync(join(root, 'ladder.json')) ? readJson(join(root, 'ladder.json')) : [];
  const rung = typeof target === 'object' ? target : rungs.find((r) => String(r.n) === String(target) || r.recording === String(target).replace(/^\.\//, ''));
  if (rung) {
    const program = loadProgram(readJson(join(root, rung.program)));
    const wasm = join(root, rung.wasm);
    return { program, recording: readJson(join(root, rung.recording)), wasm, lines: null, good: goodBuild(program), label: rung.title };
  }
  const file = resolve(target);
  if (!existsSync(file)) throw Error(`No ladder build or recording named ${target}`);
  const json = readJson(file);
  // A check fixture holds its recording (and, for a small program, its listing) inside.
  const recording = json.recording ?? json;
  // A fixture may carry its own listing as an object; a plain recording names its program instead.
  const listing = json.program && typeof json.program === 'object' ? json.program : readJson(join(root, 'programs', `${recording.program}.json`));
  const program = loadProgram(listing);
  const named = join(root, 'targets', `${recording.program}-names.wasm`);
  const lines = join(root, 'lines', `${recording.program}.json`);
  const plain = join(root, 'targets', `${recording.program}.wasm`);
  // A fixture's small program (the mixer) has no .wasm beside it: then there are no names to read.
  const wasm = existsSync(named) ? named : existsSync(plain) ? plain : null;
  return { program, recording, wasm, lines: existsSync(lines) ? readJson(lines) : null, good: null, label: file };
}

function goodBuild(program) {
  const names = program.exports.map((e) => e.name);
  if (names.includes('r_px')) return { wasm: join(root, 'targets', 'lob.wasm'), name: 'lob.wasm' };
  if (names.includes('g0')) return { wasm: join(root, 'targets', 'lob2.wasm'), name: 'lob2.wasm' };
  return null;
}

async function optional(dir, file) {
  const p = join(dir, file);
  if (!existsSync(p)) return null;
  return import(pathToFileURL(p).href);
}

export async function openSession(dir, target) {
  const t = resolveTarget(target);
  const { Machine } = await import(pathToFileURL(join(dir, 'machine.mjs')).href);
  const cost = counter(Machine);
  const { Debugger } = await import(pathToFileURL(join(dir, 'debugger.mjs')).href);
  const query = await optional(dir, 'query.mjs');
  const namesMod = await optional(dir, 'names.mjs');
  let names = {};
  try { if (namesMod && t.wasm) names = namesMod.functionNames(new Uint8Array(readFileSync(t.wasm))) ?? {}; } catch (e) { if (!String(e.message).includes(NOT_WRITTEN)) throw e; }
  const lineOf = (offset) => {
    if (!t.lines || !namesMod) return null;
    try { return namesMod.lineAt(t.lines.rows ?? t.lines, offset); } catch (e) { if (String(e.message).includes(NOT_WRITTEN)) return null; throw e; }
  };
  cost.reset();   // your Debugger's first pass, if it makes one, counts too
  const d = new Debugger(t.program, t.recording);
  return { t, Machine, cost, d, query, names, lineOf, stops: { breakpoints: [], watches: [], functions: [] }, index: null, answer: null };
}

const num = (s) => { if (s === undefined) return undefined; const n = /^0x/i.test(s) ? parseInt(s, 16) : Number(s); if (!Number.isInteger(n)) throw Error(`${s} is not a whole number`); return n; };

function funcRef(S, text) {
  if (/^\d+$/.test(text)) return Number(text);
  const hit = Object.entries(S.names).find(([, n]) => n === text);
  if (!hit) throw Error(`No function named ${text}${Object.keys(S.names).length ? '' : ' (no names: write functionNames in names.mjs, lesson 12)'}`);
  return Number(hit[0]);
}

function describe(S, func, at) {
  if (func === null || func === undefined) return 'nothing: the run has ended';
  const f = S.t.program.func(func);
  const ins = f.code[at];
  const line = S.lineOf(f.offsets[at]);
  return `function ${func}${S.names[func] ? ` (${S.names[func]})` : ''}, instruction ${at}: ${ins.map(String).join(' ')}${line ? (line.line ? `  [line ${line.line}]` : '  [no line]') : ''}`;
}

// Imports that refuse to answer: a plain object with one function per import name (API.md), so a
// machine that lists its imports finds them all.
function refusingImports(program, why) {
  return Object.fromEntries(program.imports.map((i) => [i.name, () => { throw Error(why); }]));
}

function getterValues(S, state, program) {
  const m = new S.Machine(program, refusingImports(program, 'a getter asked the outside world'));
  const out = {};
  for (const e of program.exports) {
    if (e.kind !== 'func' || e.name.startsWith('game_')) continue;
    m.state = structuredClone(state);
    out[e.name] = m.invoke(e.name, []);
  }
  return out;
}

// The texts a build of Lob shows, each found through the getter that returns its
// address. Lob II's getters are named so they don't say what they hold, so its texts
// aren't shown.
const TEXTS = [['status line', 'r_line_ptr'], ['message line', 'r_msg_ptr'], ['help text', 'r_help_ptr']];

async function nodeGetters(wasm, calls, upTo, answers) {
  let next = 0;
  const env = {
    sin: (x) => answers ? answers[next++].result : Math.sin(x),
    cos: (x) => answers ? answers[next++].result : Math.cos(x),
    server_round: () => { if (!answers) throw Error('server'); return answers[next++].result; },
    server_wind: () => { if (!answers) throw Error('server'); return answers[next++].result; },
  };
  const { instance } = await WebAssembly.instantiate(readFileSync(wasm), { env });
  const snaps = [];
  const read = () => Object.fromEntries(Object.entries(instance.exports).filter(([n, f]) => typeof f === 'function' && !n.startsWith('game_')).map(([n, f]) => [n, f()]));
  for (let k = 0; k < upTo; k++) { instance.exports[calls[k].name](...calls[k].args); snaps.push(read()); }
  // After the last call: each text, read from memory up to its terminating 0.
  const bytes = new Uint8Array(instance.exports.memory.buffer);
  const texts = {};
  for (const [label, getter] of TEXTS) {
    if (typeof instance.exports[getter] !== 'function') continue;
    const at = instance.exports[getter]() >>> 0, end = bytes.indexOf(0, at);
    texts[label] = Buffer.from(bytes.subarray(at, Math.min(end < 0 ? bytes.length : end, at + 400))).toString('latin1');
  }
  return Object.assign(snaps, { texts });
}

export async function command(S, text) {
  const [verb, ...a] = text.trim().split(/\s+/);
  const d = S.d;
  const here = () => { const w = d.where(); return `tick ${w.tick}, call ${w.call}${S.t.recording.calls[w.call] ? ` (${S.t.recording.calls[w.call].name} ${S.t.recording.calls[w.call].args.join(' ')})` : ''}, next: ${describe(S, w.func, w.at)}`; };
  switch (verb) {
    case undefined: case '': return null;
    case 'help': return HELP;
    case 'where': return here();
    case 'stack': {
      const frames = d.stack();
      return frames.length ? frames.map((f, k) => `${k}: ${describe(S, f.func, f.at)}`).join('\n') : 'between calls: no functions in progress';
    }
    case 'calls': return `${S.t.recording.calls.length} calls; the run has ${d.end} instructions`;
    case 'call': {
      const n = num(a[0]);
      let lo = 0, hi = d.end;   // the first position whose where().call reaches n
      while (lo < hi) { const mid = (lo + hi) >> 1; d.seek(mid); if (d.where().call >= n) hi = mid; else lo = mid + 1; }
      d.seek(lo);
      return here();
    }
    case 'seek': d.seek(num(a[0])); return here();
    case 'step': d.step(num(a[0]) ?? 1); return here();
    case 'back': d.stepBack(num(a[0]) ?? 1); return here();
    case 'break': {
      const [f, at] = a[0].split(':');
      const func = funcRef(S, f);
      if (at === undefined) S.stops.functions.push(func); else S.stops.breakpoints.push({ func, at: num(at) });
      return `stops: ${JSON.stringify(S.stops)}`;
    }
    case 'watch': S.stops.watches.push({ address: num(a[0]), size: num(a[1]) ?? 1 }); return `stops: ${JSON.stringify(S.stops)}`;
    case 'clear': S.stops = { breakpoints: [], watches: [], functions: [] }; return 'no stops';
    case 'continue': { const r = d.continue(S.stops); return `${r.reason} at ${here()}`; }
    case 'rcontinue': { const r = d.continueBack(S.stops); return `${r.reason} at ${here()}`; }
    case 'finish': d.stepOut(); return here();
    case 'read': {
      const address = num(a[0]), kind = a[2] ?? (a[1] && !/^\d/.test(a[1]) ? a[1] : 'u8');
      const size = /^\d/.test(a[1] ?? '') || /^0x/i.test(a[1] ?? '') ? num(a[1]) : kind === 'i32' || kind === 'f32' ? 4 : kind === 'text' ? 64 : 1;
      const bytes = d.read(address, size);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (kind === 'i32') return Array.from({ length: size >> 2 }, (_, k) => view.getInt32(4 * k, true)).join(' ');
      if (kind === 'f32') return Array.from({ length: size >> 2 }, (_, k) => view.getFloat32(4 * k, true)).join(' ');
      if (kind === 'text') { const end = bytes.indexOf(0); return JSON.stringify(Buffer.from(bytes.subarray(0, end < 0 ? bytes.length : end)).toString('latin1')); }
      return Array.from(bytes).join(' ');
    }
    case 'listing': {
      let func, at, n = 8;
      if (a[0] && a[0].includes(':')) { const [f, x] = a[0].split(':'); func = funcRef(S, f); at = num(x); n = num(a[1]) ?? 8; }
      else { const w = d.where(); if (w.func === null) return 'at the end of the run: give FUNC:AT'; func = w.func; at = w.at; n = num(a[0]) ?? 8; }
      const f = S.t.program.func(func);
      const from = Math.max(0, at - n), to = Math.min(f.code.length - 1, at + n);
      const out = [];
      for (let k = from; k <= to; k++) out.push(`${k === at ? '>' : ' '} ${String(k).padStart(5)}  ${f.code[k].map(String).join(' ')}`);
      return `function ${func}${S.names[func] ? ` (${S.names[func]})` : ''}\n${out.join('\n')}`;
    }
    case 'last-write': {
      const w = d.lastWrite(num(a[0]));
      if (!w) return `nothing wrote byte ${a[0]} at or before tick ${d.tick}`;
      d.seek(w.tick);
      return `tick ${w.tick}: ${describe(S, w.func, w.at)} wrote ${w.size} bytes at ${w.address}`;
    }
    case 'who': {
      if (!S.query) return 'no query.mjs in this project';
      S.index ??= S.query.buildIndex(S.t.program, S.t.recording);
      const w = S.index.lastWriter(num(a[0]), d.tick + 1);
      if (!w) return `nothing wrote byte ${a[0]} at or before tick ${d.tick}`;
      d.seek(w.tick);
      return `tick ${w.tick}: ${describe(S, w.func, w.at)} wrote ${w.size} bytes at ${w.address}`;
    }
    case 'sources': {
      if (!S.query) return 'no query.mjs in this project';
      S.index ??= S.query.buildIndex(S.t.program, S.t.recording);
      const s = S.index.sources(d.tick);
      return [`stores: ${s.stores.join(' ') || 'none'}`, `answers: ${s.answers.map((k) => `${k} (${S.t.recording.answers[k].name})`).join(' ') || 'none'}`, `call arguments: ${s.args.map(([c, p]) => `call ${c} argument ${p}`).join(', ') || 'none'}`, `initial bytes: ${s.initial.join(' ') || 'none'}`].join('\n');
    }
    case 'writes': {
      const n = num(a[0]) ?? 20;
      if (n < 1 || n > 500) throw Error('writes takes 1 to 500 instructions');
      const out = [];
      const noWorld = refusingImports(S.t.program, 'outside world');
      for (let k = 0; k < n && d.tick < d.end; k++) {
        // Run the next instruction once more on a copy of the state, to see its writes,
        // even a store that rewrote the value it found; then move the debugger on.
        let ev = null;
        if (d.state().frames.length) {
          const m = new S.Machine(S.t.program, noWorld);
          m.state = d.state();
          try { ev = m.step(); } catch { ev = null; }
        }
        d.step(1);
        for (const w of ev?.writes ?? []) out.push(`tick ${d.tick}: ${describe(S, ev.func, ev.at)} wrote ${w.size} byte${w.size > 1 ? 's' : ''} at ${w.address}: ${w.before.join(' ')} -> ${w.after.join(' ')}`);
      }
      return out.length ? out.join('\n') : `no instruction wrote memory up to tick ${d.tick}`;
    }
    case 'getters': {
      if (d.state().frames.length) return 'getters can be read only between calls: use call N first';
      return Object.entries(getterValues(S, d.state(), S.t.program)).map(([k, v]) => `${k} = ${v}`).join('\n');
    }
    case 'diverge': case 'compare': {
      if (!S.t.good) return 'this target has no good build to compare with (open a ladder build by its number: node debug.mjs PROJECT N)';
      const calls = S.t.recording.calls;
      const upTo = verb === 'compare' ? d.where().call : calls.length;
      const ours = await nodeGetters(S.t.wasm, calls, upTo, S.t.recording.answers);
      let good;
      try { good = await nodeGetters(S.t.good.wasm, calls, upTo, null); } catch { return `${S.t.good.name} needs the server's answers on these calls, so it cannot be run beside this build`; }
      if (verb === 'compare') {
        if (!upTo) return 'no calls have run yet';
        const x = ours[upTo - 1], y = good[upTo - 1];
        const rows = Object.keys(y).map((k) => `${k.padEnd(14)} this build ${String(x[k]).padEnd(14)} ${S.t.good.name} ${y[k]}${Object.is(x[k], y[k]) ? '' : '   <- differs'}`);
        for (const [label] of TEXTS) {
          const a = ours.texts[label], b = good.texts[label];
          if (a === undefined && b === undefined) continue;
          if (a === b) rows.push(`${label.padEnd(14)} the same in both builds: ${JSON.stringify(a)}`);
          else rows.push(`${label.padEnd(14)} this build ${JSON.stringify(a)}`, `${''.padEnd(14)} ${S.t.good.name.padEnd(10)} ${JSON.stringify(b)}   <- differs`);
        }
        return rows.join('\n');
      }
      const skip = new Set(['r_state', 'r_trail_ptr', 'r_line_ptr', 'r_msg_ptr', 'r_help_ptr', 'g6', 'g7']);
      for (let k = 0; k < upTo; k++) {
        const diff = Object.keys(good[k]).filter((g) => !skip.has(g) && !Object.is(ours[k][g], good[k][g]));
        if (diff.length) return `after call ${k} (${calls[k].name} ${calls[k].args.join(' ')}): ${diff.map((g) => `${g} is ${ours[k][g]} here, ${good[k][g]} in ${S.t.good.name}`).join('; ')}`;
      }
      return `the getters agree with ${S.t.good.name} after every call (addresses are left out: they differ by design)`;
    }
    case 'answer': {
      const t = d.tick;
      if (t === 0) throw Error('answer names the write of the instruction at this tick; you are at tick 0');
      d.seek(t - 1);
      const m = new S.Machine(S.t.program, refusingImports(S.t.program, 'the instruction at this tick is not a store'));
      m.state = d.state();
      const ev = m.step();
      d.seek(t);
      if (!ev.writes.length) throw Error(`the instruction at tick ${t} (${ev.op}) wrote nothing: answer must stand right after a store`);
      const w = ev.writes[0];
      S.answer = { func: ev.func, name: S.names[ev.func] ?? null, at: ev.at, address: w.address, size: w.size, tick: t };
      return `answer: function ${ev.func}${S.names[ev.func] ? ` (${S.names[ev.func]})` : ''}, instruction ${ev.at} (${ev.op}), address ${w.address}, tick ${t}`;
    }
    case 'cost': return `${S.cost.count} instructions run by your machine so far`;
    default: throw Error(`Unknown command ${verb}. Type help.`);
  }
}

// Run an investigation script: used by node lab.mjs investigate and the checks.
export async function runInvestigation(dir, rung, script, { echo = false } = {}) {
  const S = await openSession(dir, rung);
  for (const raw of script.split('\n')) {
    const text = raw.trim();
    if (!text || text.startsWith('#')) continue;
    if (text === 'quit') break;
    if (echo) console.log(`> ${text}`);
    const out = await command(S, text);
    if (echo && out) console.log(out);
  }
  return { answer: S.answer, replayed: S.cost.count };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, target, scriptPath] = process.argv.slice(2);
  if (!dir || !target) { console.error('Usage: node debug.mjs PROJECT TARGET [SCRIPT]'); process.exit(2); }
  try {
    const S = await openSession(resolve(dir), target);
    console.log(`${S.t.label}: ${S.t.recording.calls.length} calls, ${S.d.end} instructions. Type help for commands.`);
    if (scriptPath) {
      for (const raw of readFileSync(scriptPath, 'utf8').split('\n')) {
        const text = raw.trim();
        if (!text || text.startsWith('#')) continue;
        if (text === 'quit') break;
        console.log(`> ${text}`);
        // Stop at the first error, as lab.mjs investigate and the checks do.
        try { const out = await command(S, text); if (out) console.log(out); } catch (e) { console.log(`error: ${e.message}`); process.exitCode = 1; break; }
      }
    } else {
      // Commands from the keyboard or from piped input. The line iterator keeps lines
      // that arrive while a command runs, and ends at end of input (Ctrl-D) or Ctrl-C.
      // A command that fails prints its error, and the session carries on.
      const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'debug> ' });
      let open = true, waiting = false;   // waiting: a prompt is showing and no line has come yet
      rl.on('close', () => { open = false; if (waiting) process.stdout.write('\n'); waiting = false; });
      rl.on('SIGINT', () => rl.close());
      const ask = () => { if (open) { rl.prompt(); waiting = true; } };
      ask();
      for await (const text of rl) {
        waiting = false;
        // Piped input isn't echoed, so end the prompt's line before leaving.
        if (text.trim() === 'quit') { if (!process.stdin.isTTY) process.stdout.write('\n'); break; }
        try { const out = await command(S, text); if (out) console.log(out); } catch (e) { console.log(`error: ${e.message}`); }
        ask();
      }
      rl.close();
    }
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
