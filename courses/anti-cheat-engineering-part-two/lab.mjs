#!/usr/bin/env node
// The lab for part two. Run `node lab.mjs help` for the commands.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, cpSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { availableParallelism } from 'node:os';
import { runUnit, UNITS, listCases } from './checks/run.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'course.json'), 'utf8'));
const say = (s = '') => console.log(s);
const stamp = () => new Date().toISOString().replaceAll(':', '-');
const unitTitle = (u) => config.units.find((x) => x.id === u)?.title ?? '';

function project(dir) {
  if (!dir) throw Error('Name your project folder: node lab.mjs COMMAND PROJECT ...');
  const p = resolve(dir);
  if (!existsSync(join(p, 'PROJECT.json'))) throw Error(`${dir} is not a project folder: run node lab.mjs init ${dir} first`);
  return p;
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? filesUnder(join(dir, d.name)) : [join(dir, d.name)]);
}

// ------------------------------------------------------------------ init

function init(dir) {
  if (!dir) throw Error('Name a new folder: node lab.mjs init project');
  const target = resolve(dir);
  if (!existsSync(join(root, 'starter'))) throw Error('This course has no starter/ folder yet.');
  if (!existsSync(dirname(target))) throw Error(`${dirname(target)} does not exist: make the folder that will hold ${dir} first.`);
  mkdirSync(target); // refuses an existing folder, so a project is never overwritten
  cpSync(join(root, 'starter'), target, { recursive: true });
  writeFileSync(join(target, 'PROJECT.json'), JSON.stringify({ course: config.id, started: new Date().toISOString() }, null, 2) + '\n');
  say(`Created ${dir} with ${config.workFiles.filter((f) => existsSync(join(target, f))).join(', ')}.`);
  // A starter file that imports a course file by a relative path (../../public/...) finds it
  // only when the project sits where the starter expects it.
  const lost = [];
  for (const f of filesUnder(target).filter((x) => x.endsWith('.mjs'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
      if (!existsSync(resolve(dirname(f), m[1]))) lost.push(`${relative(target, f)} imports ${m[1]}`);
    }
  }
  if (lost.length) say(`Note: ${lost[0]}, and that file is not there from ${dir}. Make the project inside the course folder (cd there, then node lab.mjs init project) so those imports find the course's files.`);
  say(`Read ${config.units[0].lesson}, then run: node lab.mjs check ${dir} ${UNITS[0]}`);
  say('The untouched starter fails every check with "not written yet".');
}

// ------------------------------------------------------------------ check and status

function line(r) {
  if (r.pass) return `PASS ${r.id}`;
  if (r.kind === 'timeout') return `FAIL ${r.id}: did not finish within ${r.limitMs / 1000} s`;
  if (r.kind === 'not-written') return `FAIL ${r.id}: ${r.message}`;
  if (r.kind === 'failure') return `FAIL ${r.id}: ${r.fields.checked ?? r.title}`;
  return `FAIL ${r.id}: ${r.message}${r.where ? ` (${r.where})` : ''}`;
}

async function check(dir, unit, { only = null, jobs = null, help = 'not declared' } = {}) {
  const p = project(dir);
  if (!unit) throw Error(`Choose a unit: node lab.mjs check ${dir} ${UNITS.join('|')}|all`);
  const units = unit === 'all' ? UNITS : [unit];
  if (!units.every((u) => UNITS.includes(u))) throw Error(`Choose a unit: ${UNITS.join(', ')} or all`);
  if (only?.length === 1 && only[0] === 'list') return listChecks(units);
  if (only) {
    const known = [];
    for (const u of units) known.push(...(await listCases(u)).cases.map((c) => c.id));
    const unknown = only.filter((id) => !known.includes(id));
    if (unknown.length) throw Error(`No check named ${unknown.join(', ')} in unit ${units.join(', ')}. The checks there: ${known.join(', ') || 'none yet'}.`);
  }
  const lanes = jobs ?? Math.min(4, availableParallelism());
  const attempt = join(p, 'attempts', `${stamp()}-${randomUUID().slice(0, 8)}`);
  mkdirSync(attempt, { recursive: true });
  for (const f of config.workFiles) if (existsSync(join(p, f))) { mkdirSync(dirname(join(attempt, f)), { recursive: true }); copyFileSync(join(p, f), join(attempt, f)); }
  let allPass = true;
  const saved = [];
  for (const u of units) {
    const listed = await listCases(u);
    if (only && !listed.cases.some((c) => only.includes(c.id))) continue;
    say(`Unit ${u}: ${listed.title ?? unitTitle(u)}`);
    if (listed.missing || listed.loadError) {
      say(listed.missing ? `Its checks are not written yet (checks/${u}.mjs is missing), so nothing ran.\n` : `Its checks could not be loaded: ${listed.loadError}\n`);
      allPass = false;
      saved.push({ unit: u, ...(listed.missing ? { missing: true } : { loadError: listed.loadError }), results: [] });
      continue;
    }
    const report = await runUnit(p, u, { only, jobs: lanes });
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
    saved.push({ unit: u, ...(only ? { only: report.results.map((r) => r.id) } : {}), results: report.results.map(({ id, pass, kind, fields, message, ms, requirement }) => ({ id, pass, kind, requirement, fields, message, ms })) });
  }
  writeFileSync(join(attempt, 'receipt.json'), JSON.stringify({ course: config.id, help_used: help, units: saved, at: new Date().toISOString() }, null, 2) + '\n');
  if (saved.length > 1) say(allPass ? `All ${saved.length} units pass.` : 'Some checks fail.');
  say(`Saved this attempt in ${attempt}. A pass covers these cases only.`);
  process.exitCode = allPass ? 0 : 1;
}

// check PROJECT UNIT --case list: each unit's check ids with their titles. Nothing runs and
// nothing is saved.
async function listChecks(units) {
  let loaded = true;
  for (const u of units) {
    const listed = await listCases(u);
    say(`Unit ${u}: ${listed.title ?? unitTitle(u)}`);
    if (listed.missing || listed.loadError) {
      say(listed.missing ? `  Its checks are not written yet (checks/${u}.mjs is missing).` : `  Its checks could not be loaded: ${listed.loadError}`);
      loaded = false;
      continue;
    }
    const width = Math.max(0, ...listed.cases.map((c) => String(c.id).length));
    for (const c of listed.cases) say(`  ${String(c.id).padEnd(width)}  ${c.title}`);
  }
  say('Run one with --case ID, or several with --case ID,ID.');
  process.exitCode = loaded ? 0 : 1;
}

// Every attempt is its own folder under attempts/, so the first is kept and later ones are added.
// A folder's name starts with its time, so sorted names are in order: check runs, predictions,
// and lesson 14's freezes and held-out runs (labcmds/14.mjs writes those two).
function status(dir) {
  const p = project(dir);
  const folder = join(p, 'attempts');
  let shown = 0;
  const answered = new Set();
  const record = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
  for (const name of existsSync(folder) ? readdirSync(folder).sort() : []) {
    const receipt = join(folder, name, 'receipt.json'), prediction = join(folder, name, 'prediction.json');
    const freeze = join(folder, name, 'freeze.json'), heldout = join(folder, name, 'heldout.json');
    if (existsSync(receipt)) {
      for (const u of JSON.parse(readFileSync(receipt, 'utf8')).units) {
        const n = u.results.length, passed = u.results.filter((x) => x.pass).length;
        say(`${name} unit ${u.unit}: ${u.missing ? 'its checks were not written yet' : u.loadError ? 'its checks did not load' : `${passed} of ${n} pass${u.only ? ` (only ${u.only.join(', ')})` : ''}`}`);
        shown++;
      }
    } else if (existsSync(prediction)) {
      const r = JSON.parse(readFileSync(prediction, 'utf8'));
      say(`${name} question ${r.id}: ${JSON.stringify(r.answer)}, ${r.correct ? 'correct' : 'not correct'}${answered.has(r.id) ? ' (answered again)' : ' (first answer)'}`);
      answered.add(r.id);
      shown++;
    } else if (existsSync(freeze)) {
      const r = record(freeze);
      say(`${name} freeze: ${r ? `${Object.keys(r.files ?? {}).join(', ')} hashed, threshold ${r.dev?.threshold}${r.afterHeldout ? ', after a held-out result' : ''}` : 'freeze.json is not valid JSON'}`);
      shown++;
    } else if (existsSync(heldout)) {
      const r = record(heldout), c = r?.result;
      const precision = typeof r?.precisionAt1in100 === 'number' ? r.precisionAt1in100.toFixed(3) : '-';
      say(`${name} held-out run ${r?.run ?? '?'}: ${c ? `tp ${c.tp}  fn ${c.fn}  fp ${c.fp}  tn ${c.tn}, precision at 1 in 100 ${precision}${r.first ? ' (your first result, the one you report)' : ' (a later run)'}` : 'heldout.json is not valid JSON'}`);
      shown++;
    }
  }
  if (!shown) say('No attempts yet.');
  // practice-10: a question missed with no fresh case left is asked again later. Attempts are
  // in time order, so the map keeps each question's latest answer to its current version.
  const items = practice();
  const latest = new Map();
  for (const name of existsSync(folder) ? readdirSync(folder).sort() : []) {
    const r = record(join(folder, name, 'prediction.json'));
    if (r && items[r.id] && (r.version ?? 1) === (items[r.id].version ?? 1)) latest.set(r.id, r);
  }
  const due = [...latest.values()].filter((r) => !r.correct && !items[r.id].retry).map((r) => r.id);
  if (due.length) say(`Due for another try, later (after your next lesson, if there is one): ${due.join(', ')}. Ask each with node lab.mjs question ID, then commit it again.`);
}

// ------------------------------------------------------------------ practice

const practice = () => JSON.parse(readFileSync(join(root, 'practice.json'), 'utf8'));
function item(id) {
  const q = practice()[id];
  if (!q) throw Error(`Unknown question ${id}. The lessons name each one.`);
  return q;
}
// An answer in the form answers are compared in, so that only what it says counts, not how
// it is written: trimmed, in lower case, with single spaces; one trailing full stop dropped;
// one pair of enclosing (), [] or {} taken off, so "(b)" is b; a trailing unit word or sign
// dropped; a number as its value, so 2,500 is 2500 and 25.0 is 25; and a list of numbers,
// separated by commas and/or spaces, as its values in order, so "[1, 2, 5]" is 1,2,5.
const UNIT = /(^|[\d\s])(mm|millimetres|millimeters|ms|%|percent|ticks|tick|points|point|paces|pace)$/;
const NUMBER = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)$/; // commas only between groups of three digits
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const CLOSING = { '(': ')', '[': ']', '{': '}' };
function normal(answer) {
  let s = String(answer).trim().toLowerCase().replace(/\s+/g, ' ');
  if (s.endsWith('.')) s = s.slice(0, -1).trimEnd();
  if (CLOSING[s[0]] && s.length > 1 && s.endsWith(CLOSING[s[0]])) s = s.slice(1, -1).trim();
  s = s.replace(UNIT, '$1').trim();
  if (NUMBER.test(s)) return String(Number(s.replaceAll(',', '')));
  const parts = s.split(/\s*,\s*|\s+/);
  if (parts.length > 1 && parts.every((p) => PLAIN_NUMBER.test(p))) return parts.map(Number).join(',');
  return s;
}
// Whether an answer counts as correct for a practice item: the item's own checker.
export function accepts(q, answer) { return [q.expected, ...(q.accept ?? [])].map(normal).includes(normal(answer)); }

function question(id) {
  const q = item(id);
  say(q.question);
  say(`Answer format: ${q.format}`);
  say(`Commit with: node lab.mjs predict PROJECT ${id} ANSWER`);
}

function predict(dir, id, answer, help) {
  const p = project(dir);
  const q = item(id);
  if (typeof answer !== 'string' || !answer.trim()) throw Error(`Give an answer: node lab.mjs predict ${dir} ${id} ANSWER`);
  const correct = accepts(q, answer);
  const record = { kind: 'prediction', id, version: q.version, question: q.question, answer, help_used: help, correct, expected: q.expected, at: new Date().toISOString() };
  const folder = join(p, 'attempts', `${stamp()}-${id}-${randomUUID().slice(0, 8)}`);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'prediction.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  say(`Your answer: ${answer}`);
  say(correct ? 'Correct.' : `Not this time. The answer is ${q.expected}.`);
  const wrong = (q.wrong ?? []).find((w) => normal(w.answer) === normal(answer));
  say(wrong ? wrong.feedback : q.reason);
  // practice-10: a pointer to the section that teaches the idea, then a fresh case, or, when
  // none is left, the same question again later (status lists it as due).
  const home = q.variantOf ? item(q.variantOf) : q;
  if (!correct && home.section) {
    say(q.retry && q.retry !== id
      ? `Read lesson ${home.lesson}, "${home.section}", then try a fresh case of the same idea: node lab.mjs question ${q.retry}`
      : `Read lesson ${home.lesson}, "${home.section}". No fresh case of this idea is left, so ask this one again later, after your next lesson if there is one: node lab.mjs status ${dir} lists it as due, and node lab.mjs question ${id} shows it.`);
  }
}

// ------------------------------------------------------------------ commands

function caseOption(o) {
  if (o.case === undefined) return null;
  if (o.case === true || !String(o.case).trim()) throw Error('Name the check: --case ID, or --case list to see the unit\'s checks');
  return String(o.case).split(',').map((s) => s.trim()).filter(Boolean);
}
function jobsOption(o) {
  if (o.jobs === undefined) return null;
  const n = Number(o.jobs);
  if (!Number.isInteger(n) || n < 1) throw Error('--jobs takes a whole number of processes, 1 or more');
  return n;
}
const helpUsed = (o) => (typeof o['help-used'] === 'string' ? o['help-used'] : 'not declared');

// Each row: { name, args, about, run({ plain, o }) }. plain holds the arguments that are not
// options; o holds the options (--name VALUE or --name=VALUE; a bare --name is true).
const CORE = [
  { name: 'init', args: 'PROJECT', about: 'make your project folder with the starter files', run: ({ plain }) => init(plain[0]) },
  { name: 'check', args: `PROJECT UNIT|all [--case ID|list] [--jobs N] [--help-used TEXT]`, about: `run the checks of unit UNIT (${UNITS[0]} to ${UNITS.at(-1)}) on your files; --case list names them`,
    run: ({ plain, o }) => check(plain[0], plain[1], { only: caseOption(o), jobs: jobsOption(o), help: helpUsed(o) }) },
  { name: 'status', args: 'PROJECT', about: 'list your saved check attempts, predictions, freezes and held-out runs, in order', run: ({ plain }) => status(plain[0]) },
  { name: 'question', args: 'ID', about: 'show a prediction question (IDs are in the lessons)', run: ({ plain }) => question(plain[0]) },
  { name: 'predict', args: 'PROJECT ID ANSWER [--help-used TEXT]', about: 'commit an answer before reading on, then see the reason',
    run: ({ plain, o }) => predict(plain[0], plain[1], plain.slice(2).join(' '), helpUsed(o)) },
  { name: 'help', args: '', about: 'show this list', run: () => say(usage()) },
];

// ------------------------------------------------------------------ measurement commands
// The course's measurement commands go here: cost, corpus, sweep, scoreboard and others.
// Write each command's function in this section, then add its row to MEASURE, in the
// same shape as the rows of CORE above. The usage lists every row, so it lists only
// commands that exist.
// ---- units 15 and 16: sweep and crash.
// Your functions are loaded with the checks' loader. A function that still throws "not
// written yet", or throws anything else, stops the command with one line naming it.
class LabStop extends Error {}

function whereInProject(error, p) {
  const roots = [p];
  try { roots.push(realpathSync(p)); } catch { /* keep the given path */ }
  for (const line of String(error?.stack ?? '').split('\n')) {
    for (const r of roots) {
      const i = line.indexOf(r);
      const m = i < 0 ? null : line.slice(i + r.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return `${decodeURIComponent(m[1])} line ${m[2]}`;
    }
  }
  return null;
}

async function learnerFunctions(dir, file, names, passThrough = () => false) {
  const p = project(dir);
  const { makeLoader } = await import('./checks/harness.mjs');
  const loader = makeLoader(p);
  const out = {};
  for (const name of names) {
    let f;
    try { f = await loader.fn(file, name); } catch (e) { throw new LabStop(String(e.fields?.observed ?? e.message).split('\n')[0]); }
    out[name] = (...args) => {
      try {
        return f(...args);
      } catch (e) {
        if (e instanceof LabStop || passThrough(e)) throw e;
        const message = String(e?.message ?? e).split('\n')[0];
        // The starter's message names its function ("recover: not written yet"), which may be one this function calls.
        if (message.includes('not written yet')) throw new LabStop(`${message.match(/^(\w+): not written yet/)?.[1] ?? name} in ${file} is not written yet: write it (API.md says what it must do), then run this again.`);
        const where = whereInProject(e, p);
        throw new LabStop(`your ${name} in ${file} threw ${e?.name ?? 'Error'}: ${message}${where ? ` (${where})` : ''}`);
      }
    };
  }
  return out;
}

function wholeOption(o, name, fallback, least) {
  if (o[name] === undefined) return fallback;
  const n = Number(o[name]);
  if (o[name] === true || !Number.isSafeInteger(n) || n < least) throw Error(`--${name} takes a whole number, ${least} or more`);
  return n;
}

const SWEEP_WINDOWS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

async function sweep(dir, o) {
  const seed = wholeOption(o, 'seed', 1, 0);
  const sessions = wholeOption(o, 'sessions', 100, 1);
  const f = await learnerFunctions(dir, 'courier/rewind.mjs', ['positionAt', 'measureRtt', 'judgeInteract', 'tally', 'pickWindow']);
  const { runCourier, SESSION_TICKS, MODEL_NAMES } = await import('./public/courier.mjs');
  const rows = SWEEP_WINDOWS.map((window) => {
    const run = runCourier({ seed, sessions, window, judge: f.judgeInteract, measureRtt: f.measureRtt, positionAt: f.positionAt });
    const mean = (who) => { const mine = run.sessions.filter((s) => s.who === who); return mine.reduce((sum, s) => sum + s.deliveries, 0) / mine.length; };
    return { ...f.tally(run.outcomes), window, deliveries: MODEL_NAMES.map(mean) };
  });
  const pad = (value, width) => String(value).padStart(width);
  const percent = (value) => `${(100 * value).toFixed(2)}%`;
  say(`Courier window table: seed ${seed}, ${sessions} sessions per model, ${SESSION_TICKS} ticks each, judged by your judgeInteract, measureRtt and positionAt, counted by your tally.`);
  say('');
  say(`${pad('window', 6)} ${pad('honest', 7)} ${pad('legit', 6)} ${pad('rate', 7)}  ${pad('naive cheats', 16)}  ${pad('slow cheats', 16)}  ${pad('deliveries h / n / s', 22)}`);
  for (const r of rows) {
    const deliveries = r.deliveries.map((d) => d.toFixed(1)).join(' / ');
    say(`${pad(r.window, 6)} ${pad(r.honest, 7)} ${pad(r.legit, 6)} ${pad(percent(r.legitRate), 7)}  ${pad(`${r.naiveCheats} of ${r.naive}`, 16)}  ${pad(`${r.slowCheats} of ${r.slow}`, 16)}  ${pad(deliveries, 22)}`);
  }
  say('window: the most ticks the server rewinds; honest: honest interactions; legit: those refused although in range at seen; rate: legit / honest; cheats: a faker\'s presses accepted while not in range now, of all its presses; deliveries: mean per session, honest / naive / slow-pong.');
  say('');
  for (const budget of [0.01, 0.02]) {
    const window = f.pickWindow(rows.map((r) => ({ ...r })), budget);
    const row = rows.find((r) => r.window === window);
    say(window === null ? `pickWindow(rows, ${budget}) = null: no window meets the budget`
      : row ? `pickWindow(rows, ${budget}) = ${window}: legit rate ${percent(row.legitRate)}, slow-pong cheats ${row.slowCheats} of ${row.slow}, naive cheats ${row.naiveCheats}`
      : `pickWindow(rows, ${budget}) = ${JSON.stringify(window)}: no row of the table has that window`);
  }
}

// One sale and a second sale of the same sword: ana sells bo the sword for 40, then tries to sell it to cy.
const CRASH_WORLD = { 'inv:ana': ['sword', 'lamp'], 'inv:bo': ['bow'], 'inv:cy': ['cap'], 'coins:ana': 20, 'coins:bo': 100, 'coins:cy': 60 };
const CRASH_SCRIPT = [
  { key: 'sale-1', seller: 'ana', buyer: 'bo', item: 'sword', price: 40 },
  { key: 'sale-2', seller: 'ana', buyer: 'cy', item: 'sword', price: 30 },
];

async function crash(dir, o) {
  const naive = o.naive !== undefined;
  if (naive && typeof o.naive === 'string' && !dir) dir = o.naive; // node lab.mjs crash --naive project
  const { createStore, Crash, naiveTrade } = await import('./public/store.mjs');
  let trade = (store, request) => naiveTrade(store, request);
  let recover = null;
  if (naive) project(dir);
  else ({ trade, recover } = await learnerFunctions(dir, 'trade/trade.mjs', ['trade', 'recover'], (e) => e instanceof Crash));
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const answerText = (a) => (!a || typeof a !== 'object' ? JSON.stringify(a) ?? 'nothing' : a.ok === true ? 'ok' : a.ok === false ? String(a.reason) : JSON.stringify(a));
  const belongings = (snap) => JSON.stringify(Object.keys(snap).filter((k) => /^(inv|coins):/.test(k)).sort()
    .map((k) => [k, Array.isArray(snap[k]) ? [...snap[k]].sort() : snap[k]]).filter(([, v]) => !(Array.isArray(v) && !v.length) && v !== 0));
  const coins = (snap) => Object.entries(snap).filter(([k, v]) => k.startsWith('coins:') && typeof v === 'number').reduce((s, [, v]) => s + v, 0);
  const holders = (snap, item) => Object.entries(snap).filter(([k, v]) => k.startsWith('inv:') && Array.isArray(v)).flatMap(([k, v]) => v.filter((id) => id === item).map(() => k.slice(4)));
  const sword = (snap) => `sword: ${holders(snap, 'sword').join(', ') || 'nobody'}; coins ${coins(snap)}`;
  const items = Object.entries(CRASH_WORLD).filter(([k]) => k.startsWith('inv:')).flatMap(([, v]) => v);
  const total = coins(CRASH_WORLD);
  const broken = (snap) => [
    ...items.map((id) => [id, holders(snap, id)]).filter(([, h]) => h.length !== 1).map(([id, h]) => `the ${id} is held ${h.length ? `${h.length} times (${h.join(', ')})` : 'by nobody'}`),
    ...(coins(snap) !== total ? [`the coins add up to ${coins(snap)}, not ${total}`] : []),
  ];

  // The run without a crash: answers, belongings before and after each request, writes.
  const clean = createStore(CRASH_WORLD);
  const steps = CRASH_SCRIPT.map((request) => {
    const before = clean.snapshot();
    const answer = trade(clean, copy(request));
    return { request, answer, before, after: clean.snapshot() };
  });
  const writes = clean.writes;
  const who = naive ? 'public/store.mjs\'s naiveTrade (four puts in order, no journal, no key)' : 'your trade and recover';
  say(`Crash test: ${who}.`);
  say(`  start: ana [sword lamp] 20, bo [bow] 100, cy [cap] 60 (coins ${total})`);
  say(`  script: ${CRASH_SCRIPT.map((r, i) => `${i + 1}. ${r.key}: ${r.seller} sells ${r.buyer} the ${r.item} for ${r.price}`).join('; ')}`);
  say(`  without a crash: ${steps.map((s) => `${s.request.key} ${answerText(s.answer)}`).join(', ')}; ${writes} writes in all, so ${writes} crash points.`);
  say(`  At each crash point the server restarts${naive ? ' (naiveTrade has no recovery)' : ', runs your recover'}, and the client sends the interrupted request again.`);
  say('');
  const pad = (v, w) => String(v).padEnd(w);
  say(`${pad('write', 6)}${pad('request', 9)}${pad('recover', 12)}${pad('after recovery', 28)}${pad('retry', 9)}${pad('after the retry', 28)}${pad('rival', 9)}problems`);
  const notes = [];
  let violations = 0;
  let hit = 0;
  for (let g = 1; g <= writes; g += 1) {
    const store = createStore(CRASH_WORLD);
    store.crashAfter(g);
    let at = -1;
    const problems = [];
    for (const [i, step] of steps.entries()) {
      try {
        trade(store, copy(step.request));
      } catch (e) {
        if (!(e instanceof Crash)) throw e;
        at = i;
        break;
      }
      if (store.writes >= g) { at = i; problems.push('your trade caught the Crash and went on, but a crashed server cannot answer'); break; }
    }
    if (at < 0) { notes.push(`write ${g}: the crash never came (your trades made fewer writes than without it)`); violations += 1; hit += 1; continue; }
    store.restart();
    const recovered = recover ? JSON.stringify(recover(store)) : '-';
    const afterRecovery = store.snapshot();
    problems.push(...broken(afterRecovery).map((p) => `after recovery ${p}`));
    const step = steps[at];
    if (![belongings(step.before), belongings(step.after)].includes(belongings(afterRecovery))) problems.push(`after recovery ${step.request.key} is half made`);
    const retry = trade(store, copy(step.request));
    const afterRetry = store.snapshot();
    const receiptOk = naive || !step.answer?.ok || ['key', 'seller', 'buyer', 'item', 'price'].every((k) => retry?.receipt?.[k] === step.request[k]);
    if (answerText(retry) !== answerText(step.answer) || !receiptOk) problems.push(`the retry answered ${answerText(retry)}${receiptOk ? '' : ' without the receipt'}, not ${answerText(step.answer)}${naive ? '' : ' with the receipt'}`);
    if (belongings(afterRetry) !== belongings(step.after)) problems.push(`after the retry ${step.request.key} has not happened exactly once${broken(afterRetry).length ? ` (${broken(afterRetry).join('; ')})` : ''}`);
    let rival = '';
    for (const later of steps.slice(at + 1)) {
      const answer = trade(store, copy(later.request));
      if (later === steps[1]) rival = answerText(answer);
      if (answerText(answer) !== answerText(later.answer)) problems.push(`${later.request.key} answered ${answerText(answer)}, not ${answerText(later.answer)}`);
    }
    say(`${pad(g, 6)}${pad(step.request.key, 9)}${pad(recovered, 12)}${pad(sword(afterRecovery), 28)}${pad(answerText(retry), 9)}${pad(sword(afterRetry), 28)}${pad(rival || '-', 9)}${problems.length}`);
    if (problems.length) { notes.push(`write ${g}: ${problems.join('; ')}`); violations += problems.length; hit += 1; }
  }
  say(`write: the crash came right after this write; request: the one it interrupted; recover: ${naive ? '- (naiveTrade has no recovery, so after recovery is the store as the restart found it)' : 'what your recover returned'}; after recovery, after the retry: who holds the sword, and all coins together (${total} at the start); retry: the answer when the client sends the request again; rival: the answer to sale-2, ana selling cy the same sword.`);
  say('');
  for (const n of notes) say(n);
  say(`violations: ${violations}${violations ? ` at ${hit} of ${writes} crash points` : ` at ${writes} crash points`}`);
  if (violations && !naive) process.exitCode = 1;
}

const MEASURE = [
  { name: 'sweep', args: 'PROJECT [--sessions N] [--seed S]', about: 'the courier window table with your rewind functions, and pickWindow for budgets 1% and 2%',
    run: ({ plain, o }) => sweep(plain[0], o) },
  { name: 'crash', args: 'PROJECT [--naive]', about: 'a crash after every write of a sale, with your trade and recover (or naiveTrade)',
    run: ({ plain, o }) => crash(plain[0], o) },
];
// ------------------------------------------------------------------ end of measurement commands

// Units 12, 13, 14 and 17 keep their measurement commands in labcmds/NN.mjs, each
// exporting `commands`: rows of the same shape as MEASURE's.
async function unitCommands(units) {
  const rows = [];
  for (const unit of units) {
    const file = join(root, 'labcmds', `${unit}.mjs`);
    if (existsSync(file)) rows.push(...(await import(pathToFileURL(file).href)).commands);
  }
  return rows;
}

export const COMMANDS = [...CORE, ...await unitCommands(['12', '13', '14']), ...MEASURE, ...await unitCommands(['17'])];

export function usage() {
  const rows = COMMANDS.map((c) => [`  ${c.name}${c.args ? ' ' + c.args : ''}`, c.about]);
  return ['Usage: node lab.mjs COMMAND ...', ...rows.map(([left, about]) => (left.length < 36 ? left.padEnd(36) + about : `${left}\n${''.padEnd(36)}${about}`))].join('\n');
}

function options(rest) {
  const o = {}, plain = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) { plain.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 2) o[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < rest.length && !rest[i + 1].startsWith('--')) o[a.slice(2)] = rest[++i];
    else o[a.slice(2)] = true;
  }
  return { o, plain };
}

async function main([verb, ...rest]) {
  try {
    const { o, plain } = options(rest);
    const command = COMMANDS.find((c) => c.name === (verb === '--help' || verb === '-h' ? 'help' : verb));
    if (!verb) say(usage());
    else if (!command) { say(usage()); process.exitCode = 2; }
    else await command.run({ plain, o });
  } catch (e) {
    console.error(e.code === 'EEXIST' ? 'That folder exists: choose a new name. Nothing was overwritten.' : e.message);
    process.exitCode = 2;
  }
}

// Run as a command; importing this file (the course's own tools do) runs nothing.
function invoked() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (invoked()) await main(process.argv.slice(2));
