#!/usr/bin/env node
// Sightline: the course's command-line tool. Node 22 or newer, no dependencies, offline.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { runModule, MODULES } from './checks/run.mjs';
import { formatModule, formatAll, FINISH } from './checks/format.mjs';
import { makeHost } from './host.mjs';
import { LEVELS, runLevel } from './levels.mjs';

const CONTROLS = Object.freeze({ angle_up: 'ArrowRight', angle_down: 'ArrowLeft', power_up: 'ArrowUp', power_down: 'ArrowDown', fire: 'Space', new_round: 'KeyN' });

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'course.json'), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
const GIVEN_FILES = [...(config.given ?? [])];
const WORK_FILES = [...config.workFiles];

const HELP = {
  main: `Sightline: course commands

  node lab.mjs start ./work               create work/ with the starter files
  node lab.mjs check 03 ./work            check one module (01 to 08)
  node lab.mjs check all ./work           check every module
  node lab.mjs status ./work              what passed, and whether your files changed since
  node lab.mjs strings ./work             the strings your findStrings finds in a fresh game
  node lab.mjs find ./work                run your findValues and print what it found
  node lab.mjs listing NAME ./work        your listing of the game function NAME
  node lab.mjs lift NAME ./work           what your lifter makes of NAME: every store, as an expression
  node lab.mjs xrefs ./work               your cross-references: each field, who reads it, who writes it
  node lab.mjs level N ./work             play level N (1 to 10) with your engine and the kit so far
  node lab.mjs climb ./work               start with an empty kit and climb from level 1
  node lab.mjs measure ./work             climb with each picker and compare them, level by level
  node lab.mjs sweep ./work               hit rate against decision time on the moving flag
  node lab.mjs watch N ./work             level N, recorded as a page you can replay in a browser
  node lab.mjs serve                      lessons and practice in your browser (this computer only)

Add --help after any command for its details.`,
  start: `node lab.mjs start ./work

Creates the folder with the nine starter files you write (scan.mjs, find.mjs, learn.mjs,
wasm.mjs, lift.mjs, flight.mjs, reader.mjs, race.mjs, engine.mjs).
It also copies in one finished file the course gives you, opcodes.mjs.
Each function throws "not written yet" until you write it. An existing folder is never
overwritten: files that already exist are left as they are.`,
  check: `node lab.mjs check NN ./work [--json]
node lab.mjs check all ./work [--json]

Runs the checks for module NN (01 to 08) or for every module against your files. Each
check runs in its own process with a time limit. A failed check says what was checked,
the input, what your code did, what was required and the lesson section that teaches it.
  --json        print the machine-readable record instead of sentences
  --only IDS    run only the named checks of that module, separated by commas, for example
                --only 03-fit,03-judge. Run a check as soon as its function is written
Every run is saved under work/.attempts/.`,
  status: `node lab.mjs status ./work [--json]

Lists each module's latest check run, whether it passed, and whether your files have
changed since that run.`,
  strings: `node lab.mjs strings ./work [--mode N] [--seed S]

Starts a fresh game and prints every string your findStrings finds in its memory,
with its address.`,
  find: `node lab.mjs find ./work [--mode N] [--seed S]

Starts a fresh game, runs your findValues with the controls the help text describes,
and prints the addresses it found and how many experiments and rounds it took.`,
  listing: `node lab.mjs listing NAME ./work [--game lob|lob2]

Prints your listing of the game function NAME (for example game_tick). Once your
lift.mjs is written, each store gets a note with what your lifter says it writes.`,
  lift: `node lab.mjs lift NAME ./work [--game lob|lob2]

Lifts the game function NAME with your lift.mjs and prints every store it makes: the
place, the expression stored, and the conditions under which it runs.`,
  xrefs: `node lab.mjs xrefs ./work [--game lob|lob2]

Lifts every function with your lift.mjs and prints your cross-references: for each
field the code reaches through a pointer, its offset, the functions that read it and
the functions that write it.`,
  level: `node lab.mjs level N ./work [--picker P] [--fresh] [--seed S]

Plays level N with your engine.mjs and prints every step it took: what code did, what
it tested, what each pick was and what it cost. The kit your engine has built is saved
under work/kits/ each time a level is passed, and level N starts from the kit level N-1
left, so the levels are played in order. Level 1 starts with an empty kit.
  --picker P    who answers the menus: rule (your heuristic, the default), first
                (always option 0), random, or live (a decision model on Ollama)
  --model M     with --picker live: the Ollama model, llama3.2:1b unless you say
  --fresh       start this level with an empty kit
The referee counts the last 10 shots that land, and a level that uses more rounds or
shots than its budget is not passed. The levels:
${LEVELS.map((l) => `  ${String(l.n).padStart(2)}  ${l.name.padEnd(24)} ${l.pass} of ${l.rounds} within ${l.radius} paces; budget ${l.budget.rounds} rounds, ${l.budget.shots} shots`).join('\n')}`,
  climb: `node lab.mjs climb ./work [--picker P] [--model M]

Starts with an empty kit and plays the levels in order until one is not passed. Prints
a line per level and how far your engine got. --picker as for "level".`,
  measure: `node lab.mjs measure ./work [--pickers LIST] [--runs N] [--model M]

Climbs all ten levels once for each picker, from an empty kit each time, and prints a
table: levels passed, hits, and rounds and shots used. LIST is any of rule, first,
random and live, separated by commas (rule,first,random unless you say). random is run
N times (5 unless you say), each with its own seed. A level that is not passed does not
stop the climb: the next level starts from whatever kit is left. live needs Ollama.`,
  sweep: `node lab.mjs sweep ./work [--level N] [--seed S]

Plays the moving-flag level (6 unless --level says otherwise) several times with the kit
that level left when it was passed, each time with the shot leaving later after the plan:
1, 2, 3, 4, 6, 9, 12, 18, 30 and 54 frames. Each delay is played twice: once with your
engine planning for it (the first column of hits) and once with the delay coming as a
surprise (the unplanned column, the last one). Set FRAME_BUDGET in race.mjs from the
unplanned column: the largest delay there that still hit 9 of 10, less the 1 frame the
plan already counts.`,
  watch: `node lab.mjs watch N ./work [--picker P]

Plays level N exactly as "level" does and writes work/watch-N.html, one file you open in
a browser to replay the run: the barrel moving as your engine presses keys, each shell's
flight, the flag and the status line, with every shot also listed in a table. It starts
paused; Play runs it and Next shot steps through it.`,
  serve: `node lab.mjs serve [PORT]

Serves the lessons, practice questions and the API page at http://127.0.0.1:4380/, or at
PORT if you give one (0 picks any free port). Only this computer can connect. Ctrl-C stops
it. Practice answers are kept in your browser's storage for that address, so serve on the
same port each time to see them again.`,
};

function requireWork(dir) {
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) throw new Error(`${dir} is not a folder. Create it with: node lab.mjs start ${dir}`);
  if (!existsSync(join(dir, 'course-work.json'))) throw new Error(`${dir} was not created by "node lab.mjs start". Run that first, or point at your work folder.`);
}

function start(dir) {
  mkdirSync(dir, { recursive: true });
  const made = [], kept = [];
  for (const name of [...config.workFiles, ...GIVEN_FILES]) {
    const target = join(dir, name);
    if (existsSync(target)) { kept.push(name); continue; }
    copyFileSync(join(root, 'starter', name), target);
    made.push(name);
  }
  if (!existsSync(join(dir, 'course-work.json'))) writeFileSync(join(dir, 'course-work.json'), JSON.stringify({ course: config.id, format: 'sightline-work-1' }) + '\n');
  const given = made.filter((n) => GIVEN_FILES.includes(n)).length;
  console.log(`Created ${dir} with ${made.length - given} starter files${given ? ` and ${given} given file${given > 1 ? 's' : ''} (${GIVEN_FILES.join(', ')})` : ''}${kept.length ? `; kept your existing ${kept.join(', ')}` : ''}.`);
  console.log('Every function throws "not written yet" until you write it, so the first check fails with that message.');
  console.log(`Next: run \"node lab.mjs serve\" and read lesson 01 in the browser, edit scan.mjs and engine.mjs, then run: node lab.mjs check 01 ${dir}`);
}

function snapshot(dir, label) {
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + label;
  const attempt = join(dir, '.attempts', id);
  const files = join(attempt, 'files');
  mkdirSync(files, { recursive: true });
  const hashes = {};
  // The given files travel with yours, because your files import them.
  for (const name of [...WORK_FILES, ...GIVEN_FILES]) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p);
    writeFileSync(join(files, name), text);
    hashes[name] = hash(text);
  }
  writeFileSync(join(files, 'package.json'), '{"type":"module"}\n');
  return { id, attempt, files, hashes };
}

async function check(target, dir, { variant, json, only }) {
  requireWork(dir);
  const modules = target === 'all' ? MODULES : [target];
  if (!modules.every(m => MODULES.includes(m))) throw new Error(`unknown module "${target}"; choose 01 to 08 or all`);
  if (only && target === 'all') throw new Error('--only names checks of one module; give the module, for example: check 03 ./work --only 03-fit');
  if (only) {
    const { cases } = await import(`./checks/${target}.mjs`);
    const unknown = only.filter((id) => !cases.some((c) => c.id === id));
    if (unknown.length) throw new Error(`module ${target} has no check named ${unknown.join(', ')}. Its checks: ${cases.map((c) => c.id).join(', ')}`);
  }
  const snap = snapshot(dir, target);
  // A run of chosen checks (--only) is recorded as such, so status never counts it as the module's result.
  const chosen = only ? { only } : {};
  writeFileSync(join(snap.attempt, 'request.json'), JSON.stringify({ course: config.id, target, variant, ...chosen, at: new Date().toISOString(), hashes: snap.hashes }, null, 1) + '\n');
  const reports = [];
  for (const m of modules) reports.push(await runModule(snap.files, m, { variant, only }));
  const record = { course: config.id, target, variant, ...chosen, attempt: snap.id, modules: reports.map(r => ({ module: r.module, pass: r.pass, results: r.results })) };
  writeFileSync(join(snap.attempt, 'result.json'), JSON.stringify(record, null, 1) + '\n');
  const where = join(dir, '.attempts', snap.id, 'result.json');
  if (json) console.log(JSON.stringify(record, null, 1));
  else if (target === 'all') console.log(formatAll(reports, { attemptPath: where }));
  else console.log(formatModule(reports[0], { attemptPath: where, partial: Boolean(only) }));
  process.exitCode = reports.every(r => r.pass) ? 0 : 1;
}

function status(dir, { json }) {
  requireWork(dir);
  const base = join(dir, '.attempts');
  const latest = {}, partial = {};
  const ids = existsSync(base) ? readdirSync(base).sort() : [];
  for (const id of ids) {
    const p = join(base, id);
    if (!existsSync(join(p, 'result.json'))) continue;
    const req = JSON.parse(readFileSync(join(p, 'request.json'), 'utf8'));
    const res = JSON.parse(readFileSync(join(p, 'result.json'), 'utf8'));
    for (const m of res.modules) {
      // Only a run of all of a module's checks stands for the module; a newer partial run is noted.
      if (res.only) { partial[m.module] = id; continue; }
      latest[m.module] = { id, pass: m.pass, passed: m.results.filter(r => r.pass).length, total: m.results.length, hashes: req.hashes };
    }
  }
  const current = {};
  for (const name of WORK_FILES) if (existsSync(join(dir, name))) current[name] = hash(readFileSync(join(dir, name)));
  const rows = MODULES.map(m => {
    const l = latest[m], newerPartial = Boolean(partial[m] && (!l || partial[m] > l.id));
    if (!l) return { module: m, checked: false, newerPartial };
    const files = config.lessons.find(x => x.id === m).files;
    const changed = files.filter(f => current[f] !== l.hashes[f]);
    return { module: m, checked: true, pass: l.pass, passed: l.passed, total: l.total, attempt: l.id, changedSince: changed, newerPartial };
  });
  if (json) { console.log(JSON.stringify({ course: config.id, modules: rows }, null, 1)); return; }
  for (const r of rows) {
    const title = config.lessons.find(x => x.id === r.module).title;
    const partialNote = r.newerPartial ? ' A later run checked only some of its checks (--only), so it does not count here.' : '';
    if (!r.checked) { console.log(`Module ${r.module} (${title}): not checked in full yet.${partialNote}`); continue; }
    const result = r.pass ? `passed all ${r.total} checks` : `passed ${r.passed} of ${r.total} checks`;
    const change = r.changedSince.length ? ` Since then you changed ${r.changedSince.join(', ')}; check again to update this.` : ' Your files have not changed since.';
    console.log(`Module ${r.module} (${title}): the latest full run ${result}.${change}${partialNote}`);
  }
  const passing = rows.filter(r => r.pass && !r.changedSince.length).length;
  console.log(`${passing} of ${MODULES.length} modules pass with your current files.${passing === MODULES.length ? ' The course\'s code work is complete.' : ''}`);
}

async function loadWork(dir) {
  requireWork(dir);
  const mods = {};
  for (const name of config.workFiles) mods[name.replace('.mjs', '')] = await import(pathToFileURL(join(resolve(dir), name)).href);
  return mods;
}

async function strings(dir, opts) {
  const mods = await loadWork(dir);
  const host = makeHost({ mode: opts.mode ?? 0, seed: opts.seed ?? 1 });
  const found = mods.scan.findStrings(host.memory());
  for (const s of found) console.log(`${'0x' + s.addr.toString(16).toUpperCase().padStart(5, '0')}  ${JSON.stringify(s.text)}`);
  console.log(`${found.length} strings in ${host.memory().length / 1024} KB.`);
}

async function find(dir, opts) {
  const mods = await loadWork(dir);
  const host = makeHost({ mode: opts.mode ?? 0, seed: opts.seed ?? 1 });
  const f = await mods.find.findValues(host, CONTROLS);
  const hex = (a) => '0x' + a.toString(16).toUpperCase().padStart(5, '0');
  for (const k of ['angle', 'power', 'wind', 'flag']) console.log(`${k.padEnd(6)} ${hex(f[k].addr)}  ${f[k].type}`);
  console.log(`status line ${hex(f.statusLine)}, message ${hex(f.message)}; ${f.experiments} experiments, ${f.rounds} new rounds.`);
}

async function listing(name, dir, opts) {
  const mods = await loadWork(dir);
  const host = makeHost({ game: opts.game ?? 'lob', mode: 0, seed: opts.seed ?? 1 });
  const mod = mods.wasm.parseModule(host.binary());
  const isFunc = (e) => e.kind === 0 || e.kind === 'func' || e.kind === 'function';
  let index = (mod.exports ?? []).find((e) => isFunc(e) && e.name === name)?.index;
  if (index === undefined && /^func\d+$/.test(name)) index = Number(name.slice(4));
  if (index === undefined) {
    const names = (mod.exports ?? []).filter(isFunc).map((e) => e.name);
    throw new Error(`your parseModule lists no exported function named ${name}` + (names.length ? ` (it lists ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', ...' : ''})` : ': its exports should be { name, kind: 0, index } for each function') + '. funcN lists any function by its index.');
  }
  // Notes from your own lifter, when it is written: what each store writes.
  let notes = [];
  try {
    const lifted = mods.lift.lift(mod, index);
    for (const st of lifted.stores ?? []) if (Number.isInteger(st.at) && !st.inLoop) notes[st.at] = mods.lift.showStore(st).replace(/\s+when .*/, '');
  } catch (e) { if (!String(e.message).includes('not written yet')) throw e; }
  console.log(mods.wasm.listing(mod, index, notes));
}

function functionIndex(mod, name) {
  const isFunc = (e) => e.kind === 0 || e.kind === 'func' || e.kind === 'function';
  const index = (mod.exports ?? []).find((e) => isFunc(e) && e.name === name)?.index;
  if (index !== undefined) return index;
  if (/^func\d+$/.test(name)) return Number(name.slice(4));
  throw new Error(`your parseModule lists no exported function named ${name}; funcN lists any function by its index`);
}

async function liftOne(name, dir, opts) {
  const mods = await loadWork(dir);
  const host = makeHost({ game: opts.game ?? 'lob', mode: 0, seed: opts.seed ?? 1 });
  const mod = mods.wasm.parseModule(host.binary());
  const lifted = mods.lift.lift(mod, functionIndex(mod, name));
  const stores = lifted.stores.filter((st) => !st.inLoop);
  for (const st of stores) console.log(mods.lift.showStore(st));
  console.log(`${stores.length} stores lifted from ${name}${lifted.stores.length > stores.length ? `, and ${lifted.stores.length - stores.length} inside loops left as unknown` : ''}.`);
}

async function xrefTable(dir, opts) {
  const mods = await loadWork(dir);
  const host = makeHost({ game: opts.game ?? 'lob', mode: 0, seed: opts.seed ?? 1 });
  const refs = mods.lift.xrefs(mods.lift.liftAll(mods.wasm.parseModule(host.binary())));
  const rows = [...refs.values()].filter((p) => p.addr.op === 'load').sort((a, b) => (mods.lift.place(a.addr) < mods.lift.place(b.addr) ? -1 : mods.lift.place(a.addr) > mods.lift.place(b.addr) ? 1 : a.offset - b.offset));
  let base = null;
  for (const p of rows) {
    const b = mods.lift.place(p.addr);
    if (b !== base) { console.log(`\nThe struct at ${b}:`); base = b; }
    const writers = [...new Set(p.writes.map((w) => w.fn))];
    console.log(`  +${String(p.offset).padEnd(4)} read by ${[...p.reads].join(', ') || 'nothing'}; written by ${writers.join(', ') || 'no store through this pointer'}`);
  }
}

// ---------- the ladder ----------

const RUNG = { code: 'code    ', decision: 'decision' };
const clip = (text, max = 150) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
// A printer for the engine's log. A line that repeats the one before it is counted,
// not printed again; flush() prints the count.
function logPrinter() {
  let last = null, repeats = 0;
  const flush = () => { if (repeats) console.log(`            (the same ${repeats} more time${repeats > 1 ? 's' : ''})`); repeats = 0; };
  const print = (e) => {
    const line = `  ${RUNG[e.rung] ?? e.rung}  ${e.step}: ${clip(String(e.result).split('\n')[0])}`;
    if (line === last) { repeats += 1; return; }
    flush();
    console.log(line);
    last = line;
  };
  print.flush = flush;
  return print;
}

// The picker that answers the menus: your heuristic unless --picker says otherwise.
async function pickerFor(opts, engine, seed = 1) {
  const M = await import('./models.mjs');
  const which = opts.picker ?? 'rule';
  if (which === 'rule') return M.rule(engine);
  if (which === 'first') return M.first;
  if (which === 'random') return M.random(opts.seed ?? seed);
  if (which === 'live') return M.live(opts.model);
  throw new Error('--picker is rule, first, random or live');
}

async function makeEnv(opts, engine, log = logPrinter()) {
  const picker = await pickerFor(opts, engine);
  const kept = [];
  const logged = (e) => { kept.push(e); log(e); };
  const env = { models: picker, log: logged };
  env.flush = () => log.flush?.();
  env.kept = kept;
  env.done = async () => { await picker.unload?.(); };
  return env;
}

// The kit is saved after every level passed, so any level can be played again
// from the kit the level before it left.
const kitFile = (dir, n) => join(resolve(dir), 'kits', `after-level-${n}.json`);
function loadKit(dir, n) {
  if (n < 1) return {};
  if (!existsSync(kitFile(dir, n))) throw new Error(`there is no kit from level ${n} yet. Pass it first: node lab.mjs level ${n} ${dir}`);
  const kit = JSON.parse(readFileSync(kitFile(dir, n), 'utf8'));
  // A kit saved before your engine began to mark its game (module 08) belongs to
  // the game of the level that left it. Say so, or the first run after that step
  // would take every part in it for another game's.
  if (kit.game === undefined) kit.game = gameIdOf(LEVELS[n - 1].game);
  return kit;
}
// The id your engine.mjs works out with gameId(host), for one of the course's games.
function gameIdOf(game) {
  let sum = 0;
  const bytes = makeHost({ game }).binary();
  for (const b of bytes) sum = (sum * 31 + b) >>> 0;
  return `${bytes.length}:${sum}`;
}
function saveKit(dir, kit, n) {
  mkdirSync(join(resolve(dir), 'kits'), { recursive: true });
  writeFileSync(kitFile(dir, n), JSON.stringify(kit, null, 1) + '\n');
}
const KIT_PARTS = [['controls', 'the controls'], ['found', 'addresses from a search'], ['fit', 'a fit from practice shots'], ['reader', 'the state reader from the code'], ['physics', 'the physics from the code'], ['mover', 'the flag\'s motion from the code']];
const kitLine = (kit) => KIT_PARTS.filter(([k]) => kit[k]).map(([, name]) => name).join(', ') || 'nothing';

function levelByNumber(n) {
  const level = LEVELS.find((l) => String(l.n) === String(n));
  if (!level) throw new Error(`LEVEL is a number from 1 to ${LEVELS.length}`);
  return level;
}

function reportLevel(r, entries = []) {
  const { level } = r;
  if (r.error) {
    const message = String(r.error?.message ?? r.error);
    console.log(message.includes('not written yet') ? `Your engine stopped: ${message}.` : `Your engine stopped with an error: ${message.split('\n')[0]}`);
  }
  const near = level.radius === 12 ? 'hits' : `within ${level.radius} paces`;
  const used = r.used ? ` Used ${r.used.rounds} of ${level.budget.rounds} rounds and ${r.used.shots} of ${level.budget.shots} shots.` : '';
  console.log(`Level ${level.n}, ${level.name}: ${r.hits} of ${r.rounds} ${near}; ${level.pass} needed. ${r.pass ? 'Passed.' : 'Not passed.'}${used}${r.over ? ' That is over the budget.' : ''}`);
  if (!r.pass) {
    const voided = (r.misses ?? []).length < r.rounds ? `Only ${(r.misses ?? []).length} shot${(r.misses ?? []).length === 1 ? '' : 's'} landed, and the level counts the last ${r.rounds}. ` : '';
    const last = entries.filter((e) => !/^round \d+$/.test(e.step)).slice(-3).map((e) => `${e.step}: ${clip(String(e.result).split('\n')[0], 110)}`);
    console.log(`${voided}The last steps your engine logged before the rounds: ${last.length ? last.join(' | ') : 'none'}.`);
  }
}

async function playOne(n, dir, opts) {
  const mods = await loadWork(dir);
  const level = { ...levelByNumber(n), ...(opts.seed !== undefined && opts.picker !== 'random' ? { seed: opts.seed } : {}) };
  const kit = opts.fresh ? {} : loadKit(dir, level.n - 1);
  const env = await makeEnv(opts, mods.engine);
  console.log(`Level ${level.n}, ${level.name}. ${level.about}`);
  console.log(`In the kit: ${kitLine(kit)}. Budget: ${level.budget.rounds} rounds and ${level.budget.shots} shots, ${level.rounds} of each for the scored rounds. Menus answered by: ${env.models.name}.\n`);
  let r;
  try { r = await runLevel(mods.engine, level, kit, env); } finally { await env.done(); }
  env.flush();
  console.log('');
  reportLevel(r, env.kept);
  if (r.pass) { saveKit(dir, kit, level.n); console.log(`The kit is saved in ${kitFile(dir, level.n)}: ${kitLine(kit)}.`); }
  else process.exitCode = 1;
}

async function climb(dir, opts) {
  const mods = await loadWork(dir);
  const kit = {};
  const env = await makeEnv(opts, mods.engine);
  let reached = 0;
  try {
    for (const level of LEVELS) {
      console.log(`\nLevel ${level.n}, ${level.name}. ${level.about}`);
      const from = env.kept.length;
      const r = await runLevel(mods.engine, level, kit, env);
      env.flush();
      reportLevel(r, env.kept.slice(from));
      if (!r.pass) break;
      reached = level.n;
      saveKit(dir, kit, level.n);
    }
  } finally { await env.done(); }
  console.log(`\nYour engine cleared ${reached} of ${LEVELS.length} levels, with menus answered by ${env.models.name}.`);
  if (reached < LEVELS.length) process.exitCode = 1;
}

// Climb with each picker and compare. A level that is not passed does not stop the
// climb here: the next level starts from whatever kit is left.
async function measure(dir, opts) {
  const mods = await loadWork(dir);
  const which = (opts.pickers ?? 'rule,first,random').split(',').map((x) => x.trim()).filter(Boolean);
  const runs = opts.runs ?? 5;
  const rows = [];
  for (const name of which) {
    const n = name === 'random' ? runs : 1;
    const per = LEVELS.map(() => ({ pass: 0, hits: 0, rounds: 0, shots: 0 }));
    let menus = 0, unlike = 0;
    for (let k = 0; k < n; k++) {
      const env = await makeEnv({ ...opts, picker: name, seed: 1 + k }, mods.engine, () => {});
      const ask = env.models;
      env.models = { name: ask.name, async decide(text, labels, options) {
        const r = await ask.decide(text, labels, options);
        const problem = options?.[0]?.problem;
        if (problem) { menus++; try { if (r.choice !== mods.engine.heuristic(problem, options)) unlike++; } catch { /* no heuristic yet */ } }
        return r;
      } };
      const kit = {};
      try {
        for (const [i, level] of LEVELS.entries()) {
          const r = await runLevel(mods.engine, level, kit, env);
          per[i].pass += r.pass ? 1 : 0; per[i].hits += r.hits; per[i].rounds += r.used?.rounds ?? 0; per[i].shots += r.used?.shots ?? 0;
        }
      } finally { await ask.unload?.(); }
    }
    const label = { rule: 'your heuristic', first: 'option 0', random: 'random' }[name] ?? name;
    rows.push({ name: name === 'live' ? (opts.model ?? 'llama3.2:1b') : label, n, per, menus, unlike });
  }
  console.log(`Levels passed out of the climbs made, and the mean hits, rounds and shots per climb.\n`);
  const width = 34;
  console.log(`  level  ${rows.map((r) => `${r.name}${r.n > 1 ? ` (${r.n} climbs)` : ''}`.padEnd(width)).join('')}`);
  for (const [i, level] of LEVELS.entries()) {
    const cells = rows.map((r) => { const p = r.per[i]; return `${p.pass}/${r.n} passed, ${(p.hits / r.n).toFixed(1)} hits, ${(p.rounds / r.n).toFixed(0)}r ${(p.shots / r.n).toFixed(0)}s`.padEnd(width); });
    console.log(`  ${String(level.n).padStart(5)}  ${cells.join('')}`);
  }
  console.log(`\n  r is rounds used and s shots used, the scored rounds included; the budgets are ${LEVELS.map((l) => `${l.budget.rounds}r ${l.budget.shots}s`).join(', ')}.`);
  console.log('');
  for (const r of rows) console.log(`${r.name}: ${r.menus} repair menu${r.menus === 1 ? '' : 's'} answered, ${r.unlike} pick${r.unlike === 1 ? '' : 's'} unlike your heuristic.`);
}

async function sweepLevel(dir, opts) {
  const mods = await loadWork(dir);
  const level = levelByNumber(opts.level ?? 6);
  // The kit the level itself left: it has the flag's motion once the level is passed.
  if (!existsSync(kitFile(dir, level.n))) throw new Error(`there is no kit from level ${level.n} yet. Pass it first: node lab.mjs level ${level.n} ${dir}`);
  const kit = loadKit(dir, level.n);
  if (!kit.reader || !kit.physics || !kit.mover) throw new Error(`the kit from level ${level.n} has no reader, physics and flag motion, so there is nothing to sweep`);
  const env = await makeEnv(opts, mods.engine, () => {});
  const latencies = [1, 2, 3, 4, 6, 9, 12, 18, 30, 54];
  const rows = await mods.engine.sweep(() => makeHost({ game: level.game, mode: level.mode, seed: opts.seed ?? level.seed }), level, kit, env, latencies);
  console.log(`Level ${level.n}, ${level.name}: the same ${level.rounds} rounds, with the shot leaving later and later after each plan.`);
  console.log('  delay (frames)   (ms)   hits, delay planned for     hits, delay unplanned');
  for (const x of rows) console.log(`${String(x.latency).padStart(9)} ${String(Math.round((x.latency * 1000) / 60)).padStart(9)} ${String(x.planned).padStart(18)} of ${level.rounds} ${String(x.unplanned).padStart(22)} of ${level.rounds}`);
}

async function watchLevel(n, dir, opts) {
  const mods = await loadWork(dir);
  const { record, page } = await import('./watch.mjs');
  const level = levelByNumber(n);
  const kit = loadKit(dir, level.n - 1);
  const env = await makeEnv(opts, mods.engine, () => {});
  let summary = '', counted = level.rounds;
  const scenes = await record(async () => {
    const r = await runLevel(mods.engine, level, kit, env);
    counted = r.rounds;
    summary = `Level ${level.n}, ${level.name}: your engine landed ${r.hits} of its last ${r.rounds} shots within ${level.radius} paces of the flag${r.fired > r.rounds ? `, after ${r.fired - r.rounds} practice and check shots` : ''}.`;
  });
  if (!scenes.length) throw new Error('nothing was recorded');
  const out = join(resolve(dir), `watch-${level.n}.html`);
  writeFileSync(out, page(`Sightline: level ${level.n}, replayed`, summary, scenes, { counted }));
  console.log(summary);
  console.log(`Replay written to ${out} (${scenes.reduce((k, s) => k + s.frames.length, 0)} frames). Open it in a browser.`);
}

const DEFAULT_PORT = 4380;

async function serve(port) {
  const { createCourseServer } = await import('./web.mjs');
  const server = await createCourseServer();
  server.on('error', e => {
    const busy = e.code === 'EADDRINUSE' ? ` Port ${port} is in use: stop whatever uses it, or give another port (answers saved at one port do not show at another).` : '';
    console.error('The local server could not start: ' + e.message + '.' + busy);
    process.exitCode = 3;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Course pages: http://127.0.0.1:${server.address().port}/  (only this computer can connect; Ctrl-C stops the server)`));
}

try {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const help = argv.includes('--help') || argv.includes('-h');
  const flags = {};
  const valued = ['--mode', '--seed', '--rounds', '--game', '--level', '--picker', '--model', '--pickers', '--runs'];
  const onlyAt = argv.indexOf('--only');
  if (onlyAt >= 0 && (!argv[onlyAt + 1] || argv[onlyAt + 1].startsWith('--'))) throw new Error('--only needs the ids of the checks to run, separated by commas');
  const only = onlyAt >= 0 ? argv[onlyAt + 1].split(',').map((x) => x.trim()).filter(Boolean) : null;
  flags.fresh = argv.includes('--fresh');
  if (argv.includes('--live')) throw new Error('--live is gone: the only model is the decision model. Use --picker live (and --model M) to ask one on Ollama');
  const skip = new Set();
  for (const f of valued) {
    const i = argv.indexOf(f);
    if (i < 0) continue;
    skip.add(i + 1);
    const v = argv[i + 1];
    if (f === '--game') { if (!['lob', 'lob2'].includes(v)) throw new Error('--game is lob or lob2'); flags.game = v; continue; }
    if (f === '--picker') { if (!['rule', 'first', 'random', 'live'].includes(v)) throw new Error('--picker is rule, first, random or live'); flags.picker = v; continue; }
    if (f === '--model' || f === '--pickers') { if (!v || v.startsWith('--')) throw new Error(`${f} needs a value`); flags[f.slice(2)] = v; continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1e6) throw new Error(`${f} needs a whole number`);
    flags[f.slice(2)] = n;
  }
  if (onlyAt >= 0) skip.add(onlyAt + 1);
  const args = argv.filter((a, i) => !a.startsWith('--') && !skip.has(i));
  const [command, ...rest] = args;
  if (!command || command === 'help') console.log(HELP.main);
  else if (help) console.log(HELP[command] ?? HELP.main);
  else if (command === 'start' && rest.length === 1) start(resolve(rest[0]));
  else if (command === 'check' && rest.length === 2) await check(rest[0], resolve(rest[1]), { variant: 0, json, only });
  else if (command === 'status' && rest.length === 1) status(resolve(rest[0]), { json });
  else if (command === 'strings' && rest.length === 1) await strings(resolve(rest[0]), flags);
  else if (command === 'find' && rest.length === 1) await find(resolve(rest[0]), flags);
  else if (command === 'listing' && rest.length === 2) await listing(rest[0], resolve(rest[1]), flags);
  else if (command === 'lift' && rest.length === 2) await liftOne(rest[0], resolve(rest[1]), flags);
  else if (command === 'xrefs' && rest.length === 1) await xrefTable(resolve(rest[0]), flags);
  else if (command === 'measure' && rest.length === 1) await measure(resolve(rest[0]), flags);
  else if (command === 'level' && rest.length === 2) await playOne(rest[0], resolve(rest[1]), flags);
  else if (command === 'climb' && rest.length === 1) await climb(resolve(rest[0]), flags);
  else if (command === 'sweep' && rest.length === 1) await sweepLevel(resolve(rest[0]), flags);
  else if (command === 'watch' && rest.length === 2) await watchLevel(rest[0], resolve(rest[1]), flags);
  else if (command === 'serve' && rest.length <= 1) {
    // A fixed default keeps the same address, and with it the browser's saved answers, across restarts.
    const port = Number(rest[0] ?? DEFAULT_PORT);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a whole number from 0 to 65535');
    await serve(port);
  } else {
    console.error(`That command was not understood.\n\n${HELP[command] ?? HELP.main}`);
    process.exitCode = 2;
  }
} catch (error) {
  console.error('Stopped: ' + error.message);
  process.exitCode = 2;
}
void FINISH;
