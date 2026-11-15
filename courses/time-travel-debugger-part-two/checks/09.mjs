// Unit 09: record and replay. Recordings here are made three ways: by your own
// machine (to check record), by Node's WebAssembly engine with a world your code
// cannot reach (to check replay), and, for firstDivergence, stored in
// fixtures/09/divergence.json with the tick where each tampered replay first has
// different memory. Those ticks were found when the course was built by stepping
// both replays in lockstep and comparing memory after every instruction.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, show, program as readProgram, wasmBytes, courseRoot, NOT_WRITTEN, CheckFailure, firstDifference, same, countSteps } from './harness.mjs';
import { makeWorld } from '../public/world.mjs';
import { hashMemory } from '../public/hash.mjs';
import { session, plan } from '../public/sessions.mjs';

export const title = 'Record and replay';

// ---------------------------------------------------------------- shared with tools/make-fixtures.mjs

// Record calls on Node's own engine: the recording a correct record() makes.
export async function nodeRecord(game, imports, calls) {
  const program = readProgram(game);
  const answers = [];
  const env = {};
  for (const im of program.imports) env[im.name] = (...args) => { const result = imports[im.name](...args); answers.push({ name: im.name, args, result }); return result; };
  const { instance } = await WebAssembly.instantiate(wasmBytes(`targets/${game}.wasm`), { env });
  const ex = instance.exports;
  const results = [], hashes = [];
  for (const c of calls) {
    const r = ex[c.name](...c.args);
    results.push(r === undefined ? null : r);
    hashes.push(hashMemory(new Uint8Array(ex.memory.buffer)));
  }
  return { format: 'ttd2-recording-1', program: program.name, sha256: program.sha256, calls: calls.map(c => ({ name: c.name, args: [...c.args] })), results, answers, hashes };
}

// A world no code outside this file can make: its server answers come from its own
// generator, and its sin and cos are a little off, so a replay that asks Math.sin
// itself, or any makeWorld, gets other answers than the recording holds.
export function privateWorld(seed) {
  let x = (seed * 2246822519 + 3) >>> 0 || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  return {
    sin: (v) => Math.sin(v) * (1 + 1 / 1024),
    cos: (v) => Math.cos(v) * (1 - 1 / 1024),
    server_round: () => Math.floor(next() * 7) - 3,
    server_wind: () => Math.fround((next() * 2 - 1) * 4.5),
  };
}

// Getter calls between the game's calls, so some results are numbers.
export function withGetters(calls, getters, every = 37) {
  const out = [];
  calls.forEach((c, k) => { out.push(c); if (k % every === every - 1) out.push({ name: getters[(k / every | 0) % getters.length], args: [] }); });
  return out;
}

// ---------------------------------------------------------------- helpers

let divergenceFixture = null;
const fixture = () => divergenceFixture ??= JSON.parse(readFileSync(join(courseRoot, 'checks', 'fixtures', '09', 'divergence.json'), 'utf8'));
const plural = (n, word) => `${Number(n).toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
const callText = (c) => `${c.name}(${c.args.join(', ')})`;
const LOB_GETTERS = ['r_px', 'r_power', 'r_wind_level', 'r_target_x', 'r_flying', 'r_angle', 'r_py', 'r_result'];
const LOB2_GETTERS = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5'];

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
const passThrough = (error) => error instanceof CheckFailure || String(error?.message ?? '').includes(NOT_WRITTEN);
function attempt(run, { checked, input, expected, workDir }) {
  try { return run(); } catch (error) {
    if (passThrough(error)) throw error;
    fail({ checked, input, observed: `your code threw ${error?.name ?? 'an error'}: ${String(error?.message ?? error).split('\n')[0]}${whereInWork(error, workDir)}`, expected });
  }
}
// Run fn expecting it to throw; returns the error, or null.
function throws(run) {
  try { run(); } catch (error) { if (passThrough(error)) throw error; return error; }
  return null;
}

// Numbers compare exactly, except that -0 and 0 are one number in JSON.
function jsonSame(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => jsonSame(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => jsonSame(a[k], b[k])); }
  return Object.is(a, b);
}
// The first place a value holds something JSON cannot carry, or null.
function notJson(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path} is ${value}, which JSON cannot hold`;
  if (value === undefined) return `${path} is undefined, which JSON drops or turns into null`;
  if (typeof value === 'bigint') return `${path} is a BigInt (${value}n), which JSON.stringify refuses`;
  if (typeof value === 'function' || typeof value === 'symbol') return `${path} is a ${typeof value}`;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return `${path} is a ${Object.prototype.toString.call(value).slice(8, -1)}, which JSON turns into an object of numbered keys; use a plain array`;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return `${path} is an instance of ${value.constructor?.name}, not a plain array`;
    for (let i = 0; i < value.length; i++) { if (!(i in value)) return `${path}[${i}] is a hole in the array`; const p = notJson(value[i], `${path}[${i}]`); if (p) return p; }
    return null;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return `${path} is a ${value.constructor?.name ?? 'class instance'}, not a plain object`;
  for (const [k, v] of Object.entries(value)) { const p = notJson(v, `${path}.${k}`); if (p) return p; }
  return null;
}

// Answers import calls from a recording, in order; stops at the first question the
// recording does not hold next. Counts instructions itself, so the tick it reports
// is the number of instructions run before the call instruction that asked.
class Stop extends Error {}
function expectedRun(Machine, program, recording, context) {
  let next = 0, ran = 0, k = 0, mismatch = null;
  const imports = {};
  for (const im of program.imports) imports[im.name] = (...args) => {
    const a = recording.answers[next];
    if (!a || a.name !== im.name || a.args.length !== args.length || a.args.some((x, i) => !Object.is(x, args[i]))) {
      mismatch = { tick: ran, call: k, asked: `${im.name}(${args.join(', ')})`, holds: a ? `${a.name}(${a.args.join(', ')})` : 'no more answers' };
      throw new Stop();
    }
    next++;
    return a.result;
  };
  const m = attempt(() => new Machine(program, imports), { checked: 'new Machine(program, imports)', expected: 'a machine', ...context });
  const ends = [];
  for (k = 0; k < recording.calls.length; k++) {
    const c = recording.calls[k];
    try {
      m.begin(c.name, c.args);
      while (m.running) { m.step(); ran++; }
    } catch (e) {
      if (e instanceof Stop || mismatch) return { mismatch, ends };
      if (passThrough(e)) throw e;
      fail({ checked: 'your machine runs the recording (needed to work out the expected ticks)', input: context.input, observed: `your machine threw ${e?.name}: ${String(e?.message).split('\n')[0]}${whereInWork(e, context.workDir)} in call ${k}, ${callText(c)}`, expected: 'the machine passes the checks of unit 08' });
    }
    ends.push(ran);
  }
  return { mismatch, ends };
}

function checkDivergence(error, want, { checked, input, workDir }) {
  if (!error) fail({ checked, input, observed: 'replay returned without throwing', expected: `an error whose divergence field is { tick: ${want.tick}, call: ${want.call}, reason }: ${want.why}` });
  const d = error.divergence;
  if (!d || typeof d !== 'object') fail({ checked, input, observed: `replay threw ${error?.name ?? 'Error'}: ${String(error?.message ?? error).split('\n')[0]}${whereInWork(error, workDir)}, with no divergence field`, expected: `an error whose divergence field is { tick: ${want.tick}, call: ${want.call}, reason }: ${want.why}` });
  const ours = { tick: d.tick, call: d.call };
  if (!same(ours, { tick: want.tick, call: want.call })) fail({ checked, input, observed: `divergence ${show({ ...ours, reason: d.reason })}`, expected: `tick ${want.tick} and call ${want.call}: ${want.why}`, diff: firstDifference(ours, { tick: want.tick, call: want.call }) });
  if (typeof d.reason !== 'string' || !d.reason.trim()) fail({ checked, input, observed: `divergence.reason is ${show(d.reason)}`, expected: 'a sentence saying what differed' });
}

function applyTamper(original, change) {
  const t = structuredClone(original);
  for (const [i, a] of change.answers ?? []) t.answers[i] = a;
  for (const [i, c] of change.calls ?? []) t.calls[i] = c;
  return t;
}

// ---------------------------------------------------------------- the cases

async function recordAndCompare({ fn, cls, workDir }, game, seed, mode, world) {
  const Machine = await cls('machine.mjs', 'Machine');
  const record = await fn('recorder.mjs', 'record');
  const program = readProgram(game);
  const calls = withGetters(session({ seed, mode, plan: plan({ seed, shots: 2, flight: 200 }) }), game === 'lob' ? LOB_GETTERS : LOB2_GETTERS);
  const input = `record(readProgram('${game}'), makeWorld(${world}).imports, calls), calls being session({ seed: ${seed}, mode: ${mode}, plan: plan({ seed: ${seed}, shots: 2, flight: 200 }) }) with a getter call after every 37th call: ${calls.length} calls`;
  // The same calls on your own Machine, noting every answer the world gives.
  const w = makeWorld(world);
  const answers = [];
  const noting = {};
  for (const [name, f] of Object.entries(w.imports)) noting[name] = (...args) => { const result = f(...args); answers.push({ name, args, result }); return result; };
  const m = attempt(() => new Machine(program, noting), { checked: 'new Machine', input, expected: 'a machine', workDir });
  const results = [], hashes = [];
  for (const c of calls) {
    const r = attempt(() => m.invoke(c.name, c.args), { checked: `your machine runs ${callText(c)}`, input, expected: 'the machine passes the checks of unit 08', workDir });
    results.push(r === undefined ? null : r);
    hashes.push(hashMemory(m.state.memory));
  }
  // Your record(), with a world that counts its answers.
  const w2 = makeWorld(world);
  let asked = 0;
  const counting = {};
  for (const [name, f] of Object.entries(w2.imports)) counting[name] = (...args) => { asked++; return f(...args); };
  const callsCopy = structuredClone(calls);
  const rec = attempt(() => record(program, counting, callsCopy), { checked: 'record(program, imports, calls)', input, expected: 'a recording', workDir });
  if (!rec || typeof rec !== 'object') fail({ checked: 'what record returns', input, observed: show(rec), expected: 'a recording object' });
  if (!same(callsCopy, calls)) fail({ checked: 'record leaves the calls it is given as they were', input, observed: 'the calls list changed', expected: 'unchanged: copy what you keep' });
  const head = { format: rec.format, program: rec.program, sha256: rec.sha256 };
  const wantHead = { format: 'ttd2-recording-1', program: program.name, sha256: program.sha256 };
  if (!same(head, wantHead)) fail({ checked: 'the recording\'s format, program and sha256', input, observed: show(head), expected: `${show(wantHead)}: the program's name and sha256 from its listing`, diff: firstDifference(head, wantHead) });
  for (const field of ['calls', 'results', 'answers', 'hashes']) if (!Array.isArray(rec[field])) fail({ checked: `recording.${field}`, input, observed: show(rec[field], 80), expected: 'an array' });
  const ourCalls = rec.calls.map(c => ({ name: c?.name, args: Array.isArray(c?.args) ? Array.from(c.args) : c?.args }));
  if (!same(ourCalls, calls)) fail({ checked: 'recording.calls: every call, in order', input, observed: `${plural(ourCalls.length, 'call')}`, expected: `the ${plural(calls.length, 'call')} given, each as { name, args }`, diff: firstDifference(ourCalls, calls) });
  if (!same(rec.results, results)) fail({ checked: 'recording.results: what each call returned', input, observed: show(rec.results, 120), expected: 'one entry per call: what invoke returned, or null when the function returns nothing', diff: firstDifference(rec.results, results) });
  const ourAnswers = rec.answers.map(a => ({ name: a?.name, args: Array.isArray(a?.args) ? Array.from(a.args) : a?.args, result: a?.result }));
  if (!jsonSame(ourAnswers, answers)) fail({ checked: 'recording.answers: every import call the game made, in order', input, observed: `${plural(ourAnswers.length, 'answer')}`, expected: `${plural(answers.length, 'answer')}, each { name, args, result }: the import's name, the arguments the game passed and what the world returned`, diff: firstDifference(ourAnswers, answers) });
  if (asked !== answers.length) fail({ checked: 'record asks the world once per import call', input, observed: `the world was asked ${plural(asked, 'time')}`, expected: `${answers.length}: run the calls once, with imports that pass each question to the world and note the answer` });
  if (!same(rec.hashes, hashes)) fail({ checked: 'recording.hashes: the memory hash after each call', input, observed: show(rec.hashes, 120), expected: 'one hashMemory(memory) per call, taken when the call has returned', diff: firstDifference(rec.hashes, hashes) });
}

export const cases = [
  {
    id: '09.record',
    title: 'record keeps every call, result, answer and memory hash',
    requirement: 'record(program, imports, calls) runs the calls once on a new machine and returns { format: \'ttd2-recording-1\', program, sha256, calls, results, answers, hashes }: the calls as given; what each returned (null for nothing); every import call as { name, args, result }, in order; and hashMemory of memory after each call. It asks the world exactly once per import call. Checked against the same calls run on your own Machine, for Lob in mode 9 and Lob II in mode 3, with getter calls among them.',
    timeLimitMs: 30000,
    async run(ctx) {
      await recordAndCompare(ctx, 'lob', 9101, 9, 811);
      await recordAndCompare(ctx, 'lob2', 9202, 3, 822);
    },
  },
  {
    id: '09.recording-json',
    title: 'A recording is plain JSON',
    requirement: 'The recording holds only plain objects, plain arrays, strings, finite numbers and null, so JSON.parse(JSON.stringify(recording)) equals it: no typed arrays, BigInts, undefined, Maps or class instances.',
    timeLimitMs: 20000,
    async run({ fn, workDir }) {
      const record = await fn('recorder.mjs', 'record');
      const program = readProgram('lob');
      const calls = withGetters(session({ seed: 9303, mode: 13, plan: plan({ seed: 9303, shots: 1, flight: 160 }) }), LOB_GETTERS, 23);
      const input = `record(readProgram('lob'), makeWorld(833).imports, calls), calls being session({ seed: 9303, mode: 13, ... }) with getter calls: ${calls.length} calls`;
      const rec = attempt(() => record(program, makeWorld(833).imports, calls), { checked: 'record', input, expected: 'a recording', workDir });
      const problem = notJson(rec, 'recording');
      if (problem) fail({ checked: 'the recording is plain JSON', input, observed: problem, expected: 'plain objects, plain arrays, strings, finite numbers and null only: lessons 10 to 13 and the lab save recordings to files and read them back' });
      const back = JSON.parse(JSON.stringify(rec));
      if (!jsonSame(back, rec)) fail({ checked: 'JSON.parse(JSON.stringify(recording)) equals the recording', input, observed: 'it differs', expected: 'the same recording', diff: firstDifference(back, rec) });
    },
  },
  {
    id: '09.replay',
    title: 'replay reproduces every result and memory hash from the recording alone',
    requirement: 'replay(program, recording) runs the recording\'s calls on a new machine whose imports answer from recording.answers, in order, and returns { machine, results, hashes } equal to the recording\'s results and hashes; the machine is the one it ran, at the end of the run. It uses no world: these recordings were made with answers no makeWorld and no Math.sin gives. It leaves the recording unchanged. Lob and Lob II, mode 1 (server wind).',
    timeLimitMs: 30000,
    async run({ fn, workDir }) {
      const replay = await fn('recorder.mjs', 'replay');
      for (const [game, seed, getters] of [['lob', 9404, LOB_GETTERS], ['lob2', 9505, LOB2_GETTERS]]) {
        const calls = withGetters(session({ seed, mode: 1, plan: plan({ seed, shots: 2, flight: 200 }) }), getters);
        const rec = await nodeRecord(game, privateWorld(seed), calls);
        const program = readProgram(game);
        const input = `replay(readProgram('${game}'), recording): a recording of ${plural(rec.calls.length, 'call')} and ${plural(rec.answers.length, 'answer')} (session({ seed: ${seed}, mode: 1, ... }) with getter calls), made by Node's engine with a world your code cannot make`;
        const copy = structuredClone(rec);
        const out = attempt(() => replay(program, rec), { checked: 'replay(program, recording)', input, expected: 'the recording replays without a divergence: answer each import call from recording.answers, in order, and never call a world, Math.sin or Math.cos yourself', workDir });
        if (!out || typeof out !== 'object') fail({ checked: 'what replay returns', input, observed: show(out), expected: '{ machine, results, hashes }' });
        if (!same(out.results, rec.results)) fail({ checked: 'the results replay returns', input, observed: show(out.results, 120), expected: 'the recording\'s results, one per call (null for nothing)', diff: firstDifference(out.results, rec.results) });
        if (!same(out.hashes, rec.hashes)) fail({ checked: 'the memory hashes replay returns', input, observed: show(out.hashes, 120), expected: 'the recording\'s hashes, one per call. A replay that asks a world or Math.sin itself gets other answers than this recording holds', diff: firstDifference(out.hashes, rec.hashes) });
        const memory = out.machine?.state?.memory;
        if (!memory || hashMemory(memory) !== rec.hashes[rec.hashes.length - 1]) fail({ checked: 'the machine replay returns', input, observed: memory ? 'its memory hash is not the recording\'s last hash' : `out.machine is ${show(out.machine, 60)}`, expected: 'the machine that ran the replay, standing at the end of the last call' });
        if (!same(rec, copy)) fail({ checked: 'replay leaves the recording unchanged', input, observed: 'the recording changed', expected: 'unchanged: the debugger replays one recording many times', diff: firstDifference(rec, copy) });
      }
    },
  },
  {
    id: '09.replay-questions',
    title: 'replay stops with a divergence when the game asks a question the recording does not hold next',
    requirement: 'When the next import call differs from the next answer in the recording (another import, other arguments, or no answers left), replay throws an error whose divergence field is { tick, call, reason }: tick is the number of instructions finished before the call instruction that asked (that instruction\'s own event would have tick + 1), call the index of the call in recording.calls, reason a sentence. This holds with check: false too.',
    timeLimitMs: 30000,
    async run({ fn, cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      const replay = await fn('recorder.mjs', 'replay');
      const lob = readProgram('lob'), lob2 = readProgram('lob2');
      const seed = 9606;
      const a = await nodeRecord('lob', privateWorld(1), session({ seed, mode: 1, plan: [['right', 4], ['fire'], ['frames', 150], ['new'], ['frames', 2]] }));
      const b = await nodeRecord('lob', privateWorld(2), session({ seed, mode: 1, plan: [['left', 3], ['up', 2], ['fire'], ['frames', 150], ['new'], ['frames', 2]] }));
      const c = await nodeRecord('lob', privateWorld(3), session({ seed, mode: 0, plan: [['fire'], ['frames', 20]] }));
      const d = await nodeRecord('lob2', privateWorld(4), withGetters(session({ seed: 9707, mode: 1, plan: plan({ seed: 9707, shots: 2, flight: 200 }) }), LOB2_GETTERS));
      const sins = d.answers.map((x, i) => [x, i]).filter(([x]) => x.name === 'sin').map(([, i]) => i);
      const edited = structuredClone(d);
      const j = sins[sins.length - 1];
      edited.answers[j].args = [edited.answers[j].args[0] * (1 + 2 ** -40)];
      const cut = structuredClone(a);
      cut.answers.length = Math.floor(a.answers.length * 0.6);
      // A shot asks cos(angle), then sin(angle): swap the two names and only the name differs.
      const swapped = structuredClone(a);
      const ci = swapped.answers.findIndex((x, i) => x.name === 'cos' && swapped.answers[i + 1]?.name === 'sin');
      [swapped.answers[ci].name, swapped.answers[ci + 1].name] = ['sin', 'cos'];
      const trials = [
        [lob, { ...a, answers: b.answers }, { check: false }, `a recording of lob mode 1 whose answers are those of another session of the same game (it aims elsewhere before it fires), replayed with { check: false }`],
        [lob, { ...a, answers: c.answers }, { check: false }, `a recording of lob mode 1 whose answers are those of a session in mode 0, which never asks server_round, replayed with { check: false }`],
        [lob2, edited, undefined, `a recording of lob2 mode 1 with its last sin answer's argument changed by one part in 2^40, replayed with the default check: true`],
        [lob, cut, undefined, `a recording of lob mode 1 with only the first ${cut.answers.length} of its ${a.answers.length} answers, replayed with the default check: true`],
        [lob, swapped, undefined, `a recording of lob mode 1 whose answers ${ci} and ${ci + 1}, cos(x) and sin(x) for the shot, have their names swapped (same argument), replayed with the default check: true`],
      ];
      for (const [program, recording, options, what] of trials) {
        const input = `replay(readProgram('${program.name}'), recording${options ? ', { check: false }' : ''}): ${what}`;
        const { mismatch } = expectedRun(Machine, program, recording, { input, workDir });
        if (!mismatch) fail({ checked: 'the check itself', input, observed: 'no question differed', expected: 'a difference (report this: it is a fault in the check)' });
        const error = throws(() => options ? replay(program, recording, options) : replay(program, recording));
        checkDivergence(error, { ...mismatch, why: `in call ${mismatch.call}, ${callText(recording.calls[mismatch.call])}, after ${plural(mismatch.tick, 'instruction')} the game asks ${mismatch.asked} but the recording's next answer is ${mismatch.holds}; tick is the number of instructions run before the call instruction that asked` }, { checked: 'the divergence replay reports for a question the recording does not hold next', input, workDir });
      }
    },
  },
  {
    id: '09.replay-check',
    title: 'With check: true, a result or memory hash that differs from the recording is a divergence; with check: false it is not',
    requirement: 'replay(program, recording) with the default check: true throws an error whose divergence field is { tick, call, reason } at the end of the first call whose result or memory hash differs from the recording: call is its index and tick the number of instructions run when it returned. With { check: false } the same recording replays to its end and returns the true results and hashes.',
    timeLimitMs: 30000,
    async run({ fn, cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      const replay = await fn('recorder.mjs', 'replay');
      const program = readProgram('lob');
      const seed = 9808;
      const rec = await nodeRecord('lob', privateWorld(seed), withGetters(session({ seed, mode: 1, plan: plan({ seed, shots: 2, flight: 200 }) }), LOB_GETTERS, 29));
      const getterAt = rec.calls.map((c, i) => [c, i]).filter(([c]) => c.name.startsWith('r_')).map(([, i]) => i);
      const k1 = Math.floor(rec.calls.length * 0.45), k2 = getterAt[Math.floor(getterAt.length * 0.7)];
      const badHash = structuredClone(rec);
      badHash.hashes[k1] = (badHash.hashes[k1][0] === '0' ? '1' : '0') + badHash.hashes[k1].slice(1);
      const badResult = structuredClone(rec);
      badResult.results[k2] = rec.results[k2] + 1;
      const { ends } = expectedRun(Machine, program, rec, { input: 'a recording of lob mode 1', workDir });
      const trials = [
        [badHash, k1, `the memory hash after call ${k1} (${callText(rec.calls[k1])}) changed in its first digit`],
        [badResult, k2, `the result of call ${k2} (${callText(rec.calls[k2])}) changed from ${rec.results[k2]} to ${badResult.results[k2]}`],
      ];
      for (const [recording, k, what] of trials) {
        const input = `replay(readProgram('lob'), recording), a recording of lob mode 1 (${plural(rec.calls.length, 'call')}) with ${what}`;
        checkDivergence(throws(() => replay(program, recording)), { tick: ends[k], call: k, why: `call ${k} is the first whose ${recording === badHash ? 'memory hash' : 'result'} differs from the recording, and ${plural(ends[k], 'instruction')} have run when it returns` }, { checked: 'the divergence replay reports with check: true', input, workDir });
        const out = attempt(() => replay(program, recording, { check: false }), { checked: 'replay(program, recording, { check: false })', input: input.replace('recording)', 'recording, { check: false })'), expected: 'the replay runs to its end: with check: false only a question the recording does not hold stops it', workDir });
        if (!same(out?.hashes, rec.hashes) || !same(out?.results, rec.results)) fail({ checked: 'what replay returns with check: false', input, observed: `results ${show(out?.results, 60)}, hashes ${show(out?.hashes, 60)}`, expected: 'the results and hashes the calls really give, which are the untampered recording\'s', diff: firstDifference({ results: out?.results, hashes: out?.hashes }, { results: rec.results, hashes: rec.hashes }) });
      }
    },
  },
  {
    id: '09.divergence',
    title: 'firstDivergence finds the exact tick where a tampered replay first has different memory',
    requirement: 'For tampered copies of recordings the lessons never use (a server_wind answer changed early or late, a server_round answer changed in game_init or later, a cos answer changed, a key press changed, a shot turned into a key press), firstDivergence(program, original, tampered) returns the smallest tick after which the tampered replay\'s memory differs from the original\'s: the tick of the first instruction whose writes leave the two memories different.',
    timeLimitMs: 60000,
    async run(ctx) { await runDivergence(ctx, (t) => t.expected !== null); },
  },
  {
    id: '09.divergence-none',
    title: 'firstDivergence returns null when memory never differs, even if an answer does',
    requirement: 'firstDivergence returns null for an untampered copy, for an answer replaced by the same value, and for a sin answer changed by less than a 32-bit float can show (the game rounds it to the same f32, so memory never differs).',
    timeLimitMs: 40000,
    async run(ctx) { await runDivergence(ctx, (t) => t.expected === null); },
  },
  // The budgets (fixtures/09/divergence.json, made by tools/make-fixtures.mjs 09), counted
  // as calls to step(); each budget is 3 x the reference, rounded up to a thousand:
  //
  //   tamper (late server_wind)  run      tick     reference  lockstep  bisect calls  bisect ticks  budget
  //   lob-60601  mode 1          587,064  448,755  453,696    897,510   5,330,897     18,682,516    1,362,000
  //   lob-70702  mode 11         440,283  335,559  341,349    671,118   3,709,607     13,991,581    1,025,000
  //   lob2-80803 mode 5          458,591  349,976  355,744    699,952   3,902,365     14,581,669    1,068,000
  //
  // reference: replay the tampered recording once, compare each call's memory hash with the
  // original's, then bisect inside the first call that differs from a copy of its starting
  // state. lockstep: step both recordings side by side and compare memory after every
  // instruction (2 x the tick; passes). bisect calls: bisect over call indexes, replaying the
  // tampered recording from the start for each probe (fails, about 4 x the budget). bisect
  // ticks: bisect over ticks, replaying both recordings from the start for every probe
  // (fails, about 14 x the budget). Measured 2026-11-13.
  {
    id: '09.divergence-budget',
    title: 'firstDivergence replays about as much as one replay of the run, not a bisection from the start',
    requirement: 'On three late tampers, firstDivergence runs at most the budget in instructions (counted as calls to your Machine\'s step). The budget is three times what the worked solution for this course runs: enough to replay the tampered recording once to the call whose hash differs and then search inside that call from a saved state, or to step both recordings side by side once; far too little to bisect the whole run, replaying both recordings from the start for every probe (about 40 replays\' worth).',
    timeLimitMs: 60000,
    async run({ fn, cls, workDir }) {
      const Machine = await cls('machine.mjs', 'Machine');
      const firstDivergence = await fn('recorder.mjs', 'firstDivergence');
      const counter = countSteps(Machine);
      const fx = fixture();
      for (const t of fx.tampers.filter(x => x.budget)) {
        const original = fx.recordings[t.recording];
        const program = readProgram(original.program);
        const tampered = applyTamper(original, t.change);
        const input = `firstDivergence(readProgram('${original.program}'), original, tampered): ${fx.about[t.recording]}; tampered: ${t.what}`;
        counter.reset();
        const tick = attempt(() => firstDivergence(program, original, tampered), { checked: 'firstDivergence', input, expected: `tick ${t.expected}`, workDir });
        const n = counter.count;
        if (tick !== t.expected) fail({ checked: 'what firstDivergence returns', input, observed: show(tick), expected: `${t.expected} (09.divergence checks the ticks)` });
        if (n < t.expected) fail({ checked: 'the instructions firstDivergence runs are counted', input, observed: `${plural(n, 'call')} to step() on the Machine class from your machine.mjs`, expected: `at least ${t.expected.toLocaleString('en-US')}: memory after ${t.expected.toLocaleString('en-US')} instructions cannot be known without running them. Make your recorder use the Machine it imports from ./machine.mjs, and run every instruction through step()` });
        if (n > t.budget) fail({ checked: 'how many instructions firstDivergence runs', input, observed: plural(n, 'instruction'), expected: `at most ${t.budget.toLocaleString('en-US')}. The run is ${plural(t.run, 'instruction')} long and the memory first differs at tick ${t.expected.toLocaleString('en-US')}. The recording's hashes say which call first ends with different memory after one replay of the tampered recording; inside that call, search from a copy of the state at its start instead of replaying from tick 0` });
      }
    },
  },
];

async function runDivergence({ fn, workDir }, which) {
  const firstDivergence = await fn('recorder.mjs', 'firstDivergence');
  const fx = fixture();
  for (const t of fx.tampers.filter(which)) {
    const original = fx.recordings[t.recording];
    const program = readProgram(original.program);
    const tampered = applyTamper(original, t.change);
    const copies = [structuredClone(original), structuredClone(tampered)];
    const input = `firstDivergence(readProgram('${original.program}'), original, tampered): ${fx.about[t.recording]}; tampered: ${t.what}`;
    const tick = attempt(() => firstDivergence(program, original, tampered), { checked: 'firstDivergence(program, original, tampered)', input, expected: t.expected === null ? 'null' : `tick ${t.expected}`, workDir });
    if (tick !== t.expected) {
      const near = typeof tick === 'number' && t.expected !== null && Math.abs(tick - t.expected) <= 2;
      fail({
        checked: 'the tick firstDivergence returns', input, observed: show(tick),
        expected: t.expected === null
          ? `null: ${t.why}`
          : `${t.expected}: ${t.why}${near ? '. The tick is that of the instruction whose writes first leave the memories different, as its event says: memory after that many instructions differs, after one fewer it does not' : ''}`,
      });
    }
    if (!same(original, copies[0]) || !same(tampered, copies[1])) fail({ checked: 'firstDivergence leaves both recordings unchanged', input, observed: 'a recording changed', expected: 'unchanged' });
  }
}
