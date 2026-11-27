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
// Each lesson's new case, which its own checker in examples/ grades and saves under
// work/.attempts/ as ID-CHECK/CHECK.json; status reports the latest try of each.
const NEW_CASES = [
  { check: 'read-result', lesson: '01', command: 'node examples/check-result.mjs' },
  { check: 'landing-age', lesson: '02', command: 'node examples/check-landing-age.mjs' },
  { check: 'flight-time', lesson: '03', command: 'node examples/check-flight-time.mjs' },
  { check: 'encode', lesson: '04', command: 'node examples/check-encode.mjs' },
  { check: 'shots', lesson: '05', command: 'node examples/check-shots.mjs' },
  { check: 'score', lesson: '06', command: 'node examples/check-score.mjs' },
  { check: 'turn', lesson: '07', command: 'node examples/check-turn.mjs' },
  { check: 'score-anywhere', lesson: '08', command: 'node examples/check-score-anywhere.mjs' },
];

const HELP = {
  main: `Sightline: course commands

  node lab.mjs start ./work               create work/ with the starter files
  node lab.mjs check 03 ./work            check one module (01 to 08)
  node lab.mjs check all ./work           check every module
  node lab.mjs status ./work              what passed, whether your files changed since, and practice
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
  node lab.mjs lesson 01 ./work           lesson 01 in this terminal, its newest open part
  node lab.mjs question ID ./work         the next question of practice item ID
  node lab.mjs answer ID ANSWER ./work    commit an answer to that question and see the verdict

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
  --help-used "TEXT"  record what helped with this attempt (a supplied file, an AI tool),
                saved with the attempt; it does not change the checks
Every run is saved under work/.attempts/.`,
  status: `node lab.mjs status ./work [--answers] [--json]

Lists each module's latest check run, whether it passed, and whether your files have
changed since that run. Then counts the practice answers committed in this folder with
"node lab.mjs answer" and lists the practice items still waiting for one.
  --answers     also list every committed answer, right or wrong
  --json        print everything, every committed answer included, as JSON`,
  lesson: `node lab.mjs lesson NN ./work [--part K [--whole] | --next | --all | --section "HEADING" [--whole]] [--sections]

Prints lesson NN (01 to 08) as Markdown, the same text the browser view shows, one part
at a time. A part ends at a prediction: the next part opens once every question of that
prediction has an answer in this work folder. With no option it prints the newest open
part. Its first lines say which part it is, of how many, and list its sections. A part
longer than 12,000 characters prints only its first section; --next prints the next.
  --part K      print part K, if it is open
  --next        print the section after the one printed last for this lesson, kept in
                work/.reading.json; at the end of a part it goes on to the next open part
  --whole       with no --section, print the whole part however long it is
  --all         print every open part, from the top of the lesson
  --section "HEADING"  print one section of an open part, by its heading. A section
                with subsections prints its text up to the first of them, then
                lists them; each prints with its own --section
  --whole       with --section, print the section and all its subsections
  --sections    print only the first line and the section headings, with --part or
                --all if you give one
Each practice item is printed as the command that asks its questions. The work folder
need not exist yet: lesson 01 says how to create it.`,
  question: `node lab.mjs question ID ./work

Prints the next question of practice item ID that has no committed answer in this work
folder, and the kind of answer it wants. The lessons name each item's ID. When every
question of ID has an answer, it says so.`,
  answer: `node lab.mjs answer ID ANSWER ./work

Commits ANSWER to the next unanswered question of practice item ID, the one "question"
prints, and prints the verdict and the reason, as the browser view does. Then it prints
the next question of ID, if one is left. A committed answer is saved in
work/.practice.json and is never replaced: commit only once you have settled on it. An
answer that can't be read (a word where a number is wanted) is not saved. Put a list of
numbers in quotes: node lab.mjs answer ID "1, 2, 3" ./work`,
  strings: `node lab.mjs strings ./work [--mode N] [--seed S]

Starts a fresh game and prints every string your findStrings finds in its memory,
with its address.`,
  find: `node lab.mjs find ./work [--mode N] [--seed S]

Starts a fresh game, runs your findValues with the controls the help text describes,
and prints the addresses it found and how many experiments and rounds it took.`,
  listing: `node lab.mjs listing NAME ./work [--game lob|lob2]

Prints your listing of the game function NAME (for example game_tick). Once your
lift.mjs is written, each store gets a note with what your lifter says it writes.`,
  lift: `node lab.mjs lift NAME ./work [--place LIST] [--find TEXT] [--full] [--game lob|lob2]

Lifts the game function NAME with your lift.mjs and prints every store it makes: the
place, the expression stored, and the conditions under which it runs. A line longer than
160 characters is cut, and says how long it is.
  --place LIST  only the stores to these places, separated by commas: a whole place
                such as *0x13120+36, or a field such as +36 through any pointer;
                +0 and *0x13120+0 name field +0, which the printout writes as *0x13120
  --find TEXT   only the stores whose line contains TEXT, such as sin(
  --full        print every line whole
The last line counts every store lifted, whatever was shown.`,
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
same port each time to see them again. The browser and the terminal commands (lesson,
question, answer) keep separate records of your answers: pick one way to read.`,
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
  console.log(`Next: read lesson 01, in the browser with \"node lab.mjs serve\" or in this terminal with \"node lab.mjs lesson 01 ${dir}\". Edit scan.mjs and engine.mjs, then run: node lab.mjs check 01 ${dir}`);
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

async function check(target, dir, { variant, json, only, helpUsed }) {
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
  if (helpUsed) chosen.help_used = helpUsed;
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

async function status(dir, { json, typed = dir, answers = false }) {
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
  const newCases = NEW_CASES.map(({ check, lesson, command }) => {
    const id = ids.filter((x) => existsSync(join(base, x, `${check}.json`))).at(-1);
    if (!id) return { check, lesson, command, tried: false };
    const r = JSON.parse(readFileSync(join(base, id, `${check}.json`), 'utf8'));
    const results = r.results ?? [];
    return { check, lesson, command, tried: true, attempt: id, passed: results.filter((x) => x.pass).length, total: results.length, helpUsed: r.helpUsed ?? null, loadError: r.loadError ?? null, finished: r.finished !== false };
  });
  const prac = await practiceStatus(dir);
  if (json) { console.log(JSON.stringify({ course: config.id, modules: rows, newCases, practice: prac }, null, 1)); return; }
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
  for (const c of newCases) {
    if (!c.tried) { console.log(`New case ${c.check} (lesson ${c.lesson}): no try yet. Check it with: ${c.command} ${typed}`); continue; }
    const help = c.helpUsed ? `, help used: ${JSON.stringify(c.helpUsed)}` : '';
    const how = c.loadError ? `could not be loaded, so no case ran (${c.loadError})` : !c.finished ? 'stopped before its cases finished' : `passed ${c.passed} of ${c.total} cases`;
    console.log(`New case ${c.check} (lesson ${c.lesson}): the latest try ${how}${help}. It is saved in ${join(typed, '.attempts', c.attempt)}.`);
  }
  console.log('');
  if (!prac.committed.length) console.log('Practice: no answers committed in this folder with "node lab.mjs answer" yet. Answers given in the browser view are kept by the browser.');
  else {
    const right = prac.committed.filter((c) => c.correct).length;
    console.log(`Practice: ${prac.committed.length} of ${prac.questions} questions answered, ${right} of them right; ${prac.items - prac.waiting.length} of ${prac.items} items complete.${answers ? '' : ` Every answer: node lab.mjs status ${typed} --answers`}`);
    if (answers) for (const c of prac.committed) console.log(`  ${c.id} question ${c.question}: ${c.correct ? 'right' : 'wrong'}, answer ${JSON.stringify(c.answer)}`);
  }
  if (prac.older.length) console.log(`${prac.older.length} earlier answer${prac.older.length === 1 ? ' was' : 's were'} to an older wording of the question: ${prac.older.map((o) => `${o.id} question ${o.question}`).join(', ')}. They are kept as they were, and the questions as they are now count as unanswered.`);
  console.log(prac.waiting.length ? `Still waiting for an answer: ${prac.waiting.join(', ')}. Ask the next question of one with: node lab.mjs question ID ${typed}` : 'Every practice question has a committed answer.');
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
  const WIDTH = 160;
  const lines = stores.map((st) => mods.lift.showStore(st));
  // --place: places separated by commas, each a whole place (*0x13120+36) or a field (+36).
  const wanted = opts.place === undefined ? null : opts.place.split(',').map((p) => p.trim()).filter(Boolean);
  const placeOf = (st) => mods.lift.place(st.addr, st.offset);
  // A field matches by the store's offset, and a whole place by its address and offset, so +0 and
  // *0x13120+0 find field +0, which place() prints without its +0.
  const matches = (st, p) => {
    if (/^\+\d+$/.test(p)) return st.offset === Number(p.slice(1));
    return placeOf(st) === p || (st.offset === 0 && `${mods.lift.place(st.addr)}+0` === p);
  };
  const atPlace = (st) => !wanted || wanted.some((p) => matches(st, p));
  const shown = lines.filter((line, i) => atPlace(stores[i]) && (opts.find === undefined || line.includes(opts.find)));
  for (const line of shown) console.log(opts.full || line.length <= WIDTH ? line : `${line.slice(0, WIDTH)}… (${line.length} characters; --full prints it whole)`);
  if (shown.length < lines.length) console.log(`${shown.length} of the ${lines.length} stores shown.`);
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

// ---------- practice in the terminal ----------
// The same items, grading and lesson gates as the browser view (web.mjs), with the commits
// kept in work/.practice.json instead of the browser's storage. The two records are separate.
// An item's answer and feedback are printed only in the reply to a commit of that question.

const PRACTICE_FILE = '.practice.json';
const practiceKey = (id, v) => `${id}:${v}`;
// A question's version: a hash of its prompt and of what counts as right. A commit keeps the
// version, prompt and kind of answer of the question it answered, so an edited question is a
// new question, and the answer to the old wording stays on record as it was.
const questionVersion = (it) => hash(JSON.stringify({ prompt: it.prompt, answer: it.answer, anyOrder: it.anyOrder ?? false, round: it.round ?? false, wrong: (it.wrong ?? []).map((w) => w.answer) })).slice(0, 16);
// The commit that answers the current wording of question v, or null. A commit written before
// commits kept a version has none, and counts for the question as it is now.
function commitFor(commits, id, v, it) {
  const version = questionVersion(it);
  const first = commits[practiceKey(id, v)];
  if (first && (first.version === undefined || first.version === version)) return first;
  return commits[`${practiceKey(id, v)}@${version}`] ?? null;
}
// The commit at question v that answered an older wording, or null.
function olderCommit(commits, id, v, it) {
  const first = commits[practiceKey(id, v)];
  return first && first.version !== undefined && first.version !== questionVersion(it) ? first : null;
}

function readCommits(dir) {
  const file = join(dir, PRACTICE_FILE);
  if (!existsSync(file)) return {};
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} could not be read (${e.message}). Your committed answers are in it; fix or move it, then try again.`); }
  return data.answers ?? {};
}

function saveCommit(dir, key, record) {
  const file = join(dir, PRACTICE_FILE);
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { course: config.id, format: 'sightline-answers-1' };
  const answers = data.answers ?? {};
  // First answers are kept, as in the browser: a question with a commit is never committed again.
  // An answer to an older wording keeps its key; the answer to the current one goes beside it.
  const at = answers[key] ? `${key}@${record.version}` : key;
  if (answers[at]) throw new Error(`${key} already has a committed answer, and it is kept`);
  answers[at] = record;
  // Everything else in the file, records of an older format included, is written back as it was.
  writeFileSync(file, JSON.stringify({ ...data, answers }, null, 1) + '\n');
}

async function practiceData() {
  const web = await import('./web.mjs');
  return { web, practice: await web.loadPractice() };
}

function itemOf(practice, id) {
  const items = practice[id];
  if (!items) throw new Error(`there is no practice item ${id}. The lessons name each one, on a line such as {{practice:p01a}}; "node lab.mjs lesson NN ./work" prints them as commands`);
  return items;
}

// The first question of the item with no commit, or -1 when every one has one.
const nextOpen = (items, commits, id) => items.findIndex((it, v) => !commitFor(commits, id, v, it));
const fullyAnswered = (practice, commits, id) => nextOpen(practice[id] ?? [], commits, id) < 0;
const lessonOfItem = (id) => config.lessons.find((l) => l.practice.includes(id));

const olderNote = (id, v, typed) => `Your earlier answer to question ${v + 1} of ${id} was to an older wording of it. It is kept as it was in ${join(typed, PRACTICE_FILE)}, and the question as it is now has no answer yet.`;

function printQuestion(web, items, id, v, typed, commits = {}) {
  const it = items[v];
  const home = lessonOfItem(id);
  console.log(`${web.practiceKind(id)}: item ${id}${home ? ` (lesson ${home.id})` : ''}, question ${v + 1} of ${items.length}`);
  if (olderCommit(commits, id, v, it)) console.log(olderNote(id, v, typed));
  console.log('');
  console.log(it.prompt);
  console.log('');
  console.log(`Your answer: ${web.answerLabel(it.answer)}.`);
  console.log(`Commit it with: node lab.mjs answer ${id} ANSWER ${typed}`);
}

const doneLine = (id) => `Every question of ${id} is answered.`;

async function question(id, dir, typed = dir) {
  requireWork(dir);
  const { web, practice } = await practiceData();
  const items = itemOf(practice, id);
  const commits = readCommits(dir);
  const v = nextOpen(items, commits, id);
  if (v < 0) { console.log(doneLine(id)); return; }
  printQuestion(web, items, id, v, typed, commits);
}

async function answer(id, text, dir, typed = dir) {
  requireWork(dir);
  const { web, practice } = await practiceData();
  const items = itemOf(practice, id);
  const before = readCommits(dir);
  const v = nextOpen(items, before, id);
  if (v < 0) {
    console.error(`${doneLine(id)} Nothing was recorded: a committed answer is kept and not replaced. "node lab.mjs status ${typed}" lists your answers.`);
    process.exitCode = 1;
    return;
  }
  const r = web.grade(practice, id, v, text);
  if (!r.ok) {
    console.error(r.hint);
    process.exitCode = 2;
    return;
  }
  const it = items[v];
  if (olderCommit(before, id, v, it)) console.log(olderNote(id, v, typed));
  saveCommit(dir, practiceKey(id, v), { answer: text, correct: r.correct, verdict: r.verdict, text: r.text, pointer: r.pointer, at: new Date().toISOString(), prompt: it.prompt, kind: web.answerLabel(it.answer), version: questionVersion(it) });
  // The text the browser shows under the answer, with the same mark before the verdict.
  console.log(`${r.correct ? '✓' : '✗'} ${r.text}`);
  if (r.pointer) {
    const read = `node lab.mjs lesson ${r.pointer.objective} ${typed} --section "${r.pointer.section}"`;
    console.log(r.pointer.opensAfter && !r.pointer.opensNow ? `Once every question of ${id} has an answer, read it with: ${read}` : `Read it in this terminal with: ${read}`);
  }
  console.log(`Saved in ${join(typed, PRACTICE_FILE)}.`);
  const after = nextOpen(items, readCommits(dir), id);
  console.log('');
  if (after < 0) {
    console.log(doneLine(id));
    const home = lessonOfItem(id);
    if (home && splitLessonOf(web, home.id).some((s) => s.gate === id)) console.log(`The text after it is open: node lab.mjs lesson ${home.id} ${typed}`);
  } else printQuestion(web, items, id, after, typed, readCommits(dir));
}

function splitLessonOf(web, nn) {
  const file = web.lessonFile(nn);
  if (!file || !existsSync(file)) throw new Error(`there is no lesson ${nn}; the lessons are ${config.lessons.map((l) => l.id).join(', ')}`);
  return web.splitLesson(readFileSync(file, 'utf8'));
}

const unentity = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// The headings of a lesson text, outside code blocks: [{ level, title, line }].
function headingsOf(lines) {
  const out = [];
  let fence = false;
  lines.forEach((line, n) => {
    if (line.startsWith('```')) fence = !fence;
    const h = !fence && line.match(/^(#{2,3}) (.*)$/);
    if (h) out.push({ level: h[1].length, title: h[2].trim(), line: n });
  });
  return out;
}
const sameHeading = (a, b) => a.replace(/[`*]/g, '').trim().toLowerCase() === b.replace(/[`*]/g, '').trim().toLowerCase();

// A lesson is printed a part at a time: part K is the text between gate K-1 and gate K, and a
// part is open once every question of the item at the gate before it has an answer. With no
// option it prints the newest open part; --part K, --all and --section pick something else.
// A part longer than this prints one section at a time, unless --whole asks for all of it.
const PART_LIMIT = 12000;
const READING_FILE = '.reading.json';
// Where --next goes on from: for each lesson, the part and the section printed last.
function readReading(dir) {
  const file = join(dir, READING_FILE);
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveReading(dir, nn, at) {
  if (!existsSync(dir)) return;
  writeFileSync(join(dir, READING_FILE), JSON.stringify({ ...readReading(dir), [nn]: at }) + '\n');
}

async function lessonText(nn, dir, typed = dir, { part, all, section, sections, whole, next } = {}) {
  // Reading needs no work folder yet: lesson 01 says how to make one. Answers need one.
  if (existsSync(dir)) requireWork(dir);
  const { web, practice } = await practiceData();
  const segments = splitLessonOf(web, nn);
  const commits = readCommits(dir);
  const shown = (text) => text.split('\n').filter((line) => !web.exampleMarker(line)).map((line) => {
    const p = line.match(/^\{\{practice:([a-z0-9-]+)\}\}$/);
    if (p) {
      const n = practice[p[1]]?.length ?? 0;
      const older = (practice[p[1]] ?? []).some((it, v) => olderCommit(commits, p[1], v, it) && !commitFor(commits, p[1], v, it));
      const state = fullyAnswered(practice, commits, p[1]) ? 'answered' : `${n} question${n === 1 ? '' : 's'}${older ? ', an earlier answer was to an older wording' : ''}`;
      return `> ${web.practiceKind(p[1])} (${p[1]}, ${state}): node lab.mjs question ${p[1]} ${typed}`;
    }
    const f = line.match(/^\{\{figure:([a-z0-9-]+)\}\}$/);
    if (f) { const d = web.figureDesc(f[1]); return `> Figure (lessons/figures/${f[1]}.svg): ${d === null ? 'missing' : unentity(d)}`; }
    return line;
  }).join('\n').replace(/^\s+|\s+$/g, '');
  const total = segments.length;
  let open = 1;
  while (open < total && fullyAnswered(practice, commits, segments[open].gate)) open++;
  const closedNote = () => {
    if (open >= total) return '';
    const gate = segments[open].gate;
    return `The lesson goes on once every question of ${gate} has a committed answer. Ask the next one with: node lab.mjs question ${gate} ${typed}`;
  };
  const endNote = () => {
    if (open < total) return closedNote();
    const at = config.lessons.findIndex((l) => l.id === nn), following = config.lessons[at + 1];
    return `That is the end of lesson ${nn}.${following ? ` Next: node lab.mjs lesson ${following.id} ${typed}` : ''}`;
  };
  const cmd = `node lab.mjs lesson ${nn} ${typed}`;
  const noFolder = existsSync(dir) ? '' : `(${typed} does not exist yet. Lesson 01's "Choose how to start" creates it; answers need it.)\n`;

  if (section !== undefined) {
    // Where each line of the lesson lives: [part index, line], over every part.
    const lines = [];
    segments.forEach((sg, k) => sg.text.split('\n').forEach((line) => lines.push({ k, line })));
    const heads = headingsOf(lines.map((x) => x.line));
    const h = heads.find((x) => sameHeading(x.title, section));
    if (!h) throw new Error(`lesson ${nn} has no section "${section}". Its open sections: ${heads.filter((x) => lines[x.line].k < open).map((x) => `"${x.title}"`).join(', ')}`);
    const k = lines[h.line].k;
    if (k >= open) throw new Error(`section "${h.title}" is in part ${k + 1} of lesson ${nn}, which is not open yet. ${closedNote()}`);
    const next = heads.find((x) => x.line > h.line && x.level <= h.level);
    let end = next ? next.line : lines.length;
    const firstClosed = lines.findIndex((x) => x.k >= open);
    let cut = firstClosed >= 0 && firstClosed < end;
    if (cut) end = firstClosed;
    // A section with subsections prints up to the first of them and lists them, unless --whole.
    const subs = heads.filter((x) => x.line > h.line && x.line < end && x.level > h.level);
    const brief = subs.length > 0 && !whole;
    if (brief) { end = subs[0].line; cut = false; }
    const wholeNote = subs.length && whole ? ', with its subsections' : '';
    console.log(`${noFolder}Lesson ${nn}, section "${h.title}"${wholeNote} (in part ${k + 1} of ${total}). The whole part: ${cmd} --part ${k + 1}`);
    console.log('');
    console.log(shown(lines.slice(h.line, end).map((x) => x.line).join('\n')));
    console.log('');
    if (brief) {
      console.log(`Its subsections, each printed with --section "HEADING":\n${subs.map((x) => `  - ${x.title}`).join('\n')}`);
      console.log(`The section and all its subsections: ${cmd} --section "${h.title}" --whole`);
      return;
    }
    console.log(cut ? closedNote() : `End of section "${h.title}".`);
    return;
  }

  let from, to;
  // --next: the section after the one printed last for this lesson in this work folder.
  let chunk = 0;
  if (next) {
    if (all || part !== undefined || section !== undefined || whole) throw new Error('--next takes no --part, --all, --section or --whole');
    const at = readReading(dir)[nn];
    if (at && Number.isInteger(at.part) && at.part >= 1 && at.part <= open) { part = at.part; chunk = at.next ?? 0; } else part = open;
  }
  if (all) { from = 0; to = open; }
  else if (part !== undefined) {
    if (!Number.isInteger(part) || part < 1 || part > total) throw new Error(`lesson ${nn} has parts 1 to ${total}`);
    if (part > open) throw new Error(`part ${part} of lesson ${nn} is not open yet. ${closedNote()}`);
    from = part - 1; to = part;
  } else { from = open - 1; to = open; }

  const text = segments.slice(from, to).map((sg) => sg.text).join('\n');
  // The part's sections, so one can be printed on its own. A part that begins inside a
  // section names that section first.
  const before = segments.slice(0, from).map((sg) => sg.text).join('\n').split('\n');
  const carried = from > 0 ? headingsOf(before).filter((x) => x.level === 2).at(-1) : null;
  const heads = headingsOf(text.split('\n'));
  const startsInside = carried && !(heads[0] && text.split('\n').slice(0, heads[0].line).every((l) => !l.trim()));
  const list = [...(startsInside ? [`  - ${carried.title} (continued from the part before)`] : []), ...heads.map((x) => `${x.level === 3 ? '      - ' : '  - '}${x.title}`)];
  const which = all ? `parts 1 to ${open} of ${total}, every part open so far` : `part ${from + 1} of ${total}`;
  const others = [];
  if (!all && open > 1) others.push(`another open part with --part K (1 to ${open})`);
  if (!all && open > 1) others.push('every open part with --all');
  others.push('one section with --section "HEADING" (a section with subsections prints up to them and lists them; add --whole for all of it)');
  console.log(`${noFolder}Lesson ${nn}, ${which}. Print ${others.join(', ')}.`);
  if (list.length) console.log(`Its sections:\n${list.join('\n')}`);
  if (sections) {
    console.log('');
    console.log(`The text itself: ${cmd}${all ? ' --all' : part !== undefined ? ` --part ${part}` : ''}`);
    return;
  }
  const full = shown(text);
  const partNote = () => (to < open ? `Part ${to + 1} is open too: ${cmd} --part ${to + 1}` : endNote());
  if (all || whole || (!next && full.length <= PART_LIMIT)) {
    console.log('');
    console.log(full);
    console.log('');
    console.log(partNote());
    return;
  }
  // A long part prints one section at a time: the text before its first heading, if any, then
  // each section and subsection on its own. --next prints the one after.
  const lines = text.split('\n');
  const starts = [0, ...heads.map((x) => x.line)].filter((n, i, a) => a.indexOf(n) === i);
  const pieces = starts.map((n, i) => lines.slice(n, starts[i + 1] ?? lines.length).join('\n')).filter((t) => shown(t));
  if (chunk >= pieces.length) {
    // The part is read to its end: go on to the next open part, or say where the lesson stops.
    if (to < open) { saveReading(dir, nn, { part: to + 1, next: 0 }); console.log(`Part ${to} is read to its end. Part ${to + 1}: ${cmd} --next`); return; }
    console.log(endNote());
    return;
  }
  console.log(`This part is long, so it prints one section at a time: section ${chunk + 1} of ${pieces.length}.`);
  console.log('');
  console.log(shown(pieces[chunk]));
  console.log('');
  saveReading(dir, nn, { part: from + 1, next: chunk + 1 });
  const whole_ = `the whole part: ${cmd} --part ${from + 1} --whole`;
  if (chunk + 1 < pieces.length) console.log(`The next section: ${cmd} --next (or ${whole_})`);
  else console.log(`That is the last section of part ${from + 1}. ${partNote()}`);
}

async function practiceStatus(dir) {
  const commits = readCommits(dir);
  const { practice } = await practiceData();
  const committed = [], waiting = [], older = [];
  for (const l of config.lessons) for (const id of l.practice) {
    (practice[id] ?? []).forEach((it, v) => {
      const c = commitFor(commits, id, v, it);
      if (c) committed.push({ id, question: v + 1, correct: c.correct, answer: c.answer });
      const old = olderCommit(commits, id, v, it);
      if (old) older.push({ id, question: v + 1, answer: old.answer, prompt: old.prompt });
    });
    if (!fullyAnswered(practice, commits, id)) waiting.push(id);
  }
  const ids = config.lessons.flatMap((l) => l.practice);
  return { committed, waiting, older, items: ids.length, questions: ids.reduce((n, id) => n + (practice[id]?.length ?? 0), 0) };
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
  const valued = ['--mode', '--seed', '--rounds', '--game', '--level', '--picker', '--model', '--pickers', '--runs', '--help-used', '--part', '--section', '--place', '--find'];
  const onlyAt = argv.indexOf('--only');
  if (onlyAt >= 0 && (!argv[onlyAt + 1] || argv[onlyAt + 1].startsWith('--'))) throw new Error('--only needs the ids of the checks to run, separated by commas');
  const only = onlyAt >= 0 ? argv[onlyAt + 1].split(',').map((x) => x.trim()).filter(Boolean) : null;
  flags.fresh = argv.includes('--fresh');
  flags.all = argv.includes('--all');
  flags.sections = argv.includes('--sections');
  flags.whole = argv.includes('--whole');
  flags.next = argv.includes('--next');
  flags.full = argv.includes('--full');
  flags.answers = argv.includes('--answers');
  if (argv.includes('--live')) throw new Error('--live is gone: the only model is the decision model. Use --picker live (and --model M) to ask one on Ollama');
  const skip = new Set();
  for (const f of valued) {
    const i = argv.indexOf(f);
    if (i < 0) continue;
    skip.add(i + 1);
    const v = argv[i + 1];
    if (f === '--game') { if (!['lob', 'lob2'].includes(v)) throw new Error('--game is lob or lob2'); flags.game = v; continue; }
    if (f === '--picker') { if (!['rule', 'first', 'random', 'live'].includes(v)) throw new Error('--picker is rule, first, random or live'); flags.picker = v; continue; }
    if (f === '--place' || f === '--find') { if (v === undefined) throw new Error(`${f} needs a text to match`); flags[f.slice(2)] = v; continue; }
    if (f === '--section') { if (!v || v.startsWith('--')) throw new Error('--section needs a heading in quotes, as the lesson prints it'); flags.section = v; continue; }
    if (f === '--help-used') { if (!v || v.startsWith('--')) throw new Error('--help-used needs a description in quotes'); flags.helpUsed = v; continue; }
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
  else if (command === 'check' && rest.length === 2) await check(rest[0], resolve(rest[1]), { variant: 0, json, only, helpUsed: flags.helpUsed });
  else if (command === 'status' && rest.length === 1) await status(resolve(rest[0]), { json, typed: rest[0], answers: flags.answers });
  else if (command === 'lesson' && rest.length === 2) await lessonText(rest[0], resolve(rest[1]), rest[1], { part: flags.part, all: flags.all, section: flags.section, sections: flags.sections, whole: flags.whole, next: flags.next });
  else if (command === 'question' && rest.length === 2) await question(rest[0], resolve(rest[1]), rest[1]);
  // An answer may hold spaces ("1, 2, 3" typed without quotes): everything between ID and the folder.
  else if (command === 'answer' && rest.length >= 3) await answer(rest[0], rest.slice(1, -1).join(' '), resolve(rest.at(-1)), rest.at(-1));
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
