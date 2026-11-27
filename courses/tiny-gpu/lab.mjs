#!/usr/bin/env node
// The lab for "Build a tiny GPU". Run `node lab.mjs help` for the commands.
// Every command that takes a project folder uses ./project when you name none.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { networkInterfaces } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'course.json'), 'utf8'));
const UNITS = config.lessons;
const ROUTES = ['write', 'supplied', 'ai'];
const DEFAULT_PROJECT = 'project';
const CHECK_SECONDS = 120;
const say = (s = '') => console.log(s);
// "1 level", "2 levels": a count and its noun, singular or plural.
const count = (n, noun) => `${n.toLocaleString('en')} ${noun}${n === 1 ? '' : 's'}`;
const stamp = () => new Date().toISOString().replaceAll(':', '-');
const firstLine = (e) => String(e?.message ?? e).split('\n')[0];
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const shown = (p) => relative(process.cwd(), p) || '.';

// ------------------------------------------------------------------ arguments

// Unit numbers, routes and the project folder may come in any order: `check 1 project`
// and `check project 1` mean the same.
const isUnit = (a) => /^0?[1-9]$/.test(a);
function parse(plain) {
  const unit = plain.find(isUnit)?.replace(/^0/, '');
  const route = plain.find((a) => ROUTES.includes(a));
  const rest = plain.filter((a) => !isUnit(a) && !ROUTES.includes(a));
  return { unit, route, dir: rest[0] ?? DEFAULT_PROJECT, extra: rest.slice(1) };
}

function unitOf(n, command) {
  const u = UNITS.find((x) => x.id === n);
  if (!u) throw Error(`Name a unit from 1 to ${UNITS.length}: node lab.mjs ${command}`);
  return u;
}

function projectDir(dir) {
  const p = resolve(dir);
  if (!existsSync(join(p, 'PROJECT.json'))) throw Error(`${dir} is not a project folder: make one with node lab.mjs start ${dir}`);
  return p;
}
const readProject = (p) => readJson(join(p, 'PROJECT.json'));
const writeProject = (p, info) => writeFileSync(join(p, 'PROJECT.json'), JSON.stringify(info, null, 2) + '\n');

// ------------------------------------------------------------------ regions

// A learner function sits between "// region: NAME" and "// endregion: NAME".
function regionSpan(lines, name) {
  const a = lines.indexOf(`// region: ${name}`);
  const b = a < 0 ? -1 : lines.indexOf(`// endregion: ${name}`, a + 1);
  return b < 0 ? null : [a, b];
}
function regionOf(text, name) {
  const lines = text.split('\n');
  const s = regionSpan(lines, name);
  return s ? lines.slice(s[0] + 1, s[1]).join('\n') : null;
}
function withRegion(text, name, inner) {
  const lines = text.split('\n');
  const s = regionSpan(lines, name);
  return [...lines.slice(0, s[0] + 1), ...inner.split('\n'), ...lines.slice(s[1])].join('\n');
}

// Line endings are read as \n, so a checkout that turned them into \r\n still finds its regions.
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null);
const starterText = (file) => readIf(join(root, 'starter', 'gpu', file));

// What a project holds for one learner function: 'stub' (exactly as the starter has it),
// 'own' (anything else, even a part-written body that still holds the throw line) or
// 'missing' (no file or no region markers). Only a stub is ever filled in place.
function stateOf(p, w) {
  const mine = readIf(join(p, 'gpu', w.file));
  const region = mine === null ? null : regionOf(mine, w.fn);
  if (region === null) return 'missing';
  const stub = regionOf(starterText(w.file) ?? '', w.fn);
  return region.trimEnd() === (stub ?? '').trimEnd() ? 'stub' : 'own';
}
const label = (w) => `${w.file} ${w.fn}`;
const unfinished = (p, u) => u.writes.filter((w) => stateOf(p, w) !== 'own');

// ------------------------------------------------------------------ start and next

function start(dir, route) {
  const target = resolve(dir);
  const from = join(root, 'starter', 'gpu');
  if (!existsSync(from)) throw Error('starter/gpu is missing from this course folder.');
  if (existsSync(join(target, 'gpu')) || existsSync(join(target, 'PROJECT.json'))) {
    throw Error(`${dir} already holds a project. Nothing was overwritten; choose another folder name.`);
  }
  mkdirSync(target, { recursive: true });
  cpSync(from, join(target, 'gpu'), { recursive: true, force: false, errorOnExist: true });
  for (const d of ['briefs', 'out', 'transfer']) mkdirSync(join(target, d), { recursive: true });
  writeProject(target, { course: config.id, started: new Date().toISOString(), routes: {}, history: [] });
  say(`Created ${dir}/gpu/ (every function you will write throws "not written yet"), ${dir}/briefs/, ${dir}/transfer/ and ${dir}/out/.`);
  if (route) return next(dir, '1', route);
  say(`Next: node lab.mjs next ${dir} 1 write   (or supplied, or ai)`);
}

function next(dir, n, route) {
  const p = projectDir(dir);
  const u = unitOf(n, `next ${dir} N write|supplied|ai`);
  if (!ROUTES.includes(route)) throw Error(`Choose a route: node lab.mjs next ${dir} ${u.id} write|supplied|ai`);
  const before = UNITS.filter((x) => +x.id < +u.id).flatMap((x) => unfinished(p, x).map((w) => ({ unit: x.id, w })));
  if (route === 'supplied') supplied(dir, p, u, before);
  else if (route === 'ai') aiRoute(dir, p, u);
  else writeRoute(dir, p, u);
  if (route !== 'supplied' && before.length) {
    const units = [...new Set(before.map((b) => b.unit))];
    say(`Note: earlier units are not finished (${before.map((b) => label(b.w)).join(', ')}). Unit ${u.id} builds on them; node lab.mjs next ${dir} ${units[0]} supplied gives working ones.`);
  }
  const info = readProject(p);
  info.routes = { ...info.routes, [u.id]: route };
  info.history = [...(info.history ?? []), { unit: u.id, route, at: new Date().toISOString() }];
  writeProject(p, info);
  say(`Check with: node lab.mjs check ${u.id} ${dir}`);
}

function writeRoute(dir, p, u) {
  const todo = unfinished(p, u);
  if (!todo.length) return say(`Unit ${u.id}'s functions in ${dir}/gpu/ already hold your code. Nothing changed.`);
  // A function the lesson lists is typed from its listing; the capstone's has none.
  const md = readIf(join(root, u.lesson)) ?? '';
  const listed = todo.filter((w) => md.includes(`"region":"${w.fn}"`));
  if (!md || listed.length === todo.length) return say(`Unit ${u.id}, write route: type ${todo.map(label).join(', ')} in ${dir}/gpu/ as lesson ${u.id} shows them.`);
  const how = listed.length === 0 ? `from the contract lesson ${u.id} states; it has no listing, so every line is your own`
    : `(lesson ${u.id} lists ${listed.map((w) => w.fn).join(', ')}; the rest are your own)`;
  say(`Unit ${u.id}, write route: write ${todo.map(label).join(', ')} in ${dir}/gpu/ ${how}.`);
}

const BRIEF = (u) => `# Brief: unit ${u.id}

Write this brief in your own words before you give it to an agent.
\`node lab.mjs brief ${u.id}\` checks that it names the interface, the
constraints and the check command. It does not grade the writing.

## Goal

(What the code must make true, as something you can see in a picture
or a count.)

## Interface

(Each function the agent writes: its file, its arguments and what it
returns.)

## Constraints

(What the agent must leave alone, and the rules the code must follow.)

## Check

(The command that tells you whether the code works.)

## References

(Where the rules come from, described by what they say.)

## Hand back

(What you want back besides the code: what it changed, and what it did
not check.)
`;

function aiRoute(dir, p, u) {
  const name = `briefs/0${u.id}.md`;
  mkdirSync(join(p, 'briefs'), { recursive: true });
  if (existsSync(join(p, name))) say(`${dir}/${name} exists and was left as it is.`);
  else {
    writeFileSync(join(p, name), BRIEF(u), { flag: 'wx' });
    say(`Wrote ${dir}/${name}: headings to fill in your own words.`);
  }
  say(`AI route: fill in the brief, run node lab.mjs brief ${u.id} ${dir}, then give it to your agent. The functions it writes: ${u.writes.map(label).join(', ')}.`);
}

// Writes unit N's working functions into the project, never over code you wrote:
// a file that holds any of your own code gets the checkpoint beside it instead.
function supplied(dir, p, u, before) {
  if (!u.supplied) throw Error('The capstone has no supplied route: write it yourself, or brief an agent (ai).');
  const cp = join(root, 'starter', 'supplied', `${u.id}.json`);
  if (!existsSync(cp)) throw Error(`Unit ${u.id}'s supplied checkpoint is not in this course folder yet.`);
  if (before.length) {
    const first = before[0].unit;
    throw Error(`Unit ${u.id}'s checkpoint builds on the earlier units, and these are not written yet: ${before.map((b) => label(b.w)).join(', ')}. Write them, or start with node lab.mjs next ${dir} ${first} supplied. Nothing changed.`);
  }
  const byFile = new Map();
  for (const r of readJson(cp).regions) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  // Every file is checked before any is written, so a refusal leaves the project unchanged.
  const plan = [...byFile].map(([file, regions]) => {
    const mine = readIf(join(p, 'gpu', file));
    if (mine === null) throw Error(`${dir}/gpu/${file} is missing. Nothing changed.`);
    const states = regions.map((r) => stateOf(p, { file, fn: r.fn }));
    if (states.includes('missing')) throw Error(`${dir}/gpu/${file} has lost the region markers of ${regions.map((r) => r.fn).join(', ')}. Nothing changed.`);
    const filled = regions.reduce((t, r) => withRegion(t, r.fn, r.text), mine);
    const inPlace = states.every((s) => s === 'stub');
    const beside = join(p, 'supplied', u.id, file);
    if (!inPlace && existsSync(beside)) throw Error(`${dir}/supplied/${u.id}/${file} already exists from an earlier run. Compare it with your code, or move it away, then run this again. Nothing changed.`);
    return { file, regions, filled, inPlace, beside };
  });
  for (const { file, regions, filled, inPlace, beside } of plan) {
    if (inPlace) {
      writeFileSync(join(p, 'gpu', file), filled);
      say(`Filled in ${regions.map((r) => r.fn).join(', ')} in ${dir}/gpu/${file}.`);
      continue;
    }
    mkdirSync(dirname(beside), { recursive: true });
    writeFileSync(beside, filled, { flag: 'wx' });
    say(`${dir}/gpu/${file} holds your own code, so it was left as it is. The checkpoint's version is in ${dir}/supplied/${u.id}/${file}: compare the two and copy across what you need.`);
  }
}

// ------------------------------------------------------------------ learner code runs in a worker

// The learner's code runs in a worker thread with a time limit, so a loop that never ends
// stops with a message instead of hanging the lab.
function inWorker(job, seconds = CHECK_SECONDS) {
  return new Promise((done, fail) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { tinyGpuJob: job } });
    let settled = false;
    // The worker is stopped once it reports or runs out of time, so a timer left running by
    // learner code can't keep the lab alive, and a late exit event can't report twice.
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.terminate();
      fn(v);
    };
    const timer = setTimeout(() => finish(fail, Error(`Your code did not finish within ${seconds} seconds, so it was stopped. Look for a loop that never ends.`)), seconds * 1000);
    w.once('message', (m) => finish(done, m));
    w.once('error', (e) => finish(fail, e));
    w.once('exit', (code) => finish(fail, Error(`the worker stopped (exit code ${code}) before it reported`)));
  });
}

// ------------------------------------------------------------------ check

function attemptFolder(p, name) {
  const folder = join(p, 'attempts', `${stamp()}-${name}-${randomUUID().slice(0, 8)}`);
  mkdirSync(folder, { recursive: true });
  return folder;
}
function saveAttempt(p, name, file, data, withGpu = false) {
  const folder = attemptFolder(p, name);
  // The code a check graded is kept with its verdict: gpu/ and, for a new application, transfer/.
  for (const part of withGpu ? ['gpu', 'transfer'] : []) {
    if (existsSync(join(p, part))) cpSync(join(p, part), join(folder, part), { recursive: true });
  }
  writeFileSync(join(folder, file), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  return folder;
}

function resultLine(r, u) {
  const indent = (t) => String(t).replaceAll('\n', '\n       ');
  if (r.pass) return `  PASS ${r.id}${r.note ? `\n       ${indent(r.note)}` : ''}`;
  if (r.kind === 'not-written') return `  WAIT ${r.id}: ${r.message}`;
  const where = r.section ? `\n       Reread lesson ${u.id}, "${r.section}".` : '';
  return `  FAIL ${r.id}: ${indent(r.message)}${where}`;
}

async function check(n, dir, help) {
  const u = unitOf(n, 'check N [PROJECT]');
  const p = projectDir(dir);
  const report = await inWorker({ kind: 'check', project: p, unit: u.id });
  if (report.error) throw Error(`The checks could not run: ${report.error}`);
  say(`Unit ${u.id}: ${u.title}`);
  if (report.missing) {
    say(`Unit ${u.id}'s checks are not built yet.`);
    process.exitCode = 1;
    return;
  }
  for (const r of report.results) say(resultLine(r, u));
  const passed = report.results.filter((r) => r.pass).length;
  const todo = report.results.filter((r) => r.kind === 'not-written').length;
  say(`${passed} of ${report.results.length} checks pass in unit ${u.id}${todo ? `; ${todo} wait for functions not written yet` : ''}.`);
  const failing = report.results.filter((r) => !r.pass && r.kind !== 'not-written').length;
  if (failing > 1) say('Several cases fail. Start with the first; later ones often fail for the same reason.');
  // The unit's new application, when it has one: its cases wait until you make its files.
  const t = report.transfer;
  let transferOk = true;
  if (t && !t.missing) {
    say(`New application: ${t.title}`);
    for (const r of t.results) say(resultLine(r, u));
    const tPassed = t.results.filter((r) => r.pass).length;
    const tTodo = t.results.filter((r) => r.kind === 'not-written').length;
    say(`${tPassed} of ${t.results.length} pass${tTodo ? `; ${tTodo} wait for files not made yet` : ''}.`);
    transferOk = t.results.every((r) => r.pass || r.kind === 'not-written');
  }
  const route = readProject(p).routes?.[u.id] ?? 'not recorded';
  const folder = saveAttempt(p, `check${u.id}`, 'receipt.json', {
    kind: 'check', course: config.id, unit: u.id, route, help_used: help, passed, of: report.results.length,
    results: report.results,
    ...(t && !t.missing ? { transfer: { title: t.title, passed: t.results.filter((r) => r.pass).length, of: t.results.length, results: t.results } } : {}),
    at: new Date().toISOString(),
  }, true);
  say(`Saved this attempt in ${shown(folder)}. Route: ${route}. A pass covers these cases only.`);
  process.exitCode = report.pass && transferOk ? 0 : 1;
}

// ------------------------------------------------------------------ lessons and predictions

// A lesson stops after the first prediction you have not committed: the line that shows
// `node lab.mjs predict project ID YOUR_ANSWER`, to the end of its code block.
export const PAUSE = /lab\.mjs predict (?:\S+ )?([\w.-]+) YOUR_ANSWER/;
export function gated(md, committed) {
  const lines = md.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) inFence = !inFence;
    const m = PAUSE.exec(lines[i]);
    if (!m || committed.has(m[1])) continue;
    let end = i;
    if (inFence) while (end + 1 < lines.length && !/^\s*```/.test(lines[end])) end++;
    return { text: lines.slice(0, end + 1).join('\n'), gate: m[1] };
  }
  return { text: md, gate: null };
}

function predictions(p) {
  const folder = join(p, 'attempts');
  if (!existsSync(folder)) return [];
  return readdirSync(folder).sort().map((name) => readIf(join(folder, name, 'prediction.json'))).filter(Boolean).map((t) => JSON.parse(t));
}

// The lesson's <details> blocks (optional hints, closing notes): { start, end, title, body }
// with start and end the lines of <details> and </details>.
export function detailsBlocks(md) {
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '<details>') continue;
    const end = lines.findIndex((l, j) => j > i && l.trim() === '</details>');
    if (end < 0) break;
    const head = lines.slice(i + 1, end).findIndex((l) => /<summary>/.test(l));
    const title = head >= 0 ? lines[i + 1 + head].replace(/<\/?summary>/g, '').trim() : 'More';
    const body = lines.slice(head >= 0 ? i + 2 + head : i + 1, end).join('\n').trim();
    out.push({ start: i, end, title, body });
    i = end;
  }
  return out;
}

// A <details> block stays closed in the terminal: one line naming it and the command
// that opens it.
export function closeDetails(text, n, dir = DEFAULT_PROJECT) {
  const lines = text.split('\n');
  const blocks = detailsBlocks(text);
  for (const [k, b] of [...blocks.entries()].reverse()) {
    lines.splice(b.start, b.end - b.start + 1, `[Closed: ${b.title}. Open it with: node lab.mjs hint ${n} ${k + 1}${dir === DEFAULT_PROJECT ? '' : ` ${dir}`}]`);
  }
  return lines.join('\n');
}

function lessonGate(u, dir) {
  const md = readIf(join(root, u.lesson));
  if (md === null) throw Error(`Lesson ${u.id} is not written yet.`);
  const p = existsSync(join(resolve(dir), 'PROJECT.json')) ? resolve(dir) : null;
  const committed = new Set(p ? predictions(p).map((x) => x.id) : []);
  return { md, p, ...gated(md, committed) };
}

// Has a saved run of check N in the project passed every case?
function checkPassed(dir, n) {
  const folder = join(resolve(dir), 'attempts');
  if (!existsSync(folder)) return false;
  return readdirSync(folder).some((name) => {
    const t = readIf(join(folder, name, 'receipt.json'));
    if (!t) return false;
    try {
      const r = JSON.parse(t);
      return r.kind === 'check' && String(r.unit) === String(n) && r.of > 0 && r.passed === r.of;
    } catch {
      return false;
    }
  });
}

function hint(plain) {
  const [n, k, dir = DEFAULT_PROJECT] = plain;
  const u = unitOf(String(n ?? '').replace(/^0/, ''), 'hint N K [PROJECT]');
  const { md, text, gate } = lessonGate(u, dir);
  const blocks = detailsBlocks(md);
  const b = blocks[Number(k) - 1];
  if (!b) throw Error(`Lesson ${u.id} has ${blocks.length ? `closed parts 1 to ${blocks.length}` : 'no closed parts'}: node lab.mjs hint ${u.id} K`);
  if (b.end >= text.split('\n').length) {
    throw Error(`That part of lesson ${u.id} comes after question ${gate}. Commit an answer first: node lab.mjs predict ${dir} ${gate} YOUR_ANSWER`);
  }
  // A note titled "After the capstone" opens once a run of the unit's checks has passed.
  if (/^After the capstone/.test(b.title) && !checkPassed(dir, u.id)) {
    throw Error(`"${b.title}" opens once your capstone passes. Run node lab.mjs check ${u.id}${dir === DEFAULT_PROJECT ? '' : ` ${dir}`} until every case passes, then open it again with node lab.mjs hint ${u.id} ${Number(k)}${dir === DEFAULT_PROJECT ? '' : ` ${dir}`}.`);
  }
  say(b.title);
  say('');
  say(b.body.split('\n').filter((l) => !/^<!-- \/?code-example/.test(l)).flatMap(listingLines).join('\n'));
}

// A figure line in the terminal: its description and where to open the picture.
function figureLine(l) {
  const m = /^!\[(.*)\]\((figures\/[^)]+)\)$/.exec(l.trim());
  if (!m) return l;
  return `[Figure, lessons/${m[2]} (open it in a browser): ${m[1]}]`;
}

// Under each question's predict block, one line with the answer format from practice.json.
export function withFormats(lines, formatOf) {
  const out = [];
  let inFence = false;
  let pending = null;
  for (const l of lines) {
    out.push(l);
    const fence = /^\s*```/.test(l);
    if (fence) inFence = !inFence;
    const m = PAUSE.exec(l);
    if (m) pending = m[1];
    if (pending && (fence ? !inFence : !inFence && m)) {
      const f = formatOf(pending);
      if (f) out.push(`Answer format: ${f}.`);
      pending = null;
    }
  }
  return out;
}

// A listing's opening fence carries metadata for the course's own tools, as JSON. The terminal
// shows its title and change note as plain lines above a bare fence, and never the file it is
// kept in for those tools.
export function listingLines(line) {
  const m = /^(\s*```[\w-]*)\s+(\{.*\})\s*$/.exec(line);
  if (!m) return [line];
  let meta = {};
  try { meta = JSON.parse(m[2]); } catch { /* show the bare fence */ }
  const words = [meta.title && `Listing: ${meta.title}`, meta.change].filter((x) => typeof x === 'string' && x.trim());
  return [...words, m[1]];
}

function lesson(n, dir) {
  const u = unitOf(n, 'lesson N [PROJECT]');
  const { p, text, gate } = lessonGate(u, dir);
  const lines = closeDetails(text, u.id, dir).split('\n').filter((l) => !/^<!-- \/?code-example/.test(l)).flatMap(listingLines);
  const qs = practice();
  say(withFormats(lines, (id) => qs[id]?.format).map(figureLine).join('\n'));
  if (!gate) return;
  say('');
  say(`The rest of this lesson opens once you commit an answer to question ${gate}:`);
  say(`  node lab.mjs predict ${dir} ${gate} YOUR_ANSWER`);
  if (!p) say(`(Make your project first: node lab.mjs start ${dir})`);
}

const practice = () => readIf(join(root, 'practice.json')) ? readJson(join(root, 'practice.json')) : {};
function item(id) {
  const q = practice()[id];
  if (!q) throw Error(`Unknown question ${id}. The lessons name each one.`);
  return q;
}
// An answer in the form answers are compared in: a list of letters becomes those letters, sorted.
export function normal(answer) {
  const s = String(answer).trim().toLowerCase().replace(/\.$/, '');
  if (['none', 'neither'].includes(s)) return 'none';
  const parts = s.split(/[^a-z]+/).filter(Boolean);
  if (parts.length && parts.every((x) => x.length === 1)) return [...new Set(parts)].sort().join(',');
  const num = Number(s.replaceAll(',', ''));
  if (s !== '' && Number.isFinite(num) && /^[-\d.,\s]+$/.test(s)) return String(num);
  return s.replace(/\s+/g, ' ');
}
export const accepts = (q, answer) => [q.expected, ...(q.accept ?? [])].map(normal).includes(normal(answer));

function question(id) {
  const q = item(id);
  say(q.question);
  say(`Answer format: ${q.format}`);
  say(`Commit with: node lab.mjs predict ${DEFAULT_PROJECT} ${id} YOUR_ANSWER`);
}

// predict [PROJECT] ID ANSWER: the project comes first when it is a project folder.
function predict(plain, help) {
  const hasProject = plain.length > 2 && existsSync(join(resolve(plain[0]), 'PROJECT.json'));
  const [dir, id, ...words] = hasProject ? plain : [DEFAULT_PROJECT, ...plain];
  const answer = words.join(' ').trim();
  if (!id || !answer) throw Error('Usage: node lab.mjs predict [PROJECT] ID ANSWER');
  const p = projectDir(dir);
  const q = item(id);
  const correct = accepts(q, answer);
  saveAttempt(p, id, 'prediction.json', { kind: 'prediction', id, version: q.version, question: q.question, format: q.format, answer, help_used: help, correct, at: new Date().toISOString() });
  say(`Your answer: ${answer}`);
  say(correct ? 'Correct.' : `Not this time. The answer is ${q.expected}.`);
  const wrong = (q.wrong ?? []).find((w) => normal(w.answer) === normal(answer));
  say(wrong && !correct ? wrong.feedback : q.reason);
  const home = q.variantOf ? item(q.variantOf) : q;
  if (!correct) say(q.retry ? `Read lesson ${home.lesson}, "${home.section}", then try a fresh case: node lab.mjs question ${q.retry}` : `Read lesson ${home.lesson}, "${home.section}", again before the next lesson.`);
  say(`Continue reading: node lab.mjs lesson ${home.lesson} ${dir}`);
}

// ------------------------------------------------------------------ brief

export function briefReport(u, text) {
  const has = (rule) => new RegExp(rule.pattern, 'im').test(text);
  const groups = [['Interface', u.brief.interface], ['Constraints', u.brief.constraints], ['Check command', [{ ...u.brief.check, example: `node lab.mjs check ${u.id} project` }]]]
    .map(([heading, rules]) => [heading, rules.map((r) => ({ name: r.name, ok: has(r), example: r.example }))]);
  return { groups, missing: groups.flatMap(([, rules]) => rules.filter((r) => !r.ok).map((r) => r.name)) };
}

function brief(n, dir) {
  const u = unitOf(n, 'brief N [PROJECT]');
  const p = projectDir(dir);
  const name = `briefs/0${u.id}.md`;
  const text = readIf(join(p, name));
  if (text === null) throw Error(`${dir}/${name} is missing: node lab.mjs next ${dir} ${u.id} ai writes one to fill in.`);
  const { groups, missing } = briefReport(u, text);
  say(`Brief ${name}: what the lab looks for (it does not grade the writing).`);
  for (const [heading, rules] of groups) {
    say(heading);
    for (const r of rules) say(r.ok ? `  found   ${r.name}` : `  MISSING ${r.name}. For example: "${r.example}"`);
  }
  say('Also worth a heading (not required)');
  for (const r of u.brief.notes) say(`  ${new RegExp(r.pattern, 'im').test(text) ? 'found  ' : 'none   '} ${r.name}`);
  const folder = saveAttempt(p, `brief${u.id}`, 'brief.json', { kind: 'brief', unit: u.id, missing, at: new Date().toISOString() });
  writeFileSync(join(folder, `0${u.id}.md`), text, { flag: 'wx' }); // the brief as it was checked
  say(missing.length ? `Missing: ${missing.join('; ')}. Add them in your own words, then run this again.` : `The brief names the interface, the constraints and the check. Give it to your agent, then run node lab.mjs check ${u.id} ${dir}.`);
  say(`Saved a copy of the result in ${shown(folder)}.`);
  process.exitCode = missing.length ? 1 : 0;
}

// ------------------------------------------------------------------ pictures

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
// An RGBA image with row 0 at the bottom (WebGL's order) as a PNG, each pixel `scale` times.
export function png(w, h, rgba, scale = 1) {
  const W = w * scale, H = h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    const src = h - 1 - Math.floor(y / scale);
    for (let x = 0; x < W; x++) {
      const i = (src * w + Math.floor(x / scale)) * 4;
      const o = y * (W * 4 + 1) + 1 + x * 4;
      raw[o] = rgba[i]; raw[o + 1] = rgba[i + 1]; raw[o + 2] = rgba[i + 2]; raw[o + 3] = 255;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(W, 0);
  head.writeUInt32BE(H, 4);
  head.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function renderFailed(r, u, dir, opts) {
  if (/renderVisible: not written yet/.test(r.error) && opts?.mode === 'visible') return Error(`${r.error}. Unit 9 draws with your renderVisible; node lab.mjs view 9 ${dir} --mode tiled draws the hall with your unit 8 renderer instead.`);
  if (/not written yet/.test(r.error)) return Error(`${r.error}. The picture needs every function up to unit ${u.id}: node lab.mjs status ${dir} shows which are written.`);
  return Error(`Your GPU stopped while drawing: ${r.error}${r.where ? ` (${r.where})` : ''}`);
}

// What `compare N` draws when no --scene is named: the unit's own scenes, in the mode the
// unit builds (from unit 5 on, shaded by a program whose GLSL twin WebGL runs).
const COMPARE_SCENES = {
  4: [{ scene: 'courtyard' }, { scene: 'tieScenes' }, { scene: 'coplanarPair' }],
  5: [{ scene: 'courtyard', arg: { shader: 'lambert' }, label: 'courtyard-lambert' }, { scene: 'floorScene' }],
  6: [{ scene: 'courtyard', arg: { shader: 'coherent-branch' }, label: 'courtyard-coherent-branch' }],
  7: [{ scene: 'courtyard' }, { scene: 'floorScene', arg: { turn: 90 }, label: 'floor-turned' }],
  8: [{ scene: 'courtyard', arg: { shader: 'lambert' }, label: 'courtyard-lambert' }, { scene: 'overdrawScene' }],
  9: [{ scene: 'hallScene', arg: 1, label: 'hall-seed1' }, { scene: 'hallScene', arg: 12, label: 'hall-seed12' }],
};
// The unit's own mode: view and compare draw units 8 and 9 the way those units render
// (--mode immediate|tiled|visible chooses another); compare also stores unit 7's
// textures in the tiled layout (--layout linear|tiled).
const VIEW_OPTS = { 8: { mode: 'tiled' }, 9: { mode: 'visible' } };
const UNIT_OPTS = { 7: { layout: 'tiled' }, ...VIEW_OPTS };
const MODES = ['immediate', 'tiled', 'visible'];
function renderOpts(u, o, compare) {
  const opts = { ...((compare ? UNIT_OPTS : VIEW_OPTS)[u.id] ?? {}) };
  if (o.mode !== undefined) {
    if (!MODES.includes(o.mode)) throw Error(`--mode is one of ${MODES.join(', ')}, not ${o.mode}.`);
    opts.mode = o.mode;
  }
  if (o.layout !== undefined) {
    if (!['linear', 'tiled'].includes(o.layout)) throw Error(`--layout is linear or tiled, not ${o.layout}.`);
    opts.layout = o.layout;
  }
  return Object.keys(opts).length ? opts : undefined;
}

// --shader NAME (a program in scenes/shaders) or a path to your own .asm file; its GLSL
// twin is the .glsl file of the same name beside it, when there is one.
function shaderOption(u, value) {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw Error('Name a shader: --shader lambert, or --shader project/transfer/toon.asm');
  if (+u.id < 5) throw Error(`Shaders run from unit 5 on; unit ${u.id} draws with fixed shading. Try: node lab.mjs view 5 --shader ${value}`);
  const path = /[\\/]|\.asm$/.test(value) ? resolve(value) : join(root, 'scenes', 'shaders', `${value}.asm`);
  if (!existsSync(path)) {
    const names = readdirSync(join(root, 'scenes', 'shaders')).filter((f) => f.endsWith('.asm')).map((f) => f.slice(0, -4));
    throw Error(`No shader at ${shown(path)}. Name one of ${names.join(', ')}, or give the path to your own .asm file.`);
  }
  const twin = path.replace(/\.asm$/, '') + '.glsl';
  const name = path.split(/[\\/]/).pop().replace(/\.asm$/, '');
  return { name, asm: readFileSync(path, 'utf8'), glsl: readIf(twin) };
}

// o.scene (with o.seed or o.stop) names one scene; otherwise the unit's scene, or with
// extra.compare the unit's compare scenes. extra.bits: the subpixel bits to draw at.
// Only unit 4's fixed shading has a filter to choose: from unit 5 on, tex and the memory
// counters read the nearest texel, so a linear WebGL picture would differ for no fault of yours.
function checkFilter(u, filter) {
  if (filter === undefined || filter === 'nearest') return;
  if (filter !== 'linear') throw Error(`--filter is nearest or linear, not ${filter}.`);
  if (+u.id !== 4) throw Error(`--filter linear works for unit 4 only: from unit 5 on your GPU samples the nearest texel, so the comparison would judge two different filters. Nothing was drawn.`);
}

async function renderShots(u, p, dir, o, extra = {}) {
  checkFilter(u, o.filter);
  const opts = renderOpts(u, o, !!extra.compare);
  const shader = shaderOption(u, o.shader);
  // A mode or layout other than the unit's own goes into the file name, so the two
  // pictures don't overwrite each other.
  const own = (extra.compare ? UNIT_OPTS : VIEW_OPTS)[u.id] ?? {};
  const modeTag = Object.entries(opts ?? {}).filter(([k, v]) => own[k] !== v).map(([, v]) => v).join('-') || null;
  const specs = o.scene || !extra.compare || !COMPARE_SCENES[u.id]
    ? [{ scene: o.scene ?? u.scene, seed: o.seed, stop: o.stop, opts, modeTag }]
    : COMPARE_SCENES[u.id].map((x) => ({ ...x, opts, modeTag }));
  const r = await inWorker({ kind: 'render', project: p, unit: u.id, specs, filter: o.filter, bits: extra.bits, trace: !!extra.compare, shader });
  if (r.error) throw r.scenes ? Error(r.error) : renderFailed(r, u, dir, opts);
  return r;
}

function countsLine(c) {
  if (!c) return '';
  const parts = Object.entries(c).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k} ${v.toLocaleString('en')}`);
  return parts.join(', ');
}

async function view(n, dir, o) {
  const u = unitOf(n, 'view N [PROJECT] [--scene NAME]');
  const p = projectDir(dir);
  const { shots } = await renderShots(u, p, dir, o);
  mkdirSync(join(p, 'out'), { recursive: true });
  for (const s of shots) {
    const scale = o.scale ? Math.max(1, Math.min(16, Number(o.scale) | 0)) : Math.max(1, Math.ceil(320 / s.image.w));
    const file = join(p, 'out', `u${u.id}-${s.file}.png`);
    writeFileSync(file, png(s.image.w, s.image.h, s.image.rgba, scale));
    say(`Wrote ${shown(file)}: ${s.name}, ${s.image.w} × ${s.image.h} pixels${scale > 1 ? `, each drawn ${scale} × ${scale}` : ''}.`);
    const line = countsLine(s.counts);
    if (line) say(`  counted: ${line}`);
  }
}

// ------------------------------------------------------------------ compare with WebGL

const b64 = (data) => Buffer.from(Uint8Array.from(data)).toString('base64');
const idsB64 = (ids) => (ids ? Buffer.from(Int32Array.from(ids).buffer).toString('base64') : null);

function shaderText(scene) {
  if (typeof scene.glsl === 'string') return scene.glsl;
  if (!scene.shader) return null;
  return readIf(join(root, 'scenes', 'shaders', `${scene.shaderName ?? scene.name}.glsl`));
}

// The scene as the WebGL page draws it: glScene from the course's own copy of the supplied
// pipeline.mjs (clip coordinates from matrix.mjs, never from your transform). Your picture
// goes to the page later, once the page has found the grid your GPU should draw it on.
async function glScene(shot, stage) {
  const pipe = await import(pathToFileURL(join(root, 'starter', 'gpu', 'pipeline.mjs')).href);
  if (typeof pipe.glScene !== 'function') throw Error('This course folder has no glScene in starter/gpu/pipeline.mjs.');
  const g = pipe.glScene(shot.scene);
  const glsl = stage >= 5 ? shaderText(shot.scene) : null;
  const geometry = { width: g.width, height: g.height, camera: g.camera, tris: g.tris, textures: Object.fromEntries(Object.entries(g.textures ?? {}).map(([k, t]) => [k, { w: t.w, h: t.h }])) };
  for (const t of Object.values(g.textures ?? {})) t.data = b64(t.data);
  return {
    page: {
      ...g, name: g.name ?? shot.name, glsl,
      note: stage >= 5 && shot.scene.shader && !glsl ? "This scene's shader has no GLSL twin yet, so WebGL drew fixed shading and only triangle ownership is compared." : null,
    },
    geometry,
  };
}

// The lab's own count, independent of your diffImages.
export function labCount(mine, theirs, ties) {
  let coverage = 0, onTies = 0, maxLevel = 0, overOne = 0;
  const at = (i) => `(${i % mine.w}, ${Math.floor(i / mine.w)})`;
  const where = { coverage: [], colour: [] };
  for (let i = 0; i < mine.w * mine.h; i++) {
    if (mine.ids[i] !== theirs.ids[i]) {
      coverage++;
      if (ties?.[i]) onTies++;
      if (where.coverage.length < 5) where.coverage.push(`${at(i)} yours ${mine.ids[i]}, WebGL's ${theirs.ids[i]}`);
      continue;
    }
    if (mine.ids[i] < 0) continue;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(mine.rgba[i * 4 + c] - theirs.rgba[i * 4 + c]));
    maxLevel = Math.max(maxLevel, d);
    if (d > 1) { overOne++; if (where.colour.length < 5) where.colour.push(at(i)); }
  }
  return { coverage, onTies, maxLevel, overOne, where };
}

// ---- the gate's two bands, from supplied geometry only (never your rasterizer)
//
// Edge band. A 3D scene's vertices reach the GPU as float32 clip coordinates and are
// divided and mapped in float32, so the GPU can put a vertex one grid step (1/SUB pixel)
// from where your float64 pipeline puts it, in x, in y or both. Moving each end of an edge
// a by at most one step in x and in y moves the edge, anywhere along it, by at most
// (|nx| + |ny|) steps (n its unit normal). So a pixel is in the band of edge a -> b when
//   |edge(a, b, centre)| <= |b.x - a.x| + |b.y - a.y|   (in grid units at the GPU's grid)
// and the centre lies beside the edge (between its ends, give or take two steps). Edges are
// those of each triangle's window polygon after near clipping, here in float64 from the
// clip coordinates glScene sends. The GPU's own edge arithmetic is not exact either: on
// long edges whose ends lie far off screen SwiftShader gives pixels less than a fifth of a
// step from an edge to the other triangle, in 2D scenes too (tools/fixtures/MEASURED-webgl.md). A 2D scene's vertices land exactly on the
// grid, though, so a centre exactly on an edge there (edge value 0) is a true tie, decided
// by the tie rule alone: in a 2D scene such pixels are outside the band and must match.
//
// Texel band. A pixel sampled with nearest filtering reads texel floor(u * w); the GPU
// computes u in float32 (about ten operations, each within 2^-24 of its result's size, on
// values no larger than the triangle's largest texel coordinate), so where u * w lies very
// near an integer the GPU may read the neighbouring texel. The band: |t - round(t)| <=
// 2^-16 * max(1, the triangle's largest |u * w| or |v * h| at a vertex), for t = u * w or
// v * h: 2^8 = 256 times float32's 2^-24, for about ten roundings and the plane setup.
// At stage 3 the uv checker stands in for a texture of squares half a uv unit wide (w = 2).
export const TEXEL_BAND = 2 ** -16;

function nearClip(vs) {
  const d = (v) => v.c[2] + v.c[3];
  const out = [];
  for (let k = 0; k < vs.length; k++) {
    const s = vs[k], e = vs[(k + 1) % vs.length];
    const ds = d(s), de = d(e);
    if (ds >= 0) out.push(s);
    if ((ds > 0 && de < 0) || (ds < 0 && de > 0)) {
      const t = ds / (ds - de);
      out.push({ c: s.c.map((x, i) => x + t * (e.c[i] - x)) });
    }
  }
  return out;
}

// id -> list of window polygons ([x, y] in grid units at `sub`).
export function windowPolygons(geometry, sub) {
  const { width: W, height: H } = geometry;
  const polys = new Map();
  for (const t of geometry.tris) {
    const poly = nearClip(t.v).map(({ c }) => [Math.round(((c[0] / c[3] + 1) / 2) * W * sub), Math.round(((c[1] / c[3] + 1) / 2) * H * sub)]);
    if (poly.length < 3) continue;
    if (!polys.has(t.id)) polys.set(t.id, []);
    polys.get(t.id).push(poly);
  }
  return polys;
}

// { steps, tie }: the distance in grid steps from pixel (x, y)'s centre to the nearest edge
// of triangle id whose band holds it (Infinity when none does), and whether the centre lies
// exactly on one of its edges.
function nearEdge(polys, id, x, y, sub) {
  const p = [x * sub + sub / 2, y * sub + sub / 2];
  let steps = Infinity, tie = false;
  for (const poly of polys.get(id) ?? []) {
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const slack = Math.abs(dx) + Math.abs(dy);
      if (slack === 0) continue;
      const e = dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
      if (Math.abs(e) > slack) continue;
      const along = dx * (p[0] - a[0]) + dy * (p[1] - a[1]);
      const len = Math.hypot(dx, dy);
      if (along < -2 * len || along > len * len + 2 * len) continue;
      steps = Math.min(steps, Math.abs(e) / len);
      if (e === 0 && along >= 0 && along <= len * len) tie = true;
    }
  }
  return { steps, tie };
}

// The texture sizes a pixel of triangle t samples with nearest filtering, at this stage.
function sampledSizes(geometry, shader, t, stage, filter) {
  if (stage === 3) return t.tex ? [[2, 2]] : [];
  if (stage < 3 || filter === 'linear') return [];
  const names = shader ? [...shader.matchAll(/^\s*tex\s+[^;\n]*,\s*(\w+)\s*(?:;|$)/gm)].map((m) => m[1]) : t.tex ? [t.tex] : [];
  return names.map((n) => geometry.textures[n]).filter(Boolean).map((x) => [x.w, x.h]);
}

// How far u * w (or v * h) is from a texel edge, as a fraction of the band's scale; <= 1 is
// inside the texel band.
function texelNearness(t, uv, sizes) {
  let best = Infinity;
  for (const [w, h] of sizes) {
    const scale = Math.max(1, ...t.v.flatMap((v) => [Math.abs(v.a[3] * w), Math.abs(v.a[4] * h)]));
    for (const c of [uv[0] * w, uv[1] * h]) best = Math.min(best, Math.abs(c - Math.round(c)) / (TEXEL_BAND * scale));
  }
  return best;
}

// The gate on one scene. mine: { image, ties, uv } from your pipeline at the GPU's grid.
export function labGate(mine, theirs, geometry, { sub, stage, shader, filter }) {
  const { w, h } = mine.image;
  const flat = !geometry.camera;
  const polys = windowPolygons(geometry, sub);
  const byId = new Map(geometry.tris.map((t) => [t.id, t]));
  const at = (i) => `(${i % w}, ${Math.floor(i / w)})`;
  const r = {
    pixels: w * h, flat,
    owner: { outside: 0, inside: 0, outsideOnTies: 0, farthest: 0, whereOutside: [], whereInside: [] },
    colour: { maxOutside: 0, overOutside: 0, maxInside: 0, inside: 0, farthest: 0, whereOutside: [], whereInside: [], noTrace: !mine.uv },
  };
  for (let i = 0; i < w * h; i++) {
    const a = mine.image.ids[i], b = theirs.ids[i];
    const x = i % w, y = Math.floor(i / w);
    if (a !== b) {
      const near = [a, b].filter((id) => id >= 0).map((id) => nearEdge(polys, id, x, y, sub));
      const steps = Math.min(Infinity, ...near.map((n) => n.steps));
      const tie = near.some((n) => n.tie);
      const inBand = steps !== Infinity && !(flat && tie);
      const o = r.owner;
      const text = `${at(i)} yours ${a}, WebGL's ${b}${inBand ? `, ${steps.toFixed(2)} grid steps from an edge` : ''}`;
      if (inBand) { o.inside++; o.farthest = Math.max(o.farthest, steps); if (o.whereInside.length < 5) o.whereInside.push(text); }
      else { o.outside++; if (mine.ties?.[i] || tie) o.outsideOnTies++; if (o.whereOutside.length < 5) o.whereOutside.push(text); }
      continue;
    }
    if (a < 0) continue;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(mine.image.rgba[i * 4 + c] - theirs.rgba[i * 4 + c]));
    if (d <= 1) { r.colour.maxOutside = Math.max(r.colour.maxOutside, d); continue; }
    const t = byId.get(a);
    const uv = mine.uv ? [mine.uv[i * 2], mine.uv[i * 2 + 1]] : null;
    const near = t && uv && !Number.isNaN(uv[0]) ? texelNearness(t, uv, sampledSizes(geometry, shader, t, stage, filter)) : Infinity;
    const c = r.colour;
    if (near <= 1) {
      c.inside++; c.maxInside = Math.max(c.maxInside, d); c.farthest = Math.max(c.farthest, near * TEXEL_BAND);
      if (c.whereInside.length < 5) c.whereInside.push(`${at(i)} ${count(d, 'level')}, ${(near * TEXEL_BAND).toExponential(1)} of the texture coordinate's scale from a texel edge (the band is ${TEXEL_BAND.toExponential(1)})`);
    } else {
      c.overOutside++; c.maxOutside = Math.max(c.maxOutside, d);
      if (c.whereOutside.length < 5) c.whereOutside.push(`${at(i)} ${count(d, 'level')}`);
    }
  }
  return r;
}

const decodeIds = (px) => Int32Array.from({ length: px.length / 4 }, (_, i) => (px[i * 4] | (px[i * 4 + 1] << 8) | (px[i * 4 + 2] << 16)) - 1);
const rules = () => readJson(join(root, 'public', 'tie-rules.json'));

// One plain line about the grid the page found and the grid your pipeline ran at.
function gridLine(found, used, noSetter) {
  if (noSetter) return `Your browser's GPU snaps vertices to 1/${found} pixel, but your gpu/raster.mjs has no setSubpixelBits (copy it from the course's starter/gpu/raster.mjs), so your pipeline ran at 1/16 and pixels beside edges may differ for that reason alone.`;
  if (!found) return "This GPU snaps vertices to none of the grids the page tests (1/16 to 1/1024 pixel), so your pipeline ran at 1/16, the grid WebGL promises; pixels beside edges may differ for that reason alone.";
  if (found === 16) return "Your browser's GPU snaps vertices to 1/16 pixel, the grid WebGL promises and your pipeline uses.";
  return `Your browser's GPU snaps vertices to 1/${found} pixel; WebGL only promises 1/16 or finer. For this comparison your pipeline ran at 1/${used}.`;
}

async function verdict(u, p, run, jobScenes, body) {
  if (body.error) return { ok: false, text: `The page stopped: ${body.error}` };
  const { shots, sub, line } = run;
  const rule = rules().rules.find((r) => r.id === body.tie?.rule) ?? null;
  const lines = [`WebGL: ${body.info?.renderer} (subpixel bits ${body.info?.subpixel})`, line];
  lines.push(rule ? `Tie rule: ${rule.name}${rule.course ? ', the rule your rasterizer is taught' : ''}.` : 'Tie rule: none of the eight nudge rules matches this GPU (it may cover some tie pixels twice, or none).');
  const head = lines.length;
  let ok = true;
  const records = [];
  // Each scene's lines, for the page to print under that scene's pictures.
  const perScene = [];
  for (const [k, s] of shots.entries()) {
    const back = body.scenes?.[k];
    const from = lines.length;
    if (!back) { ok = false; lines.push(`Scene ${s.name}: the page sent no pixels.`); perScene.push({ ok: false, lines: lines.slice(from) }); continue; }
    const theirs = { w: s.image.w, h: s.image.h, rgba: Buffer.from(back.rgba, 'base64'), ids: decodeIds(Buffer.from(back.ids, 'base64')) };
    const colourCompared = !jobScenes[k].page.note;
    const g = labGate(s, theirs, jobScenes[k].geometry, { sub, stage: +u.id, shader: jobScenes[k].page.glsl ? s.scene.shader : null, filter: run.filter });
    const theirsDiff = await learnerDiff(u, p, s, theirs);
    const own = g.owner, col = g.colour;
    const sceneOk = own.outside === 0 && (!colourCompared || col.overOutside === 0);
    const convention = !sceneOk && own.outside > 0 && own.outside === own.outsideOnTies && rule && !rule.course && (!colourCompared || col.overOutside === 0);
    const mode = s.mode ? ` ${Object.entries(s.mode).map(([a, b]) => `${a} ${b}`).join(', ')}` : '';
    lines.push(`Scene ${s.name} (${s.image.w} × ${s.image.h}${mode}): ${g.pixels.toLocaleString('en')} pixels compared`);
    const away = g.flat ? 'away from edges or exactly on one' : 'away from edges';
    lines.push(`  triangle ownership: ${count(own.outside, 'pixel')} ${own.outside === 1 ? 'differs' : 'differ'} ${away} (must be 0)${own.outside ? `, ${own.outsideOnTies} of them exactly on an edge` : ''}; ${own.inside} within one grid step of an edge (allowed: the GPU's float32 arithmetic may decide those either way)`);
    if (own.inside) lines.push(`    beside an edge: ${own.whereInside.join('; ')}`);
    if (own.outside) lines.push(`    first at (x, y from the bottom left): ${own.whereOutside.join('; ')}`);
    if (!colourCompared) lines.push('  colour: not compared (no GLSL twin for this shader)');
    else {
      lines.push(`  colour: largest difference ${count(col.maxOutside, 'level')}; ${count(col.overOutside, 'pixel')} ${col.overOutside === 1 ? 'differs' : 'differ'} by more than 1 level (must be 0)${col.inside ? `; ${count(col.inside, 'more pixel')} sampled within float32 error of a texel edge (allowed, largest ${count(col.maxInside, 'level')})` : ''}`);
      if (col.noTrace) lines.push('    (your pipeline.mjs reports no uv trace, so no pixel counts as on a texel edge: copy pipeline.mjs from the course\'s starter)');
      if (col.overOutside) lines.push(`    first at: ${col.whereOutside.join('; ')}`);
      if (col.inside) lines.push(`    on a texel edge: ${col.whereInside.join('; ')}`);
    }
    if (theirsDiff) lines.push(`  your diffImages: ${theirsDiff}`);
    if (convention) lines.push('  Every difference sits on an edge, and this GPU uses another tie rule: a different convention, not a fault in your rasterizer.');
    ok = ok && (sceneOk || convention);
    const strip = ({ whereOutside, whereInside, ...rest }) => rest;
    records.push({ scene: s.name, file: s.file, mode: s.mode, pixels: g.pixels, flat: g.flat, owner: strip(own), colour: strip(col), where: { owner: [...own.whereOutside, ...own.whereInside], colour: [...col.whereOutside, ...col.whereInside] }, ok: sceneOk, convention: !!convention });
    perScene.push({ ok: sceneOk || !!convention, convention: !!convention, lines: lines.slice(from) });
    writeFileSync(join(p, 'out', `u${u.id}-${s.file}-webgl.png`), png(theirs.w, theirs.h, theirs.rgba, Math.max(1, Math.ceil(320 / theirs.w))));
  }
  lines.push(ok ? 'Verdict: your pictures match WebGL\'s.' : 'Verdict: the pictures differ. Triangle ownership must match away from edges, and colour within 1 level away from texel edges.');
  const page = { head: lines.slice(0, head), scenes: perScene, summary: lines[lines.length - 1] };
  return { ok, text: lines.join('\n'), page, records, rule: rule?.id ?? null, renderer: body.info?.renderer };
}

// Your diffImages on the same two pictures, from unit 4 on, when it is written.
async function learnerDiff(u, p, s, theirs) {
  if (+u.id < 4) return null;
  const r = await inWorker({ kind: 'diff', project: p, mine: s.image, theirs, ties: s.ties }, 30).catch((e) => ({ error: e.message }));
  if (r.error) return /not written yet/.test(r.error) ? 'not written yet' : `stopped: ${r.error}`;
  const lab = labCount(s.image, theirs, s.ties);
  const keys = ['coverage', 'onTies', 'maxLevel', 'overOne'];
  const same = keys.every((k) => r.result?.[k] === lab[k]);
  return `${keys.map((k) => `${k} ${r.result?.[k]}`).join(', ')}${same ? ' (the same as the lab\'s plain count, before the bands)' : ' (the lab counts differently: check diffImages)'}`;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const PAGE_FILES = { '/': 'compare.html', '/compare.html': 'compare.html', '/compare.mjs': 'compare.mjs', '/tie-rules.json': 'tie-rules.json' };

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((done, fail) => {
    const parts = [];
    let size = 0;
    req.on('data', (d) => { size += d.length; if (size > limit) { req.destroy(); fail(Error('too large')); } else parts.push(d); });
    req.on('end', () => done(Buffer.concat(parts).toString('utf8')));
    req.on('error', fail);
  });
}

// Serves the page on 127.0.0.1, or with lan on every interface so a phone on the same network can
// open it. POST /probe: the page's tie rule and snap grid, answered with your pictures on that grid.
// POST /result: WebGL's pixels; resolves with the verdict.
function lanAddress() {
  const all = Object.values(networkInterfaces()).flat();
  return all.find((a) => a && a.family === 'IPv4' && !a.internal)?.address ?? null;
}

function serveCompare(job, onProbe, onResult, lan = false) {
  const token = randomBytes(16).toString('hex');
  let settle;
  const finished = new Promise((r) => (settle = r));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    if (req.method === 'GET' && PAGE_FILES[url.pathname]) {
      const f = PAGE_FILES[url.pathname];
      return send(200, TYPES[f.slice(f.lastIndexOf('.'))], readFileSync(join(root, 'public', f)));
    }
    if (url.searchParams.get('t') !== token) return send(403, 'text/plain', 'this address needs the token the lab printed');
    if (req.method === 'GET' && url.pathname === '/job') return send(200, TYPES['.json'], JSON.stringify(job));
    if (req.method === 'POST' && url.pathname === '/probe') {
      try {
        send(200, TYPES['.json'], JSON.stringify(await onProbe(JSON.parse(await readBody(req)))));
      } catch (e) {
        send(500, 'text/plain', e.message);
        settle({ ok: false, text: e.message });
      }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/result') {
      try {
        const v = await onResult(JSON.parse(await readBody(req)));
        send(200, TYPES['.json'], JSON.stringify({ ok: v.ok, text: v.text, page: v.page }));
        settle(v);
      } catch (e) {
        send(500, 'text/plain', e.message);
        settle({ ok: false, text: `The lab could not read the page's pixels: ${e.message}` });
      }
      return;
    }
    send(404, 'text/plain', 'not found');
  });
  const host = lan ? '0.0.0.0' : '127.0.0.1';
  const at = lan ? lanAddress() : '127.0.0.1';
  if (!at) throw Error('--lan: this computer has no network address a phone could reach.');
  return new Promise((ready) => server.listen(0, host, () => {
    const url = `http://${at}:${server.address().port}/?t=${token}`;
    const close = () => { server.close(); server.closeAllConnections?.(); };
    ready({ url, close, finished: finished.then((v) => { close(); return v; }) });
  }));
}

const ORACLE = join(root, 'tools', 'webgl-oracle.mjs');
// TINY_GPU_SHOT=FILE also saves a 390-pixel-wide screenshot of the finished page.
async function headless(url) {
  const { withHeadlessChrome } = await import(pathToFileURL(ORACLE).href);
  await withHeadlessChrome(async (page) => {
    await page.goto(url);
    await page.waitFor('window.__tinyGpuDone === true', 180000);
    if (process.env.TINY_GPU_SHOT) await page.screenshot(resolve(process.env.TINY_GPU_SHOT), 390, 844);
  }, { log: (s) => say(s) });
}

async function compare(n, dir, o) {
  const u = unitOf(n, 'compare N [PROJECT] [--scene NAME] [--lan] [--headless]');
  const p = projectDir(dir);
  if (o.headless && !existsSync(ORACLE)) throw Error('--headless needs tools/webgl-oracle.mjs, which is not part of the course download. Run the command without --headless and open the address it prints in your browser.');
  if (!u.compare) say(`(The course compares with WebGL from unit 4 on; drawing unit ${u.id}'s scene anyway.)`);
  // Drawn first at 1/16, so a function not written yet stops the lab before a browser opens.
  const first = await renderShots(u, p, dir, o, { compare: true });
  const scenes = await Promise.all(first.shots.map((s) => glScene(s, +u.id)));
  mkdirSync(join(p, 'out'), { recursive: true });
  const filter = o.filter ?? 'nearest';
  const run = { shots: first.shots, sub: 16, line: null, grid: null, filter };
  const onProbe = async (body) => {
    const found = body.grid?.sub ?? null;
    let again = found && found !== 16 ? await renderShots(u, p, dir, o, { compare: true, bits: Math.log2(found) }) : first;
    const noSetter = !!again.noSetter;
    if (noSetter) again = first;
    run.shots = again.shots;
    run.sub = 2 ** again.bits;
    run.grid = found;
    run.line = gridLine(found, run.sub, noSetter);
    return { line: run.line, mine: run.shots.map((s) => ({ rgba: b64(s.image.rgba), ids: idsB64(s.image.ids) })) };
  };
  const { url, close, finished } = await serveCompare({ unit: u.id, title: u.title, stage: +u.id, filter, scenes: scenes.map((x) => x.page) }, onProbe, (body) => verdict(u, p, run, scenes, body), !!o.lan);
  if (o.lan) say(`Open this address on a phone or another computer on the same network, in a browser with WebGL2.\nAnyone on the network who has the address can open it until the page sends its pixels:\n  ${url}`);
  else say(`Open this address in a browser with WebGL2 (it works on this computer only):\n  ${url}`);
  if (o.headless) {
    try {
      await headless(url);
    } catch (e) {
      close(); // otherwise the open server keeps the lab running after the error
      throw e;
    }
  }
  else say('Waiting for the page to send its pixels (Ctrl+C stops)...');
  const v = await finished;
  say(v.text);
  // The code the comparison judged is kept with its verdict, as check does: gpu/, transfer/, and a
  // shader named by path with its GLSL twin.
  const folder = saveAttempt(p, `compare${u.id}`, 'compare.json', { kind: 'compare', unit: u.id, ok: v.ok, rule: v.rule, grid: run.grid, sub: run.sub, renderer: v.renderer, scenes: v.records, shader: o.shader ?? null, filter, at: new Date().toISOString() }, true);
  if (o.shader && /\.asm$/.test(o.shader)) {
    mkdirSync(join(folder, 'shader'), { recursive: true });
    for (const f of [o.shader, o.shader.replace(/\.asm$/, '.glsl')]) {
      if (existsSync(resolve(f))) cpSync(resolve(f), join(folder, 'shader', f.split(/[\\/]/).pop()));
    }
  }
  process.exitCode = v.ok ? 0 : 1;
}

// ------------------------------------------------------------------ status

function status(dir) {
  const p = projectDir(dir);
  const info = readProject(p);
  say(`Project ${dir}`);
  for (const u of UNITS) {
    const states = u.writes.map((w) => [w, stateOf(p, w)]);
    const own = states.filter(([, s]) => s === 'own').map(([w]) => w.fn);
    const todo = states.filter(([, s]) => s !== 'own').map(([w]) => w.fn);
    const route = info.routes?.[u.id] ?? 'not started';
    say(`Unit ${u.id} (${route}): ${own.length ? `written ${own.join(', ')}` : 'nothing written'}${todo.length ? `; not written yet: ${todo.join(', ')}` : ''}`);
  }
  const folder = join(p, 'attempts');
  const names = existsSync(folder) ? readdirSync(folder).sort() : [];
  if (!names.length) return say('No attempts yet.');
  say('Attempts, oldest first');
  const record = (name, file) => { try { return readJson(join(folder, name, file)); } catch { return null; } };
  for (const name of names) {
    const c = record(name, 'receipt.json'), q = record(name, 'prediction.json'), b = record(name, 'brief.json'), w = record(name, 'compare.json');
    if (c) say(`  ${name}: unit ${c.unit} check, ${c.passed} of ${c.of} pass (route ${c.route}, help: ${c.help_used})`);
    else if (q) say(`  ${name}: question ${q.id}, ${JSON.stringify(q.answer)}, ${q.correct ? 'correct' : 'not correct'}`);
    else if (b) say(`  ${name}: brief ${b.unit}, ${b.missing.length ? `missing ${b.missing.join('; ')}` : 'complete'}`);
    else if (w) say(`  ${name}: unit ${w.unit} compared with WebGL, ${w.ok ? 'match' : 'differs'}${w.rule ? ` (tie rule ${w.rule})` : ''}`);
  }
}

// ------------------------------------------------------------------ commands

const helpUsed = (o) => (typeof o['help-used'] === 'string' ? o['help-used'] : 'not declared');
const FLAGS = ['headless', 'lan'];

export const COMMANDS = [
  { name: 'start', args: '[PROJECT] [write|supplied|ai]', about: 'make your project: PROJECT/gpu/ from the starter (never over an existing one); a route also starts unit 1', run: ({ a }) => start(a.dir, a.route) },
  { name: 'next', args: 'PROJECT N write|supplied|ai', about: "start unit N by a route: type the functions, take the checkpoint's working ones, or brief an agent; never overwrites your code", run: ({ a }) => next(a.dir, a.unit, a.route) },
  { name: 'lesson', args: 'N [PROJECT]', about: 'read lesson N in the terminal; it stops at each prediction until you commit an answer', run: ({ a }) => lesson(a.unit, a.dir) },
  { name: 'hint', args: 'N K [PROJECT]', about: "open lesson N's K-th closed part (an optional hint or note); the lesson names each", run: ({ plain }) => hint(plain) },
  { name: 'question', args: 'ID', about: 'show a prediction question again (IDs are in the lessons)', run: ({ plain }) => question(plain[0]) },
  { name: 'predict', args: '[PROJECT] ID ANSWER', about: 'commit an answer before reading on, then see the reason', run: ({ plain, o }) => predict(plain, helpUsed(o)) },
  { name: 'check', args: 'N [PROJECT] [--help-used TEXT]', about: "run unit N's checks on PROJECT/gpu/ in Node; every run is saved in PROJECT/attempts/", run: ({ a, o }) => check(a.unit, a.dir, helpUsed(o)) },
  { name: 'view', args: 'N [PROJECT] [--scene NAME[:ARG]] [--shader NAME|FILE.asm] [--mode MODE] [--scale K]', about: "draw unit N's scene with your GPU into PROJECT/out/ as a PNG", run: ({ a, o }) => view(a.unit, a.dir, o) },
  { name: 'compare', args: 'N [PROJECT] [--scene NAME[:ARG]] [--shader NAME|FILE.asm] [--mode MODE] [--filter linear]', about: "draw unit N's scene with your GPU and with your browser's WebGL, and print where they differ", run: ({ a, o }) => compare(a.unit, a.dir, o) },
  { name: 'brief', args: 'N [PROJECT]', about: 'check that PROJECT/briefs/0N.md names the interface, the constraints and the check command', run: ({ a }) => brief(a.unit, a.dir) },
  { name: 'status', args: '[PROJECT]', about: 'your routes, which functions are written, and your saved checks, predictions and briefs', run: ({ a }) => status(a.dir) },
  { name: 'help', args: '', about: 'show this list', run: () => say(usage()) },
];

export function usage() {
  const rows = COMMANDS.map((c) => [`  ${c.name}${c.args ? ' ' + c.args : ''}`, c.about]);
  return ['Usage: node lab.mjs COMMAND ...   (PROJECT is ./project when you name none)', ...rows.map(([left, about]) => (left.length < 44 ? left.padEnd(44) + about : `${left}\n${''.padEnd(44)}${about}`))].join('\n');
}

function options(rest) {
  const o = {}, plain = [];
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i];
    if (!x.startsWith('--')) { plain.push(x); continue; }
    const eq = x.indexOf('=');
    if (eq > 2) o[x.slice(2, eq)] = x.slice(eq + 1);
    else if (!FLAGS.includes(x.slice(2)) && i + 1 < rest.length && !rest[i + 1].startsWith('--')) o[x.slice(2)] = rest[++i];
    else o[x.slice(2)] = true;
  }
  return { o, plain };
}

async function main([verb, ...rest]) {
  try {
    const { o, plain } = options(rest);
    const command = COMMANDS.find((c) => c.name === (verb === '--help' || verb === '-h' ? 'help' : verb));
    if (!verb) say(usage());
    else if (!command) { say(usage()); process.exitCode = 2; }
    else await command.run({ plain, o, a: parse(plain) });
  } catch (e) {
    console.error(e.code === 'EEXIST' ? 'That path exists: choose a new name. Nothing was overwritten.' : e.message);
    process.exitCode = 2;
  }
}

// ------------------------------------------------------------------ inside the worker

// Fresh module URLs, so an edited file is always the one that runs.
async function loadModule(file, tag) {
  return import(pathToFileURL(file).href + `?v=${tag}`);
}

async function loadScenes(tag) {
  const dir = join(root, 'scenes');
  const all = {};
  if (!existsSync(dir)) return all;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) Object.assign(all, await loadModule(join(dir, f), tag));
  return all;
}

// NAME, NAME:SEED, NAME:STOP or NAME:KEY=VALUE,KEY=VALUE (options, as floorScene:turn=90);
// --seed S and --stop NAME do the same. spec.arg, from the lab's own compare list, is
// passed to the builder as it is.
const optionsArg = (arg) => Object.fromEntries(arg.split(',').map((kv) => {
  const [k, v = ''] = kv.split('=');
  return [k, /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v];
}));
function buildScenes(builder, spec, arg) {
  if (spec.arg === undefined && arg?.includes('=')) return wrapBuilt(builder(optionsArg(arg)));
  const seed = spec.seed ?? (/^\d+$/.test(arg ?? '') ? arg : undefined);
  const stop = spec.stop ?? (arg !== undefined && seed === undefined ? arg : undefined);
  return wrapBuilt(spec.arg !== undefined ? builder(spec.arg) : seed !== undefined ? builder(Number(seed)) : stop !== undefined ? builder({ stop }) : builder());
}
function wrapBuilt(built) {
  if (Array.isArray(built)) return built.map((s, k) => [String(k + 1), s]);
  if (built && !built.tris) return Object.entries(built);
  return [[null, built]];
}

async function renderJob(job, tag) {
  const scenes = await loadScenes(tag);
  const names = () => Object.entries(scenes).filter(([, v]) => typeof v === 'function').map(([k]) => k);
  const pipe = await loadModule(join(job.project, 'gpu', 'pipeline.mjs'), tag);
  // The pipeline's own raster.mjs (the same module instance: no query string), so a new
  // subpixel grid reaches every file that reads SUB.
  const raster = await import(pathToFileURL(join(job.project, 'gpu', 'raster.mjs')).href);
  let bits = 4;
  if (job.bits && job.bits !== 4) {
    if (typeof raster.setSubpixelBits !== 'function') return { shots: null, noSetter: true };
    raster.setSubpixelBits(job.bits);
  }
  if (typeof raster.SUB === 'number') bits = Math.log2(raster.SUB);
  const shots = [];
  for (const spec of job.specs) {
    const [name, arg] = String(spec.scene).split(':');
    const builder = scenes[name];
    if (typeof builder !== 'function') return { error: `No scene called ${name}. Scenes: ${names().join(', ') || 'none yet'}.`, scenes: names() };
    for (let [key, scene] of buildScenes(builder, spec, arg)) {
      if (job.shader) scene = { ...scene, shaderName: job.shader.name, shader: job.shader.asm, glsl: job.shader.glsl };
      const opts = { stage: Number(job.unit), ties: true, ...(job.filter ? { filter: job.filter } : {}), ...(spec.opts ?? {}), ...(job.trace ? { trace: [] } : {}) };
      const out = await pipe.render(scene, opts);
      const label = scene.name ?? key ?? name;
      const variant = spec.label ? null : arg ?? spec.stop ?? (spec.seed !== undefined ? `seed${spec.seed}` : null);
      const file = [spec.label ?? name, variant, key, job.shader?.name, spec.modeTag].filter(Boolean).join('-').replace(/[^\w.-]+/g, '-');
      shots.push({ name: label, file, scene, mode: spec.opts ?? null, image: out.image, ties: out.ties ?? null, counts: out.counts ?? null, uv: out.uv ?? null });
    }
  }
  return { shots, bits };
}

async function runJob(job) {
  const tag = `${Date.now()}-${Math.random()}`;
  try {
    if (job.kind === 'check') {
      const { runUnit } = await import(pathToFileURL(join(root, 'checks', 'run.mjs')).href);
      const unit = await runUnit(job.project, job.unit);
      const transfer = existsSync(join(root, 'checks', `transfer-${job.unit}.mjs`)) ? await runUnit(job.project, `transfer-${job.unit}`) : null;
      return { ...unit, transfer };
    }
    if (job.kind === 'render') return await renderJob(job, tag);
    if (job.kind === 'diff') {
      const diff = await loadModule(join(job.project, 'gpu', 'diff.mjs'), tag);
      return { result: diff.diffImages(job.mine, job.theirs, job.ties) };
    }
    return { error: `unknown job ${job.kind}` };
  } catch (e) {
    const at = /\((file:[^)]+)\)/.exec(String(e?.stack ?? ''))?.[1];
    return { error: firstLine(e), where: at ? at.replace(/^file:\/\//, '').replace(/\?v=[^:]+/, '').split('/').slice(-2).join('/') : null };
  }
}

if (!isMainThread && workerData?.tinyGpuJob) {
  parentPort.postMessage(await runJob(workerData.tinyGpuJob));
}

function invoked() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMainThread && invoked()) await main(process.argv.slice(2));
