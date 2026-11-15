#!/usr/bin/env node
// The lab for part two. Run `node lab.mjs` with no arguments for the commands.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runUnit, UNITS, listCases } from './checks/run.mjs';
import { readProgram, loadProgram } from './public/program.mjs';
import { availableParallelism } from 'node:os';
import { makeWorld } from './public/world.mjs';
import { hashMemory } from './public/hash.mjs';
import { session, plan } from './public/sessions.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'course.json'), 'utf8'));
const sha = (x) => createHash('sha256').update(x).digest('hex');
const say = (s = '') => console.log(s);

const USAGE = `Usage: node lab.mjs COMMAND ...
  start PROJECT                     make your project folder with the starter files
  check PROJECT NN|all [--help-used TEXT]
                                    run the checks of unit NN (08 to 13) on your files
  status PROJECT                    list your saved check attempts and the predictions you
                                    committed, and the questions still waiting for one
  question ID                       show a prediction question (IDs are in the lessons)
  predict PROJECT ID ANSWER [--help-used TEXT]
                                    commit an answer before reading on, then see the reason
  agree PROJECT [--game lob|lob2] [--seed N] [--mode M]
                                    run your machine beside Node's WebAssembly engine
  wall PROJECT [--part-one FILE] [--steps N]
                                    measure part one's debugger on the real game
  record PROJECT --out FILE [--game lob] [--seed 5] [--mode 1] [--shots 2] [--world 42]
                                    record a game with your record() and save the recording
  replay PROJECT FILE               replay a recording with your replay()
  tamper FILE --out FILE (--answer K --add X | --answer K --arg X | --call K --key CODE)
                                    copy a recording with one answer's result or argument,
                                    or one key press, changed (numbered from 0)
  diverge PROJECT ORIGINAL TAMPERED find where they part with your firstDivergence()
  decoder FILE                      check your own Sightline decoder against the listings
  ladder                            list the capstone builds, their symptoms and budgets
  investigate PROJECT N             run investigations/N.txt and show its answer and cost`;

function project(dir) {
  const p = resolve(dir);
  if (!existsSync(join(p, 'PROJECT.json'))) throw Error(`${dir} is not a project folder: run node lab.mjs start ${dir} first`);
  return p;
}

function start(dir) {
  const target = resolve(dir);
  mkdirSync(target); // refuses an existing folder, so a project is never overwritten
  for (const f of config.workFiles) {
    mkdirSync(dirname(join(target, f)), { recursive: true });
    copyFileSync(join(root, 'starter', f), join(target, f));
  }
  writeFileSync(join(target, 'PROJECT.json'), JSON.stringify({ course: config.id, started: new Date().toISOString() }, null, 2) + '\n');
  writeFileSync(join(target, 'report.md'), '# Investigation notes\n\n## Predictions\n\n## Evidence\n\n## Explanations\n\n## Help used\n');
  say(`Created ${dir} with ${config.workFiles.join(', ')}.`);
  say(`Read lessons/08.md, then run: node lab.mjs check ${dir} 08`);
  say('The untouched starter fails every check with "not written yet".');
}

function line(r) {
  if (r.pass) return `PASS ${r.id}`;
  if (r.kind === 'timeout') return `FAIL ${r.id}: did not finish within ${r.limitMs / 1000} s`;
  if (r.kind === 'not-written') return `FAIL ${r.id}: ${r.message}`;
  if (r.kind === 'failure') return `FAIL ${r.id}: ${r.fields.checked ?? r.title}`;
  return `FAIL ${r.id}: ${r.message}${r.where ? ` (${r.where})` : ''}`;
}

async function check(dir, unit, help) {
  const p = project(dir);
  const units = unit === 'all' ? UNITS : [unit];
  if (!units.every((u) => UNITS.includes(u))) throw Error(`Choose a unit: ${UNITS.join(', ')} or all`);
  const attempt = join(p, 'attempts', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
  mkdirSync(attempt, { recursive: true });
  for (const f of config.workFiles) if (existsSync(join(p, f))) { mkdirSync(dirname(join(attempt, f)), { recursive: true }); copyFileSync(join(p, f), join(attempt, f)); }
  let allPass = true;
  const saved = [];
  for (const u of units) {
    const { title } = await listCases(u);
    say(`Unit ${u}: ${title}`);
    const report = await runUnit(p, u, { jobs: Math.min(4, availableParallelism()) });
    for (const r of report.results) {
      say(line(r));
      if (!r.pass && r.requirement) say(`     requirement: ${r.requirement}`);
      if (!r.pass && r.kind === 'failure') {
        const f = r.fields;
        if (f.input) say(`     input:    ${f.input}`);
        if (f.observed) say(`     yours:    ${f.observed}`);
        if (f.expected) say(`     required: ${f.expected}`);
        if (f.diff) say(`     first difference: ${f.diff}`);
      }
      if (!r.pass && r.reread) say(`     read ${r.reread}`);
    }
    const passed = report.results.filter((r) => r.pass).length;
    say(`${passed} of ${report.results.length} checks pass in unit ${u}.\n`);
    allPass &&= report.pass;
    saved.push({ unit: u, results: report.results.map(({ id, pass, kind, fields, message, ms, requirement }) => ({ id, pass, kind, requirement, fields, message, ms })) });
  }
  writeFileSync(join(attempt, 'receipt.json'), JSON.stringify({ course: config.id, help_used: help, units: saved, at: new Date().toISOString() }, null, 2) + '\n');
  if (units.length > 1) say(allPass ? `All ${units.length} units pass.` : 'Some checks fail.');
  say(`Help used (--help-used): ${help}`);
  say(`Saved this attempt in ${attempt}. A pass covers these cases only.`);
  process.exitCode = allPass ? 0 : 1;
}

// Every prediction saved under attempts/, oldest first.
function predictions(p) {
  const folder = join(p, 'attempts');
  if (!existsSync(folder)) return [];
  return readdirSync(folder).sort().map((name) => join(folder, name, 'prediction.json')).filter((f) => existsSync(f)).map((f) => JSON.parse(readFileSync(f, 'utf8')));
}

// The questions the lessons ask, in the order a reader meets them.
function askedInOrder() {
  const asked = Object.entries(practice()).filter(([, q]) => !q.retryOnly).map(([id, q]) => {
    const file = join(root, 'lessons', `${q.lesson}.md`);
    const at = existsSync(file) ? readFileSync(file, 'utf8').indexOf(`predict project ${id} `) : -1;
    return { id, lesson: q.lesson, at: at < 0 ? Infinity : at };
  });
  return asked.sort((a, b) => a.lesson.localeCompare(b.lesson) || a.at - b.at).map((x) => x.id);
}

function status(dir) {
  const p = project(dir);
  const folder = join(p, 'attempts');
  const names = existsSync(folder) ? readdirSync(folder).sort() : [];
  say('Check attempts:');
  let checks = 0;
  for (const name of names) {
    const file = join(folder, name, 'receipt.json');
    if (!existsSync(file)) continue;
    const r = JSON.parse(readFileSync(file, 'utf8'));
    for (const u of r.units) { say(`  ${name} unit ${u.unit}: ${u.results.filter((x) => x.pass).length} of ${u.results.length} pass (help used: ${r.help_used ?? 'not declared'})`); checks++; }
  }
  if (!checks) say('  none yet');
  const committed = predictions(p);
  const items = practice();
  // A question can be replaced by a new version; an answer to an earlier version stays in the
  // record, marked as such, and doesn't count as an answer to the current one.
  const current = (x) => (x.version ?? 1) === (items[x.id]?.version ?? 1);
  say('Predictions committed:');
  for (const x of committed) say(`  ${x.id}: ${current(x) ? '' : '(an earlier version of this question) '}${x.correct ? 'right' : 'wrong'}, answer ${x.answer} (help used: ${x.help_used ?? 'not declared'})`);
  if (!committed.length) say('  none yet');
  const done = new Set(committed.filter(current).map((x) => x.id));
  const waiting = askedInOrder().filter((id) => !done.has(id));
  say(waiting.length ? `Asked in the lessons, not committed yet: ${waiting.join(', ')}` : 'Every question the lessons ask has a committed answer.');
  // practice-10: a question missed with no fresh case left in the course is asked again later.
  // Predictions are in time order, so the map keeps each question's latest answer.
  const latest = new Map(committed.filter(current).map((x) => [x.id, x]));
  const due = [...latest.values()].filter((x) => !x.correct && !items[x.id]?.retry).map((x) => x.id);
  if (due.length) say(`Due for another try, after your next lesson: ${due.join(', ')}. Ask each with node lab.mjs question ID, then commit it again.`);
}

const practice = () => JSON.parse(readFileSync(join(root, 'practice.json'), 'utf8'));
function item(id) {
  const q = practice()[id];
  if (!q) throw Error(`Unknown question ${id}. The lessons name each one.`);
  return q;
}
function normal(a) { return String(a).trim().toLowerCase().replace(/\s+/g, ' '); }
function predict(dir, id, answer, help) {
  const p = project(dir);
  const q = item(id);
  if (typeof answer !== 'string' || !answer.trim()) throw Error(`Give an answer: node lab.mjs predict ${dir} ${id} ANSWER`);
  const accepted = [q.expected, ...(q.accept ?? [])].map(normal);
  const correct = accepted.includes(normal(answer));
  const earlier = predictions(p).filter((x) => x.id === id && (x.version ?? 1) === (q.version ?? 1));
  const record = { kind: 'prediction', id, version: q.version, question: q.question, answer, help_used: help, correct, expected: q.expected, at: new Date().toISOString() };
  const folder = join(p, 'attempts', `${new Date().toISOString().replaceAll(':', '-')}-${id}`);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'prediction.json'), JSON.stringify(record, null, 2) + '\n');
  say(`Your answer: ${answer}`);
  say(`Help used (--help-used): ${help}`);
  if (earlier.length) say(`You committed ${id} before, answering ${earlier.map((x) => `${x.answer} (${x.correct ? 'right' : 'wrong'})`).join(' and ')}. This answer is saved as well.`);
  say(correct ? 'Correct.' : `Not this time. The answer is ${q.expected}.`);
  const wrong = (q.wrong ?? []).find((w) => normal(w.answer) === normal(answer));
  say(wrong ? wrong.feedback : q.reason);
  // A re-ask sits in a later lesson's list of earlier ideas; the idea is taught where its original is.
  const home = q.variantOf ? item(q.variantOf) : q;
  if (!correct && home.section) say(q.retry && q.retry !== id
    ? `Read lesson ${home.lesson}, "${home.section}", then try a fresh case of the same idea: node lab.mjs question ${q.retry}`
    : `Read lesson ${home.lesson}, "${home.section}". The course has no other case of this idea, so ask this one again after your next lesson: node lab.mjs status project lists it as due, and node lab.mjs question ${id} shows it.`);
}

// ------------------------------------------------------------------ agree

async function learnerMachine(p) {
  const mod = await import(pathToFileURL(join(p, 'machine.mjs')).href);
  if (typeof mod.Machine !== 'function') throw Error(`${join(p, 'machine.mjs')} exports no Machine class`);
  return mod.Machine;
}

async function agree(dir, opts) {
  const p = project(dir);
  const Machine = await learnerMachine(p);
  const game = opts.game ?? 'lob';
  const seed = Number(opts.seed ?? 11), mode = Number(opts.mode ?? 1);
  const program = readProgram(game);
  const calls = session({ seed, mode, plan: plan({ seed, shots: 3 }) });
  const w1 = makeWorld(seed + 100), w2 = makeWorld(seed + 100);
  const m = new Machine(program, w1.imports);
  const { instance } = await WebAssembly.instantiate(readFileSync(join(root, 'targets', `${game}.wasm`)), { env: w2.imports });
  const getters = program.exports.filter((e) => e.kind === 'func' && !e.name.startsWith('game_')).map((e) => e.name);
  const started = performance.now();
  for (let k = 0; k < calls.length; k++) {
    const { name, args } = calls[k];
    const a = m.invoke(name, args), b = instance.exports[name](...args);
    if (!Object.is(a ?? null, b ?? null)) return say(`Call ${k} (${name}): yours returned ${a}, Node's engine ${b}.`);
    if (hashMemory(m.state.memory) !== hashMemory(new Uint8Array(instance.exports.memory.buffer))) return say(`Memory differs after call ${k} (${name} ${args.join(' ')}). Compare the bytes with a watch on the write that differs.`);
    for (const g of getters) {
      const x = m.invoke(g, []), y = instance.exports[g]();
      if (!Object.is(x, y)) return say(`After call ${k} (${name}), ${g} returns ${x} on yours and ${y} on Node's engine.`);
    }
  }
  const ms = performance.now() - started;
  say(`${game} seed ${seed} mode ${mode}: your machine and Node's engine agree after every one of ${calls.length} calls`);
  say(`(return values, ${getters.length} getters and the memory hash each time). Your machine ran ${m.state.tick} instructions in ${(ms / 1000).toFixed(2)} s.`);
}

// ------------------------------------------------------------------ wall

async function wall(dir, opts) {
  const p = project(dir);
  const Machine = await learnerMachine(p);
  const partOne = opts['part-one'] ? resolve(opts['part-one']) : join(root, 'fallback', 'part-one-debugger.mjs');
  if (!existsSync(partOne)) throw Error(`no part-one debugger at ${partOne}`);
  const steps = Number(opts.steps ?? 20000);
  const work = join(p, '.wall');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  copyFileSync(join(root, 'public', 'part-one-vm.mjs'), join(work, 'vm.mjs'));
  copyFileSync(partOne, join(work, 'debugger.mjs'));
  const { Debugger } = await import(pathToFileURL(join(work, 'debugger.mjs')).href);
  const program = readProgram('lob');
  const calls = session({ seed: 3, mode: 0, plan: plan({ seed: 3, shots: 3 }) });
  // Mode 0 asks only sin and cos, whose answers depend on their arguments alone,
  // so part one's debugger can run any stretch of the game again by itself.
  const imports = makeWorld(1).imports;

  let t = performance.now();
  const plain = new Machine(program, imports);
  for (const c of calls) plain.invoke(c.name, c.args);
  const plainMs = performance.now() - t;
  const total = plain.state.tick;

  const s = { Machine, program, imports, calls, length: Math.max(...program.functions.map((f) => f.code.length)) };
  const d = new Debugger(s);
  const bytes = structuredClone(d.inspect()).machine.memory.byteLength;
  t = performance.now();
  let n = 0;
  for (; n < steps; n++) d.step();
  const stepMs = (performance.now() - t) / n;
  const plainStepMs = plainMs / total;

  // Part one's reverseFind replays from the nearest checkpoint for every earlier
  // tick it tries. Time one real search: on a fresh debugger, checkpoint where
  // game_init ends (its first 61,000 or so instructions only clear memory),
  // step 3,000 more and ask for the byte value one write about 30 ticks back replaced.
  const initMachine = new Machine(program, imports);
  initMachine.invoke(calls[0].name, calls[0].args);
  const init = initMachine.state.tick;
  const d2 = new Debugger(s);
  for (let k = 0; k < init; k++) d2.step();
  d2.checkpoint('after game_init');
  for (let k = 0; k < 3000; k++) d2.step();
  const now = init + 3000;
  const write = d2.trace().filter((e) => e.tick <= now - 30 && e.writes.some((w) => (w.before & 255) !== (w.after & 255))).at(-1);
  if (!write) throw Error(`No write changed a byte between tick ${init} and tick ${now - 30}, so there is no value to search back for.`);
  const w = write.writes.find((x) => (x.before & 255) !== (x.after & 255));
  const address = w.address, equals = w.before & 255;
  t = performance.now();
  const found = d2.reverseFind({ kind: 'mem', address, equals });
  const searchMs = performance.now() - t;

  const day = (ms) => ms < 1000 ? `${ms.toFixed(0)} ms` : ms < 120000 ? `${(ms / 1000).toFixed(1)} s` : ms < 7200000 ? `${(ms / 60000).toFixed(0)} min` : ms < 172800000 ? `${(ms / 3600000).toFixed(1)} hours` : `${(ms / 86400000).toFixed(0)} days`;
  // One question asked at the end of the run whose answer lies 1,000 ticks back:
  // part one tries 1,000 earlier ticks and replays each from tick 0.
  const questionSteps = 1000 * total;
  const result = {
    run: { calls: calls.length, instructions: total },
    copy_bytes_per_step: bytes,
    microseconds_per_step_with_copy: +(stepMs * 1000).toFixed(2),
    microseconds_per_step_machine_alone: +(plainStepMs * 1000).toFixed(3),
    slowdown: +(stepMs / plainStepMs).toFixed(0),
    one_pass_with_copies_ms: +(stepMs * total).toFixed(0),
    one_pass_machine_alone_ms: +plainMs.toFixed(0),
    reverse_find: { from_tick: now, checkpoint_at: init, found, ticks_back: found === null ? null : now - found, ms: +searchMs.toFixed(0) },
    question_1000_back_at_end_ms: +(questionSteps * stepMs).toFixed(0),
    part_one: partOne === join(root, 'fallback', 'part-one-debugger.mjs') ? 'fallback' : partOne,
  };
  writeFileSync(join(p, 'wall.json'), JSON.stringify(result, null, 2) + '\n');
  say(`Part one's debugger (${result.part_one === 'fallback' ? 'the supplied fallback' : basename(partOne)}) on your machine, Lob seed 3 mode 0:`);
  say(`  the run: ${calls.length} calls, ${total} instructions; your machine alone runs it in ${day(plainMs)}`);
  say(`  every step copies the whole state: ${bytes} bytes of memory and the rest`);
  say(`  measured over ${n} steps: ${(stepMs * 1000).toFixed(1)} microseconds a step, against ${(plainStepMs * 1000).toFixed(2)} for your machine alone (${result.slowdown} times slower)`);
  say(`  one pass over the whole run with copies: ${day(stepMs * total)}`);
  say(found === null
    ? `  one reverseFind from tick ${now}, with a checkpoint at tick ${init}: ${day(searchMs)}, and it found no tick`
    : `  one reverseFind from tick ${now}, with a checkpoint at tick ${init}, for a value ${now - found} ticks back: ${day(searchMs)} (it found tick ${found})`);
  say(`  the same kind of question at the end of the run, answer 1,000 ticks back: about ${day(questionSteps * stepMs)}`);
  say(`Saved ${join(p, 'wall.json')}.`);
}

// ------------------------------------------------------------------ record and replay

async function learnerRecorder(p) {
  const Machine = await learnerMachine(p);
  const proto = Machine.prototype;
  if (!proto.__counted) {
    const original = proto.step;
    const c = { count: 0, reset() { this.count = 0; } };
    proto.step = function (...args) { c.count++; return original.apply(this, args); };
    Object.defineProperty(proto, '__counted', { value: c });
  }
  const rec = await import(pathToFileURL(join(p, 'recorder.mjs')).href);
  return { ...rec, cost: proto.__counted };
}

async function recordCmd(dir, o) {
  const p = project(dir);
  if (!o.out) throw Error('Name the file to write: --out FILE');
  const game = o.game ?? 'lob', seed = Number(o.seed ?? 5), mode = Number(o.mode ?? 1), shots = Number(o.shots ?? 2), worldSeed = Number(o.world ?? 42);
  const { record } = await learnerRecorder(p);
  const calls = session({ seed, mode, plan: plan({ seed, shots }) });
  const recording = record(readProgram(game), makeWorld(worldSeed).imports, calls);
  writeFileSync(resolve(o.out), JSON.stringify(recording) + '\n');
  const kinds = {};
  for (const a of recording.answers ?? []) kinds[a.name] = (kinds[a.name] ?? 0) + 1;
  say(`Recorded ${game} seed ${seed} mode ${mode}, ${shots} shots, world ${worldSeed}: ${recording.calls?.length} calls, ${recording.answers?.length} answers (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}).`);
  say(`Wrote ${o.out}, ${JSON.stringify(recording).length} bytes.`);
}

async function replayCmd(dir, file) {
  const p = project(dir);
  const { replay, cost } = await learnerRecorder(p);
  const recording = JSON.parse(readFileSync(resolve(file), 'utf8'));
  cost.reset();
  try {
    const r = replay(readProgram(recording.program), recording);
    say(`Replayed ${recording.calls.length} calls without the world: every result and memory hash matches the recording (${cost.count} instructions).`);
    return r;
  } catch (e) {
    if (e.divergence) say(`The replay left its recording at tick ${e.divergence.tick}, call ${e.divergence.call}: ${e.divergence.reason}`);
    else throw e;
  }
}

function tamperCmd(file, o) {
  if (!o.out) throw Error('Name the file to write: --out FILE');
  const r = JSON.parse(readFileSync(resolve(file), 'utf8'));
  if (o.answer !== undefined) {
    const a = r.answers[Number(o.answer)];
    if (!a) throw Error(`The recording has ${r.answers.length} answers, numbered from 0.`);
    if (o.arg !== undefined) {
      if (!a.args.length) throw Error(`Answer ${o.answer} (${a.name}) has no argument to change.`);
      const before = a.args[0];
      a.args[0] = a.args[0] + Number(o.arg);
      say(`Answer ${o.answer} (${a.name}) now says it was asked ${a.name}(${a.args[0]}), not ${a.name}(${before}).`);
    } else {
      const before = a.result;
      a.result = Math.fround(a.result + Number(o.add ?? 0.25));
      say(`Answer ${o.answer} (${a.name}) changed from ${before} to ${a.result}.`);
    }
  } else if (o.call !== undefined) {
    const c = r.calls[Number(o.call)];
    if (!c || c.name !== 'game_key') throw Error(`Call ${o.call} is not a key press.`);
    say(`Call ${o.call} changed from key ${c.args[0]} to key ${o.key}.`);
    c.args = [Number(o.key)];
  } else throw Error('Say what to change: --answer K --add X, or --call K --key CODE');
  writeFileSync(resolve(o.out), JSON.stringify(r) + '\n');
  say(`Wrote ${o.out}. Its hashes are still the original's.`);
}

async function divergeCmd(dir, a, b) {
  const p = project(dir);
  const { firstDivergence, cost } = await learnerRecorder(p);
  const original = JSON.parse(readFileSync(resolve(a), 'utf8')), tampered = JSON.parse(readFileSync(resolve(b), 'utf8'));
  cost.reset();
  const t = firstDivergence(readProgram(original.program), original, tampered);
  say(t === null ? 'The two replays never differ.' : `Memory first differs after tick ${t}.`);
  say(`Your firstDivergence ran ${cost.count} instructions.`);
}

// ------------------------------------------------------------------ decoder

async function decoder(file) {
  if (!file) throw Error('Name your decoder: node lab.mjs decoder FILE');
  if (!existsSync(resolve(file)) || !statSync(resolve(file)).isFile()) throw Error(`no decoder at ${resolve(file)}`);
  const mod = await import(pathToFileURL(resolve(file)).href);
  if (typeof mod.parseModule !== 'function' || typeof mod.decode !== 'function') throw Error(`${file} must export parseModule(bytes) and decode(mod, index), as Sightline's wasm.mjs does`);
  const norm = (v) => typeof v === 'bigint' ? `${v}n` : Array.isArray(v) ? v.map(norm) : v;
  for (const game of ['lob', 'lob2']) {
    const program = JSON.parse(readFileSync(join(root, 'programs', `${game}.json`), 'utf8'));
    const m = mod.parseModule(new Uint8Array(readFileSync(join(root, 'targets', `${game}.wasm`))));
    let compared = 0;
    for (const f of program.functions) {
      const ours = f.code.map((ins, k) => ({ offset: f.offsets[k], code: ins }));
      const theirs = mod.decode(m, f.index).map((i) => ({ offset: i.offset, code: [i.op, ...norm(i.imm)] }));
      for (let k = 0; k < Math.max(ours.length, theirs.length); k++) {
        if (JSON.stringify(ours[k]) !== JSON.stringify(theirs[k])) {
          return say(`${game}: function ${f.index}, instruction ${k}: your decoder gives ${JSON.stringify(theirs[k])}, the listing has ${JSON.stringify(ours[k])}.`);
        }
        compared++;
      }
    }
    say(`${game}: your decoder gives the same ${compared} instructions (name, immediates and file position) as programs/${game}.json.`);
  }
  say('Your listings and the supplied ones are the same, so nothing else changes: keep using programs/*.json.');
}

// ------------------------------------------------------------------ ladder

function ladder() {
  const rungs = JSON.parse(readFileSync(join(root, 'ladder.json'), 'utf8'));
  for (const r of rungs) {
    say(`${r.title}: ${r.wasm}, recording ${r.recording}`);
    say(`  ${r.symptom}`);
    say(`  replay budget: ${r.budget ?? 'not set'} instructions\n`);
  }
  say('Write your investigation in investigations/N.txt and run node lab.mjs investigate PROJECT N.');
}

async function investigate(dir, n) {
  const p = project(dir);
  const { runInvestigation } = await import(pathToFileURL(join(root, 'debug.mjs')).href);
  const rungs = JSON.parse(readFileSync(join(root, 'ladder.json'), 'utf8'));
  const rung = rungs.find((r) => String(r.n) === String(n));
  if (!rung) throw Error(`No build ${n}; node lab.mjs ladder lists them.`);
  const script = join(p, 'investigations', `${n}.txt`);
  if (!existsSync(script)) throw Error(`Write ${script} first: one debugger command per line.`);
  const r = await runInvestigation(p, rung, readFileSync(script, 'utf8'), { echo: true });
  say(`\nInstructions replayed: ${r.replayed}${rung.budget ? ` of a budget of ${rung.budget}` : ''}.`);
  say(r.answer ? `Your answer: function ${r.answer.func}${r.answer.name ? ` (${r.answer.name})` : ''}, instruction ${r.answer.at}, address ${r.answer.address}, tick ${r.answer.tick}.` : 'The script gave no answer: end it with the answer command.');
}

// ------------------------------------------------------------------ main

function options(rest) {
  const o = {}, plain = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      if (i + 1 >= rest.length) throw Error(`${rest[i]} needs a value after it.`);
      o[rest[i].slice(2)] = rest[i + 1]; i++;
    } else plain.push(rest[i]);
  }
  return { o, plain };
}

const [verb, ...rest] = process.argv.slice(2);
try {
  const { o, plain } = options(rest);
  if (!verb) say(USAGE);
  else if (verb === 'start') start(plain[0] ?? (() => { throw Error('Name a new folder: node lab.mjs start project'); })());
  else if (verb === 'check') await check(plain[0], plain[1], o['help-used'] ?? 'not declared');
  else if (verb === 'status') status(plain[0]);
  else if (verb === 'question') { const q = item(plain[0]); say(q.question); say(`Answer format: ${q.format}`); say(`Commit with: node lab.mjs predict PROJECT ${plain[0]} ANSWER`); }
  else if (verb === 'predict') predict(plain[0], plain[1], plain.slice(2).join(' '), o['help-used'] ?? 'not declared');
  else if (verb === 'agree') await agree(plain[0], o);
  else if (verb === 'wall') await wall(plain[0], o);
  else if (verb === 'decoder') await decoder(plain[0]);
  else if (verb === 'record') await recordCmd(plain[0], o);
  else if (verb === 'replay') await replayCmd(plain[0], plain[1]);
  else if (verb === 'tamper') tamperCmd(plain[0], o);
  else if (verb === 'diverge') await divergeCmd(plain[0], plain[1], plain[2]);
  else if (verb === 'ladder') ladder();
  else if (verb === 'investigate') await investigate(plain[0], plain[1]);
  else { say(USAGE); process.exitCode = 2; }
} catch (e) {
  console.error(e.code === 'EEXIST' ? 'That folder exists: choose a new name. Nothing was overwritten.' : e.message);
  process.exitCode = 2;
}
