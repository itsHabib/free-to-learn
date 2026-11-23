#!/usr/bin/env node
// The lab for "Build a world in one file". Run `node lab.mjs help` for the commands.
import { constants, existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, copyFileSync, readdirSync, cpSync, realpathSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLessonGuarded, LESSONS, lesson, config, stageWorld, worldName } from './checks/run.mjs';
import { loadWorld, firstLine, where, declared } from './checks/pure.mjs';
import * as g from './checks/geometry.mjs';
import { layout, place } from './checks/grow.mjs';
import { runFlock, nearest } from './checks/7.mjs';
import { run as scaleRun, device } from './checks/9.mjs';
import { renderCall, peak, clickSize, wav, RATE } from './checks/sound.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const say = (s = '') => console.log(s);
const stamp = () => new Date().toISOString().replaceAll(':', '-');
const ROUTES = ['write', 'supplied', 'ai'];

function project(dir) {
  if (!dir) throw Error('Name your project folder: node lab.mjs COMMAND PROJECT ...');
  const p = resolve(dir);
  if (!existsSync(join(p, 'PROJECT.json'))) throw Error(`${dir} is not a project folder: make it with node lab.mjs start ${dir} write (or supplied, or ai)`);
  return p;
}
const readProject = (p) => JSON.parse(readFileSync(join(p, 'PROJECT.json'), 'utf8'));
function chooseLesson(n, command) {
  if (!LESSONS.includes(String(n))) throw Error(`Choose a lesson: node lab.mjs ${command} ${LESSONS.join('|')}. Lessons written so far: ${LESSONS.join(', ')}.`);
  return lesson(n);
}

// ------------------------------------------------------------------ the write route's holes

// The stage file with the body of each named function replaced by one line that throws "not written yet". The
// signature, the comment above it and every other line stay as they are.
export function withHoles(text, names) {
  const lines = text.split('\n');
  for (const name of names) {
    const start = lines.findIndex((l) => l.startsWith(`function ${name}(`));
    const end = lines.findIndex((l, i) => i > start && l === '}');
    if (start < 0 || end < 0) throw Error(`course fault: function ${name} was not found in the stage file`);
    lines.splice(start + 1, end - start - 1, `  throw new Error('${name}: not written yet');`);
  }
  return lines.join('\n');
}

const stageText = (l) => readFileSync(join(root, l.stage), 'utf8');
// The lab's copies of the world, from lesson 2 on, can run a learner's own script in the page: each such lesson has
// a name and value for the address (?shape=atoll) and a script beside the world file. The line for it is the lab's,
// not the reference's. It stands just before the world's last line, "start();", so every name in the world exists
// and nothing has grown yet: when the address asks, the first step of growing is to load the script and, where it
// stands in for one of the world's functions, to put it in that place (atoll.js needs none: the world itself looks
// for atollHeight). If the script does not define its function, the page says so instead of drawing the plain world.
const LAB_LINE = '/* lab */ ';
// A script of the lab's as one expression on one line: its comment lines dropped, its line ends made spaces.
// Puts a learner's function in the place of one of the world's. While it runs, the world's own name means the
// world's own again, so a moonKeys that calls skyKeys gets the plain sky, and not itself for ever.
const standIn = (name, fn) => [`${name} = ((plain, own) => (...values) => {`, `  const now = ${name};`, `  ${name} = plain;`, '  try {', '    return own(...values);', '  } finally {', `    ${name} = now;`, '  }', `})(${name}, ${fn});`].join('\n');
const oneLine = (text) => text.split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('//')).join(' ').replace(/;$/, '');
// What the lab does with a learner's function in the page, as readable lines: an app file, a stand-in, or nothing.
function installText({ page, functions }) {
  return page.install ? readFileSync(join(root, page.install), 'utf8').trim() : page.replaces ? standIn(page.replaces, functions[0]) : '';
}
export function pageLines(l) {
  return config.lessons.filter((x) => x.script?.page && +x.id <= +l.id).map(({ script }) => {
    const { key, value } = script.page;
    const [file, fn] = [script.file, script.functions[0]];
    const install = installText(script);
    return `${LAB_LINE}if (Q.get('${key}') === '${value}') GROW.unshift(() => new Promise((ok, no) => { const s = document.createElement('script'); s.onload = () => (typeof ${fn} === 'function' ? ok(${install ? oneLine(install) : ''}) : no(new Error('${file}: no ${fn} (the console says why)'))); s.onerror = () => no(new Error('${file} is missing')); s.src = '${file}'; document.head.append(s); }));`;
  });
}
export function labPage(l, text) {
  const lines = text.split('\n');
  lines.splice(lines.lastIndexOf('start();'), 0, ...pageLines(l));
  return lines.join('\n');
}
const routeWorld = (l, route) => labPage(l, route === 'supplied' ? stageText(l) : withHoles(stageText(l), l.writes));

// ------------------------------------------------------------------ start and recover

function start(dir, route) {
  if (!dir || !ROUTES.includes(route)) throw Error('Usage: node lab.mjs start PROJECT write|supplied|ai');
  const target = resolve(dir);
  if (!existsSync(dirname(target))) throw Error(`${dirname(target)} does not exist: make the folder that will hold ${dir} first.`);
  mkdirSync(target); // refuses an existing path, so a project is never overwritten
  const l = lesson('1');
  writeFileSync(join(target, 'world.html'), routeWorld(l, route), { flag: 'wx' });
  writeFileSync(join(target, l.script.file), l.script.starter, { flag: 'wx' });
  mkdirSync(join(target, 'briefs'));
  writeFileSync(join(target, 'PROJECT.json'), JSON.stringify({ course: config.id, started: new Date().toISOString(), routes: { 1: route } }, null, 2) + '\n', { flag: 'wx' });
  say(`Created ${dir}/world.html (stage 1, ${route === 'supplied' ? 'complete' : `with ${l.writes.join(' and ')} not written yet`}), ${dir}/${l.script.file} and ${dir}/briefs/.`);
  say(route === 'supplied' ? 'The supplied aim and boxHidden pass the contract; the map camera in map.js is still yours to write.'
    : route === 'ai' ? `Write ${dir}/briefs/01.md, run node lab.mjs brief ${dir} 1, then give the brief to your agent.`
      : `Type aim and boxHidden into ${dir}/world.html as lesson 1 shows them.`);
  say(`Check with: node lab.mjs check ${dir} 1`);
}

// Writes a stage file beside your work, never over it: PROJECT/recovery/world-0N.html (or -write.html).
function recover(dir, n, route = 'supplied') {
  const p = project(dir);
  const l = chooseLesson(n, `recover ${dir}`);
  if (!['write', 'supplied'].includes(route)) throw Error(`Usage: node lab.mjs recover ${dir} ${n} [write|supplied]`);
  mkdirSync(join(p, 'recovery'), { recursive: true });
  const name = `world-0${l.id}${route === 'write' ? '-write' : ''}.html`;
  writeFileSync(join(p, 'recovery', name), routeWorld(l, route), { flag: 'wx' });
  say(`Wrote ${dir}/recovery/${name}. Your world.html is untouched.`);
  say('Compare the two files, and copy across only the region you need.');
}

// ------------------------------------------------------------------ next: the file for the next lesson

// Every "// region: NAME" ... "// endregion: NAME" block of a file, by name, as [first line, last line].
export function regionBlocks(lines) {
  const out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = /^\/\/ region: (.+)$/.exec(lines[i]);
    if (!m) continue;
    const end = lines.indexOf(`// endregion: ${m[1]}`, i + 1);
    if (end < 0) throw Error(`line ${i + 1}: region ${m[1]} has no "// endregion: ${m[1]}" line`);
    out.set(m[1], [i, end]);
    i = end;
  }
  return out;
}
const outsideRegions = (all) => {
  const lines = all.filter((l) => !l.startsWith(LAB_LINE));
  const blocks = [...regionBlocks(lines).values()];
  return lines.filter((_, i) => !blocks.some(([a, b]) => i >= a && i <= b)).join('\n');
};

// Stage N's file with every region the learner's previous file also has copied from that file: the functions
// they typed and anything they changed in an earlier layer. New layers, stubs and the page around the script
// come from the stage. Returns the text and the names of the regions carried.
export function carryRegions(previous, stage) {
  const prev = previous.split('\n');
  const next = stage.split('\n');
  const mine = regionBlocks(prev);
  const theirs = regionBlocks(next);
  const out = [];
  const carried = [];
  for (let i = 0; i < next.length; i++) {
    const m = /^\/\/ region: (.+)$/.exec(next[i]);
    if (m && mine.has(m[1])) {
      const [a, b] = mine.get(m[1]);
      out.push(...prev.slice(a, b + 1));
      carried.push(m[1]);
      i = theirs.get(m[1])[1];
      continue;
    }
    out.push(next[i]);
  }
  return { text: out.join('\n'), carried };
}

async function next(dir, n, route) {
  const p = project(dir);
  const l = chooseLesson(n, `next ${dir}`);
  if (l.id === '1') throw Error(`Lesson 1's file is world.html: node lab.mjs start ${dir} write (or supplied, or ai).`);
  if (!ROUTES.includes(route)) throw Error(`Usage: node lab.mjs next ${dir} ${l.id} write|supplied|ai`);
  const before = lesson(String(+l.id - 1));
  const prevName = worldName(before.id);
  const prevFile = join(p, prevName);
  if (!existsSync(prevFile)) throw Error(`${dir}/${prevName} is missing: lesson ${l.id} starts from your lesson ${before.id} file.`);
  const target = join(p, l.file);
  if (existsSync(target)) throw Error(`${dir}/${l.file} exists. Nothing was overwritten; to start lesson ${l.id} again, rename or move that file first.`);
  const previous = readFileSync(prevFile, 'utf8');
  const { text, carried } = carryRegions(previous, stageText(l));
  // Which carried regions differ from the previous stage: the learner's own work.
  const prevStage = stageText(before).split('\n');
  const stageBlocks = regionBlocks(prevStage);
  const mineLines = previous.split('\n');
  const mineBlocks = regionBlocks(mineLines);
  const own = carried.filter((name) => {
    const [a, b] = mineBlocks.get(name);
    const theirs = stageBlocks.get(name);
    return !theirs || mineLines.slice(a, b + 1).join('\n') !== prevStage.slice(theirs[0], theirs[1] + 1).join('\n');
  });
  const drift = outsideRegions(mineLines) !== outsideRegions(prevStage);
  // Does the previous file still pass its own lesson's contract?
  const report = await runLessonGuarded(p, before.id);
  const failing = report.results.filter((r) => r.part === 'contract' && !r.pass).map((r) => r.id);
  writeFileSync(target, labPage(l, route === 'supplied' ? text : withHoles(text, l.writes)), { flag: 'wx' });
  const script = l.script && join(p, l.script.file);
  const madeScript = !!script && !existsSync(script);
  if (madeScript) writeFileSync(script, l.script.starter, { flag: 'wx' });
  const info = readProject(p);
  info.routes = { ...info.routes, [l.id]: route };
  info.started_from = { ...info.started_from, [l.id]: { file: prevName, contract_failing: failing, at: new Date().toISOString() } };
  writeFileSync(join(p, 'PROJECT.json'), JSON.stringify(info, null, 2) + '\n');
  say(`Created ${dir}/${l.file}: stage ${l.id}, ${route === 'supplied' ? 'complete' : `with ${l.writes.join(' and ')} not written yet`}${madeScript ? `, and ${dir}/${l.script.file}` : ''}. ${prevName} is untouched.`);
  say(`Carried from your ${prevName}: ${carried.join(', ')}.`);
  say(own.length ? `Your own changes among them: ${own.join(', ')}.` : 'None of them differs from stage ' + before.id + '.');
  if (drift) say(`Note: your ${prevName} also differs from stage ${before.id} outside any region (in the page or a stand-in). Those lines are not carried; they stay in ${prevName}.`);
  if (failing.length) say(`Warning: your ${prevName} fails lesson ${before.id}'s contract: ${failing.join(', ')}. To see why: node lab.mjs check ${dir} ${before.id}. Its functions were carried as they are, so fix them in ${l.file} and check them there with: node lab.mjs check ${dir} ${before.id} --file ${l.file}. (Working versions to compare with: node lab.mjs recover ${dir} ${before.id}.)`);
  say(`Check with: node lab.mjs check ${dir} ${l.id}`);
}

// ------------------------------------------------------------------ island: a top view of the land

const ISLAND_COLS = 64;
const ISLAND_ROWS = 32; // a character is about twice as tall as it is wide, so rows are twice as deep
const SHADES = [[-20, '~'], [0, '-'], [5, '.'], [40, ':'], [150, '+'], [Infinity, '^']];
export const shade = (h) => SHADES.find(([top]) => h < top)[1];

export function islandRows(heightFn) {
  const rows = [];
  let top = [-Infinity, 0, 0];
  let dry = 0;
  for (let row = 0; row < ISLAND_ROWS; row++) {
    const z = 1024 - (row + 0.5) * (2048 / ISLAND_ROWS);
    let text = '';
    for (let col = 0; col < ISLAND_COLS; col++) {
      const x = 1024 - (col + 0.5) * (2048 / ISLAND_COLS);
      const h = heightFn(x, z);
      if (h > top[0]) top = [h, x, z];
      if (h > 0) dry++;
      text += shade(h);
    }
    rows.push(text);
  }
  return { rows, top, dry };
}

function island(dir, o) {
  const p = project(dir);
  const l = lesson('2');
  const file = join(p, l.file);
  if (!existsSync(file)) throw Error(`${dir}/${l.file} is missing: make it with node lab.mjs next ${dir} 2 write (or supplied, or ai).`);
  const seed = o.seed !== undefined ? Number(o.seed) : 7;
  if (!Number.isSafeInteger(seed) || seed < 0) throw Error('--seed takes a whole number, 0 or more');
  const atoll = o.atoll !== undefined;
  const labels = [l.file, l.script.file];
  let w;
  try {
    w = loadWorld(file, { label: l.file, ...(atoll ? { extra: { source: readFileSync(join(p, l.script.file), 'utf8'), label: l.script.file } } : {}) });
  } catch (e) { throw Error(`${atoll ? l.script.file : l.file} did not load: ${e.message}`); }
  const D = [0, 0];
  let P;
  try { P = w.call('islandParams', seed); } catch (e) { throw stopOnLearner(e, labels); }
  const fn = atoll ? 'atollHeight' : 'landHeight';
  const { rows, top, dry } = islandRows((x, z) => { try { return w.call(fn, x, z, P, D); } catch (e) { throw stopOnLearner(e, labels); } });
  say(`${atoll ? 'Your atollHeight' : 'landHeight, with your ridged,'} for seed ${seed}: 2,048 m across, +z up and -x to the right as in lesson 1's view.`);
  say('~ below -20 m   - below the sea   . beach, up to 5 m   : up to 40 m   + up to 150 m   ^ higher');
  for (const r of rows) say(r);
  say(`Highest point: ${top[0].toFixed(1)} m at x ${top[1].toFixed(0)}, z ${top[2].toFixed(0)}. Dry: ${dry} of ${ISLAND_COLS * ISLAND_ROWS} points.`);
}

// ------------------------------------------------------------------ check and status

function line(r) {
  if (r.skipped) return `SKIP ${r.id}: ${r.skipped}`;
  return r.pass ? `PASS ${r.id}` : `FAIL ${r.id}: ${r.message}`;
}

function saveAttempt(p, files, name, record) {
  const folder = join(p, 'attempts', `${stamp()}-${name}-${randomUUID().slice(0, 8)}`);
  mkdirSync(folder, { recursive: true });
  for (const f of files) {
    const from = join(p, f);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(folder, f)), { recursive: true });
    if (statSync(from).isDirectory()) cpSync(from, join(folder, f), { recursive: true });
    else copyFileSync(from, join(folder, f));
  }
  writeFileSync(join(folder, record.file), JSON.stringify(record.data, null, 2) + '\n', { flag: 'wx' });
  return folder;
}

// How a list of results is counted: a check that could not run on this computer is neither a pass nor a failure.
export function tally(results) {
  const skipped = results.filter((r) => r.skipped).length;
  return { of: results.length, passed: results.filter((r) => r.pass && !r.skipped).length, skipped, failed: results.filter((r) => !r.pass).length };
}
const skips = (t) => (t.skipped ? `, ${t.skipped} skipped (could not run on this computer)` : '');
// The file a check judged, as it was when it was judged: if it changes under the check, nothing is recorded.
const bytesOf = (path) => (existsSync(path) ? readFileSync(path) : null);
function unchanged(path, before, name) {
  const now = bytesOf(path);
  if ((now === null) !== (before === null) || (now && !now.equals(before))) throw Error(`${name} changed while it was being checked: run the command again.`);
}

async function check(dir, n, help, file) {
  const p = project(dir);
  const l = chooseLesson(n, `check ${dir}`);
  const files = [...LESSONS.map(worldName), 'second.html', 'ship/second.html'];
  if (file && !files.includes(file)) throw Error(`--file takes one of your files: ${files.join(', ')}`);
  const judged = file ?? worldName(l.id);
  const before = bytesOf(join(p, judged));
  const report = await runLessonGuarded(p, l.id, 60000, file ?? null);
  unchanged(join(p, judged), before, judged);
  say(`Lesson ${l.id}: ${report.title}${file ? `, on ${file}` : ''}`);
  if (report.missing) { say(`Its checks are not written yet (checks/${l.id}.mjs is missing).`); process.exitCode = 1; return; }
  for (const [part, heading] of [['contract', 'Contract (required)'], ['application', 'New application (required)']]) {
    const rows = report.results.filter((r) => r.part === part);
    if (!rows.length) continue;
    say(heading);
    for (const r of rows) say('  ' + line(r));
  }
  if (report.note.length) {
    say('Matches the reference island (a note, never a failure)');
    for (const t of report.note) say('  ' + t);
  }
  const count = tally(report.results);
  say(`${count.passed} of ${count.of} checks pass in lesson ${l.id}${skips(count)}.`);
  const route = readProject(p).routes?.[l.id] ?? 'not recorded';
  const folder = saveAttempt(p, [...new Set([...config.workFiles, judged])], `check${l.id}`, { file: 'receipt.json', data: { kind: 'check', course: config.id, lesson: l.id, file: judged, sha256: before && sha(before), route, help_used: help, passed: count.passed, skipped: count.skipped, results: report.results, note: report.note, at: new Date().toISOString() } });
  say(`Saved this attempt in ${relative(process.cwd(), folder) || folder}. Route: ${route}. A pass covers these cases only.`);
  process.exitCode = report.pass ? 0 : 1;
}

function status(dir) {
  const p = project(dir);
  const info = readProject(p);
  say(`Routes: ${Object.entries(info.routes ?? {}).map(([k, v]) => `lesson ${k} ${v}`).join(', ') || 'none recorded'}`);
  const folder = join(p, 'attempts');
  const names = existsSync(folder) ? readdirSync(folder).sort() : [];
  const record = (name, file) => { try { return JSON.parse(readFileSync(join(folder, name, file), 'utf8')); } catch { return null; } };
  const answered = new Set();
  let shown = 0;
  for (const name of names) {
    const c = record(name, 'receipt.json'), q = record(name, 'prediction.json'), b = record(name, 'brief.json'), w = record(name, 'second.json');
    if (c) say(`${name} lesson ${c.lesson} check${c.file && c.file !== worldName(c.lesson) ? ` on ${c.file}` : ''}: ${tally(c.results).passed} of ${c.results.length} pass${tally(c.results).skipped ? `, ${tally(c.results).skipped} skipped` : ''} (route ${c.route}, help: ${c.help_used})`);
    else if (q) { say(`${name} question ${q.id}: ${JSON.stringify(q.answer)}, ${q.correct ? 'correct' : 'not correct'}${answered.has(q.id) ? ' (answered again)' : ' (first answer)'}`); answered.add(q.id); }
    else if (b) say(`${name} brief ${b.lesson}: ${b.missing.length ? `missing ${b.missing.join('; ')}` : 'names the interface, the constraints and the check'}`);
    else if (w) say(`${name} second world ${w.file}: ${w.passed} of ${w.of} contract checks of lessons 2 to 8 pass${w.skipped ? `, ${w.skipped} skipped` : ''} (sha256 ${w.sha256.slice(0, 12)})`);
    else continue;
    shown++;
  }
  if (!shown) say('No attempts yet.');
}

// ------------------------------------------------------------------ predictions

const practice = () => JSON.parse(readFileSync(join(root, 'practice.json'), 'utf8'));
function item(id) {
  const q = practice()[id];
  if (!q) throw Error(`Unknown question ${id}. The lessons name each one.`);
  return q;
}
// An answer in the form answers are compared in: a list of letters becomes those letters, sorted, so "d, b" is b,d.
export function normal(answer) {
  const s = String(answer).trim().toLowerCase().replace(/\.$/, '');
  if (s === 'none' || s === 'no box' || s === 'neither') return 'none';
  const parts = s.split(/[^a-z]+/).filter(Boolean);
  if (parts.length && parts.every((x) => x.length === 1)) return [...new Set(parts)].sort().join(',');
  return s.replace(/\s+/g, ' ');
}
export const accepts = (q, answer) => [q.expected, ...(q.accept ?? [])].map(normal).includes(normal(answer));

function question(id) {
  const q = item(id);
  say(q.question);
  say(`Answer format: ${q.format}`);
  say(`Commit with: node lab.mjs predict PROJECT ${id} ANSWER`);
}

function predict(dir, id, answer, help) {
  const p = project(dir);
  const q = item(id);
  if (!answer.trim()) throw Error(`Give an answer: node lab.mjs predict ${dir} ${id} ANSWER`);
  const correct = accepts(q, answer);
  saveAttempt(p, [], id, { file: 'prediction.json', data: { kind: 'prediction', id, version: q.version, question: q.question, answer, help_used: help, correct, expected: q.expected, at: new Date().toISOString() } });
  say(`Your answer: ${answer}`);
  say(correct ? 'Correct.' : `Not this time. The answer is ${q.expected}.`);
  const wrong = (q.wrong ?? []).find((w) => normal(w.answer) === normal(answer));
  say(wrong && !correct ? wrong.feedback : q.reason);
  const home = q.variantOf ? item(q.variantOf) : q;
  if (!correct) say(q.retry ? `Read lesson ${home.lesson}, "${home.section}", then try a fresh case: node lab.mjs question ${q.retry}` : `Read lesson ${home.lesson}, "${home.section}", again before the next lesson.`);
  if (q.scene) say(`See it: node lab.mjs view ${dir} --boxes ${id}`);
}

// ------------------------------------------------------------------ brief

// What a brief's text is missing: { groups: [heading, [{ name, ok, example }]], missing: [name] }.
export function briefReport(l, text) {
  const has = (rule) => new RegExp(rule.pattern, 'im').test(text);
  const groups = [['Interface', l.brief.interface], ['Fixed constraints', l.brief.constraints], ['Check command', [{ ...l.brief.check, example: `node lab.mjs ${l.id === '9' ? 'second project' : `check project ${l.id}`}` }]]]
    .map(([heading, rules]) => [heading, rules.map((r) => ({ name: r.name, ok: has(r), example: r.example }))]);
  return { groups, missing: groups.flatMap(([, rules]) => rules.filter((r) => !r.ok).map((r) => r.name)) };
}
function brief(dir, n, o) {
  const p = project(dir);
  const l = chooseLesson(n, `brief ${dir}`);
  if (o.critique !== undefined) return critique(dir, p, l);
  const name = `briefs/0${l.id}.md`;
  const file = join(p, name);
  if (!existsSync(file)) throw Error(`${dir}/${name} is missing: write your brief there first.`);
  const text = readFileSync(file, 'utf8');
  const { groups, missing } = briefReport(l, text);
  say(`Brief ${name}: what the lab looks for (it does not grade the writing).`);
  for (const [heading, rules] of groups) {
    say(heading);
    for (const r of rules) say(r.ok ? `  found   ${r.name}` : `  MISSING ${r.name}. For example: "${r.example.replaceAll('\n', ' ')}"`);
  }
  say('Also taught, not required by this command');
  for (const r of l.brief.notes) say(`  ${new RegExp(r.pattern, 'im').test(text) ? 'found  ' : 'none   '} a heading for ${r.name}`);
  const folder = saveAttempt(p, [name], `brief${l.id}`, { file: 'brief.json', data: { kind: 'brief', lesson: l.id, missing, at: new Date().toISOString() } });
  say(missing.length ? `Missing: ${missing.join('; ')}. Add them, in your own words, then run this again.` : `The brief names the interface, the constraints and the check. Give it to your agent, then run node lab.mjs ${l.id === '9' ? `second ${dir}` : `check ${dir} ${l.id}`}.`);
  say(`Saved a copy in ${relative(process.cwd(), folder) || folder}.`);
  process.exitCode = missing.length ? 1 : 0;
}

// Does a text ask for causes before fixes? The idea in any clear order of words: a cause (or the line or number that
// makes the fault, or why) that comes before a fix. A text that fixes first, and explains after, does not.
const CAUSE = String.raw`(?:\bcaus\w+|\bwhy\b|\breasons?\b|\b(?:line|number|code|value|rule|constant)s?\b[^.!?]{0,40}\b(?:makes?|made|produces?|leads?|behind|responsible)\b|\bexplain\w*|\bdiagnos\w+|\bwhere it comes from\b)`;
const FIX = String.raw`(?:\bfix\w*|\bchang\w+|\bedit\w*|\brepair\w*|\btouch\w*|\bcorrect(?:ed|ing|ions?)?\b|\bmodif\w+|\balter\w*|\brewrit\w+)`;
const NEAR = String.raw`[\s\S]{0,160}?`;
const ORDERS = [
  `${CAUSE}${NEAR}\\b(?:before|prior to|ahead of|rather than)\\b${NEAR}${FIX}`, // the cause before any fix
  `\\b(?:before|prior to)\\b[^.!?]{0,60}?${FIX}${NEAR}${CAUSE}`, // before you change anything, give its cause
  `\\bfirst\\b${NEAR}${CAUSE}${NEAR}(?:\\bthen\\b|\\bonly\\b|\\bafter\\b|\\bsecond\\b|\\bnext\\b)${NEAR}${FIX}`, // first the cause, then the fix
  `${CAUSE}[^.!?]{0,40}?\\bfirst\\b`, // the cause first
  `${CAUSE}${NEAR}(?:\\bthen\\b|\\bonly then\\b|\\bonly after\\b|\\bafter that\\b|\\bafterwards\\b)${NEAR}${FIX}`, // the cause, then the fix
  `(?:\\bdo not\\b|\\bdon't\\b|\\bnever\\b|\\bno\\b|\\bwithout\\b|\\bnothing\\b)${NEAR}${FIX}${NEAR}(?:\\buntil\\b|\\bbefore\\b|\\bunless\\b|\\bwithout\\b)${NEAR}${CAUSE}`, // do not change anything until you know the cause
  `\\b(?:do not|don't|never|hold off|nothing|not yet|no)\\b[^.!?]{0,60}?${FIX}[^.!?]{0,40}?\\b(?:yet|until|before|for now)\\b`, // do not edit anything yet
  `\\b(?:start|begin) (?:with|by)\\b[^.!?]{0,40}?${CAUSE}`, // start with the cause
  `\\bhold off\\b${NEAR}${CAUSE}`,
  `\\b(?:do not|don't|make no|no)\\b[^.!?]{0,20}?${FIX}${NEAR}${CAUSE}`, // do not fix anything on this pass; report the cause
  `${CAUSE}${NEAR}${FIX}[^.!?]{0,20}?\\b(?:later|afterwards|after that|next)\\b`, // the reason; changes come later
  `${FIX}[^.!?]{0,40}?\\b(?:only|not)\\b[^.!?]{0,30}?\\b(?:after|until|once|when)\\b${NEAR}${CAUSE}`, // fix only after the cause is known
];
const BACKWARDS = [`${FIX}[^.!?]{0,60}?\\bfirst\\b`, `\\bfirst\\b[^.!?,]{0,30}?${FIX}`, `(?<!\\bany\\s)(?<!\\bbefore\\s)${FIX}[^.!?]{0,60}?\\b(?:then|and after|afterwards|before)\\b[^.!?]{0,60}?${CAUSE}`];
export function asksCausesFirst(text) {
  // The faults themselves are not the request: take the numbered lines, and the pages they name, out.
  const request = text.split('\n').filter((x) => !/^\s*\d+[.)]\s/.test(x)).join(' ').replace(/\s+/g, ' ');
  const yes = new RegExp(CAUSE, 'i').test(request) && ORDERS.some((x) => new RegExp(x, 'i').test(request));
  // "Do not change anything before ..." is not a request to change first.
  const plain = request.split(/(?<=[.!?;])\s/).filter((x) => !/\b(?:do not|don't|never|no|without|nothing|not)\b/i.test(x));
  return yes && !plain.some((x) => BACKWARDS.some((b) => new RegExp(b, 'i').test(x)));
}

// The structure of a critique: faults numbered, each tied to a fixed picture by its address, then what the follow-up
// asks for. It cannot see whether anyone opened the pictures. `builds` is, for lesson 9, what the lab has been shown.
export function critiqueReport(l, text, builds = null) {
  const faults = text.split('\n').filter((x) => /^\s*\d+[.)]\s/.test(x));
  const tied = faults.filter((x) => new RegExp(l.critique.tie).test(x));
  const rules = [
    [`at least ${l.critique.faults} numbered faults (found ${faults.length})`, faults.length >= l.critique.faults],
    [`${l.critique.tied} (${tied.length} of ${faults.length})`, faults.length > 0 && tied.length === faults.length],
    ...(l.critique.both ?? []).map((name) => [`a fault in a picture with ${name}`, faults.some((x) => x.includes(name))]),
    ['the follow-up asks for causes before fixes. For example: "for each fault give its cause, the line or number that makes it, before you change anything"', asksCausesFirst(text)],
    [`the check command: ${l.id === '9' ? 'node lab.mjs second project' : `node lab.mjs check project ${l.id}`}`, new RegExp(l.brief.check.pattern).test(text)],
    ...(builds ? [[builds.want, builds.ok]] : []),
  ];
  return { rules, missing: rules.filter(([, ok]) => !ok).map(([what]) => what) };
}
function critique(dir, p, l) {
  if (!l.critique) throw Error(`Lesson ${l.id} has no critique round.`);
  const name = `briefs/0${l.id}-critique.md`;
  const file = join(p, name);
  if (!existsSync(file)) throw Error(`${dir}/${name} is missing: write your critique there first.`);
  let builds = null, of = null;
  if (l.id === '9') {
    // Two different builds to look at: the world it started from (the first world) and one the agent made.
    const made = secondBuilds(p).filter((r) => r.own);
    of = made.at(-1)?.sha256 ?? null;
    const now = join(p, 'ship', 'second.html');
    const stale = existsSync(now) && made.length > 0 && sha(readFileSync(now, 'utf8')) !== of;
    builds = { ok: made.length > 0 && !stale, want: stale ? `ship/second.html is a build that node lab.mjs second ${dir} has not been shown: run it first` : `a first build of the second world, different from your first world, that node lab.mjs second ${dir} has been shown (builds shown: ${new Set(made.map((r) => r.sha256)).size})` };
  }
  const { rules, missing } = critiqueReport(l, readFileSync(file, 'utf8'), builds);
  say(`Critique ${name}: the lab looks at its structure only. It cannot tell whether you opened the pictures, or judge what you saw.`);
  for (const [what, ok] of rules) say(`  ${ok ? 'found  ' : 'MISSING'} ${what}`);
  const folder = saveAttempt(p, [name], `critique${l.id}`, { file: 'brief.json', data: { kind: 'critique', lesson: `${l.id} critique`, missing, ...(of ? { of } : {}), at: new Date().toISOString() } });
  say(`Saved a copy in ${relative(process.cwd(), folder) || folder}.`);
  process.exitCode = missing.length ? 1 : 0;
}

// ------------------------------------------------------------------ view: a top view of what boxHidden keeps

const CELL = 64; // metres: the 2,048 m plane in 32 by 32 cells
const COUNT = 2048 / CELL;
const SCREENS = { phone: g.PHONE, desktop: g.DESKTOP };
const numbers = (text, n, what) => {
  const v = String(text).split(',').map(Number);
  if (v.length !== n || !v.every(Number.isFinite)) throw Error(`${what} takes ${n} numbers separated by commas`);
  return v;
};
const degrees = (text, what) => { const v = Number(text); if (text === true || !Number.isFinite(v)) throw Error(`${what} takes a number of degrees`); return (v * Math.PI) / 180; };

function stopOnLearner(e, labels) {
  const text = firstLine(e);
  return Error(/not written yet/.test(text) ? `${text}: write it, then run this again.` : `your code threw ${e?.name ?? 'Error'}: ${text}${where(e, labels)}`);
}

// A top view: +z up the page and -x to the right, the way the start view faces. Each cell is a square of ground.
export function topView(hiddenAt, marks = {}) {
  const rows = [];
  let kept = 0;
  for (let row = 0; row < COUNT; row++) {
    const z0 = 1024 - (row + 1) * CELL;
    let text = '';
    for (let col = 0; col < COUNT; col++) {
      const x0 = 1024 - (col + 1) * CELL;
      const box = [x0, 1, z0, x0 + CELL, 1, z0 + CELL];
      const mark = Object.entries(marks).find(([, [x, z]]) => x >= x0 && x < x0 + CELL && z >= z0 && z < z0 + CELL);
      const isHidden = hiddenAt(box);
      if (!isHidden) kept++;
      text += mark ? mark[0] : isHidden ? '.' : '#';
      text += ' ';
    }
    rows.push(text.trimEnd());
  }
  return { rows, kept };
}

function view(dir, o) {
  const p = project(dir);
  const worldFile = join(p, 'world.html');
  const course = stageWorld(1);
  let mine;
  try { mine = loadWorld(worldFile); } catch (e) { throw Error(`world.html did not load: ${e.message}`); }
  const guard = (labels, fn) => { try { return fn(); } catch (e) { throw stopOnLearner(e, labels); } };
  if (o.map !== undefined) return viewMap(p, worldFile, course, guard, o);
  const q = o.boxes !== undefined ? item(o.boxes) : null;
  if (o.boxes !== undefined && !q.scene) throw Error(`Question ${o.boxes} has no boxes to show.`);
  const scene = q?.scene ?? {};
  const screen = o.screen ?? scene.screen ?? 'phone';
  if (!SCREENS[screen]) throw Error('--screen takes phone or desktop');
  const eye = o.eye !== undefined ? numbers(o.eye, 3, '--eye') : scene.eye ?? g.START.eye;
  let yaw = o.yaw !== undefined ? degrees(o.yaw, '--yaw') : scene.yaw ?? g.START.yaw;
  let pitch = o.pitch !== undefined ? degrees(o.pitch, '--pitch') : scene.pitch ?? g.START.pitch;
  if (o.at !== undefined) [yaw, pitch] = guard(['world.html'], () => mine.call('aim', eye, numbers(o.at, 3, '--at')));
  const cam = g.camera(course, { eye, yaw, pitch, aspect: SCREENS[screen] });
  const hiddenAt = (b) => guard(['world.html'], () => !!mine.call('boxHidden', cam.planes, ...b));
  const marks = { '@': [eye[0], eye[2]] };
  const deg = (r) => Math.round((r * 1800) / Math.PI) / 10;
  say(`Camera at (${eye.join(', ')}), yaw ${deg(yaw)}°, pitch ${deg(pitch)}°, ${screen} screen${o.at !== undefined ? `, turned by your aim toward (${o.at})` : ''}.`);
  say(`Top view of the plane, 2,048 m across in ${CELL} m squares: +z up, -x to the right. # kept, . hidden by your boxHidden, @ the camera.`);
  const { rows, kept } = topView(hiddenAt, marks);
  for (const r of rows) say(r);
  say(`Your boxHidden keeps ${kept} of ${COUNT * COUNT} squares.`);
  if (!q) return;
  say('');
  for (const [letter, b] of Object.entries(q.scene.boxes)) say(`${letter}  ${g.boxText(b)}: ${hiddenAt(b) ? 'hidden' : 'kept'}`);
}

function viewMap(p, worldFile, course, guard, o) {
  const l = lesson('1');
  const file = join(p, l.script.file);
  if (!existsSync(file)) throw Error(`${l.script.file} is missing from the project folder.`);
  let map;
  try { map = loadWorld(worldFile, { extra: { source: readFileSync(file, 'utf8'), label: l.script.file } }); } catch (e) { throw Error(`map.js did not load: ${e.message}`); }
  const [cx, cz] = o.centre !== undefined ? numbers(o.centre, 2, '--centre') : [0, 0];
  const half = o.half !== undefined ? Number(o.half) : 512;
  if (!(half > 0)) throw Error('--half takes a positive number of metres');
  const aspect = SCREENS[o.screen ?? 'phone'];
  if (!aspect) throw Error('--screen takes phone or desktop');
  const m = new Float32Array(16);
  guard([l.script.file, 'world.html'], () => map.call('mapCamera', m, cx, cz, half, aspect));
  const planes = course.call('frustumPlanes', new Float32Array(24), m);
  const hiddenAt = (b) => guard(['world.html'], () => !!map.call('boxHidden', planes, ...b));
  say(`Your map camera: mapCamera(m, ${cx}, ${cz}, ${half}, ${Math.round(aspect * 1000) / 1000}) on a ${o.screen ?? 'phone'} screen.`);
  say(`Top view of the plane in ${CELL} m squares: +z up, -x to the right. # kept by your boxHidden with the map's planes, . hidden, + the map's centre.`);
  const { rows, kept } = topView(hiddenAt, { '+': [cx, cz] });
  for (const r of rows) say(r);
  say(`Your boxHidden keeps ${kept} of ${COUNT * COUNT} squares.`);
}

// ------------------------------------------------------------------ rain and forest: what the land and the trees do

const N_CELLS = 512;
function rain(dir, o) {
  const p = project(dir);
  const l = lesson('5');
  const file = join(p, l.file);
  if (!existsSync(file)) throw Error(`${dir}/${l.file} is missing: make it with node lab.mjs next ${dir} 5 write (or supplied, or ai).`);
  const drops = o.drops !== undefined ? Number(o.drops) : 1000;
  const seed = o.seed !== undefined ? Number(o.seed) : 7;
  const life = o.life !== undefined ? Number(o.life) : 70;
  if (![drops, seed, life].every((v) => Number.isSafeInteger(v) && v >= 0)) throw Error('--drops, --seed and --life take whole numbers');
  let w;
  try { w = loadWorld(file, { label: l.file }); } catch (e) { throw Error(`${l.file} did not load: ${e.message}`); }
  const call = (...a) => { try { return w.call(...a); } catch (e) { throw stopOnLearner(e, [l.file]); } };
  const P = call('islandParams', seed);
  const H = call('fillLand', new Float32Array(N_CELLS * N_CELLS), P);
  const E = new Float32Array(N_CELLS * N_CELLS * 3);
  const r = call('rng', call('hash2', seed, 5, 9));
  const ends = { sea: [0, 0], 'its 70 steps': [0, 0], edge: [0, 0], hollow: [0, 0] };
  for (let k = 0; k < drops; k++) {
    const d = new Float64Array(7);
    d[0] = 3 + r() * (N_CELLS - 7); d[1] = 3 + r() * (N_CELLS - 7); d[4] = d[5] = 1;
    let steps = 0;
    while (steps < life && call('dropStep', H, E, d)) steps++;
    const h = call('gridHeight', H, d[0], d[1]);
    const why = steps >= life ? 'its 70 steps' : h < -0.5 ? 'sea' : d[0] < 4 || d[1] < 4 || d[0] > N_CELLS - 6 || d[1] > N_CELLS - 6 ? 'edge' : 'hollow';
    ends[why][0]++; ends[why][1] += d[6];
  }
  let worn = 0, laid = 0;
  for (let i = 0; i < N_CELLS * N_CELLS; i++) { worn += E[i * 3]; laid += E[i * 3 + 1]; }
  const lost = worn - laid;
  say(`Rain on seed ${seed} with your depositOrCut: ${drops.toLocaleString('en-US')} drops of at most ${life} steps.`);
  say(`Worn away ${worn.toFixed(0)}, laid down ${laid.toFixed(0)}, so ${lost.toFixed(0)} is gone: ${((100 * lost) / worn).toFixed(1)} of every 100 worn away. (Each cell is 16 square metres.)`);
  say('Where a finished drop stopped, with the soil it still held:');
  for (const [why, [n, soil]] of Object.entries(ends)) if (n) say(`  ${why === 'its 70 steps' ? `on land, when its ${life} steps ran out` : why.padEnd(12)} ${String(n).padStart(5)} drops, ${soil.toFixed(0)} soil`);
}

// The flock's numbers after some steps, with the learner's steerBird.
function flock(dir, o) {
  const p = project(dir);
  const l = lesson('7');
  const file = join(p, l.file);
  if (!existsSync(file)) throw Error(`${dir}/${l.file} is missing: make it with node lab.mjs next ${dir} 7 write (or supplied, or ai).`);
  const steps = o.steps !== undefined ? Number(o.steps) : 600;
  const seed = o.seed !== undefined ? Number(o.seed) : 7;
  if (!Number.isSafeInteger(steps) || steps < 0 || steps > 20000 || !Number.isSafeInteger(seed) || seed < 0) throw Error('--steps and --seed take whole numbers');
  let w;
  try { w = loadWorld(file, { label: l.file }); } catch (e) { throw Error(`${l.file} did not load: ${e.message}`); }
  let run;
  try { run = runFlock(w, steps, seed); } catch (e) { throw stopOnLearner(e, [l.file]); }
  const { B, P, H } = run;
  let far = 0, low = Infinity, high = -Infinity;
  for (let i = 0; i < 60; i++) { far = Math.max(far, Math.hypot(B[i * 8] - P.bay[0], B[i * 8 + 2] - P.bay[1])); low = Math.min(low, B[i * 8 + 1]); high = Math.max(high, B[i * 8 + 1]); }
  say(`The flock of seed ${seed} after ${steps.toLocaleString('en-US')} steps of 1/30 second (${(steps / 30).toFixed(0)} s), with your steerBird.`);
  say(`Farthest bird from the bay's centre: ${far.toFixed(0)} m. Heights: ${low.toFixed(0)} to ${high.toFixed(0)} m. Mean distance to the nearest neighbour: ${nearest(B).toFixed(1)} m.`);
}

// A gull's call and the mix, as numbers: the sound the learner's functions make, in the lab's own renderer.
function sound(dir, o) {
  const p = project(dir);
  const l = lesson('8');
  const file = join(p, l.file);
  if (!existsSync(file)) throw Error(`${dir}/${l.file} is missing: make it with node lab.mjs next ${dir} 8 write (or supplied, or ai).`);
  const seed = o.call !== undefined ? Number(o.call) : 8;
  if (!Number.isSafeInteger(seed) || seed < 0) throw Error('--call takes a whole number, the stream for rng');
  let w;
  try { w = loadWorld(file, { label: l.file }); } catch (e) { throw Error(`${l.file} did not load: ${e.message}`); }
  const run = (fn) => { try { return fn(); } catch (e) { throw stopOnLearner(e, [l.file]); } };
  const notes = run(() => w.call('gullCall', w.call('rng', seed)));
  const call = run(() => renderCall(notes, (len) => w.call('callEnvelope', len)));
  say(`The call of rng(${seed}), by your gullCall and callEnvelope:`);
  for (const [at, len, f0, f1] of notes) say(`  ${at.toFixed(2)} s, for ${len.toFixed(2)} s: ${Math.round(f0).toLocaleString('en-US')} falling to ${Math.round(f1).toLocaleString('en-US')} Hz`);
  say(`${notes.length} notes; the last ends at ${call.seconds.toFixed(2)} s. Loudest sample ${peak(call.samples).toFixed(2)}. Where a note starts or stops, the loudness changes by at most ${clickSize(call).toFixed(2)} of that in 2 ms.`);
  if (o.wav !== undefined) {
    mkdirSync(join(p, 'sounds'), { recursive: true });
    const name = `sounds/call-${seed}-${stamp()}.wav`;
    writeFileSync(join(p, name), wav(call.samples, RATE), { flag: 'wx' });
    say(`Wrote ${dir}/${name}, the same samples, to listen to.`);
  }
  say('How loud each voice is, by your soundMix:          surf   wind  crickets  gulls');
  for (const [name, ...args] of [['2 m above the beach, by day', 0.5, 2, 0, 0, 50], ['2 m above the beach, at night', 0.5, 2, 0, 1, 50], ['on the summit, 273 m, 2 m up', 273, 2, 0, 0, 50], ['200 m above the sea, flying fast', 0, 200, 40, 0, 400]]) {
    const m = run(() => w.call('soundMix', ...args));
    say(`  ${name.padEnd(45)} ${[0, 1, 2, 3].map((k) => m[k].toFixed(2).padStart([6, 7, 9, 7][k])).join('')}`);
  }
}

// The trees on an island, thinned to a share of each 64 m square, from the learner's whichTree and bucket.
function forest(dir, o) {
  const p = project(dir);
  const l = lesson('6');
  const file = join(p, l.file);
  if (!existsSync(file)) throw Error(`${dir}/${l.file} is missing: make it with node lab.mjs next ${dir} 6 write (or supplied, or ai).`);
  const share = o.share !== undefined ? Number(o.share) : 1;
  const seed = o.seed !== undefined ? Number(o.seed) : 7;
  if (!(share > 0 && share <= 1)) throw Error('--share takes a number above 0, up to 1');
  if (!Number.isSafeInteger(seed) || seed < 0) throw Error('--seed takes a whole number, 0 or more');
  let w;
  try { w = loadWorld(file, { label: l.file }); } catch (e) { throw Error(`${l.file} did not load: ${e.message}`); }
  const run = (fn) => { try { return fn(); } catch (e) { throw stopOnLearner(e, [l.file]); } };
  const lay = run(() => layout(w, seed));
  const lists = run(() => place(w, lay, seed));
  const cells = Array.from({ length: ISLAND_ROWS * ISLAND_COLS }, () => 0);
  let all = 0, kept = 0;
  const kinds = [];
  for (const kind of [0, 1, 2, 4]) {
    const b = run(() => w.call('bucket', lists[kind]));
    all += lists[kind].length / 8; kinds.push(lists[kind].length / 8);
    for (let c = 0; c < 1024; c++) {
      const first = b.start[c], n = Math.ceil((b.start[c + 1] - first) * share);
      for (let i = first; i < first + n; i++) {
        kept++;
        const x = b.data[i * 8], z = b.data[i * 8 + 2];
        const col = Math.floor((1024 - x) / (2048 / ISLAND_COLS)), row = Math.floor((1024 - z) / (2048 / ISLAND_ROWS));
        if (col >= 0 && col < ISLAND_COLS && row >= 0 && row < ISLAND_ROWS) cells[row * ISLAND_COLS + col]++;
      }
    }
  }
  say(`Trees on seed ${seed} from your whichTree and bucket: ${all.toLocaleString('en-US')} (${['broadleaf', 'pine', 'cypress', 'palm'].map((n, i) => `${kinds[i].toLocaleString('en-US')} ${n}`).join(', ')}).`);
  say(`Drawing the first ${share === 1 ? 'whole' : share} of every 64 m square: ${kept.toLocaleString('en-US')} trees. A character is one 32 m by 64 m patch; denser is a wider mark.`);
  const marks = ' .:-=+*#%@';
  for (let row = 0; row < ISLAND_ROWS; row++) say(cells.slice(row * ISLAND_COLS, (row + 1) * ISLAND_COLS).map((n) => marks[Math.min(marks.length - 1, Math.ceil(n / 1.5))]).join(''));
}

// ------------------------------------------------------------------ tile: the wave tile as a picture

// The checksum a PNG chunk ends with (zlib.crc32 is newer than Node 22.0).
function crc32(bytes) {
  let c = ~0;
  for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
// A grey PNG: width, height and one byte a pixel.
function png(width, height, bytes) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(bytes.buffer, bytes.byteOffset + y * width, width).copy(raw, y * (width + 1) + 1);
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4); return out; };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; // 8 bits, grey
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// The heights (B) of a tile laid two by two, so that its edges meet inside the picture.
export function tilePicture(tile, n) {
  const side = n * 2;
  const b = Float32Array.from({ length: n * n }, (_, i) => tile[i * 4 + 2]);
  const lo = b.reduce((x, y) => Math.min(x, y)), hi = b.reduce((x, y) => Math.max(x, y));
  const bytes = new Uint8Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) bytes[y * side + x] = ((b[(y % n) * n + (x % n)] - lo) / (hi - lo)) * 255;
  return png(side, side, bytes);
}
function tile(dir, o) {
  const p = project(dir);
  const l = lesson('4');
  const file = join(p, l.file);
  if (!existsSync(file)) throw Error(`${dir}/${l.file} is missing: make it with node lab.mjs next ${dir} 4 write (or supplied, or ai).`);
  const lagoon = o.lagoon !== undefined;
  const fn = lagoon ? 'lagoonTile' : 'waveTile';
  let w;
  try { w = loadWorld(file, { label: l.file, ...(lagoon ? { extra: { source: readFileSync(join(p, l.script.file), 'utf8'), label: l.script.file } } : {}) }); } catch (e) { throw Error(`${lagoon ? l.script.file : l.file} did not load: ${e.message}`); }
  let t;
  try { t = w.call(fn, 128, 11); } catch (e) { throw stopOnLearner(e, [l.file, l.script.file]); }
  mkdirSync(join(p, 'pictures'), { recursive: true });
  const name = `pictures/${fn}-${stamp()}.png`;
  writeFileSync(join(p, name), tilePicture(t, 128), { flag: 'wx' });
  say(`Wrote ${dir}/${name}: the heights of ${fn}(128, 11), dark low and light high, laid two by two. Look along the middle row and column, where the tile meets itself.`);
}

// ------------------------------------------------------------------ sky: the day, as numbers

function sky(dir, o) {
  const p = project(dir);
  const l = lesson('3');
  const file = join(p, l.file);
  if (!existsSync(file)) throw Error(`${dir}/${l.file} is missing: make it with node lab.mjs next ${dir} 3 write (or supplied, or ai).`);
  const moon = o.moon !== undefined;
  let w;
  try { w = loadWorld(file, { label: l.file, ...(moon ? { extra: { source: readFileSync(join(p, l.script.file), 'utf8'), label: l.script.file } } : {}) }); } catch (e) { throw Error(`${moon ? l.script.file : l.file} did not load: ${e.message}`); }
  const run = (fn) => { try { return fn(); } catch (e) { throw stopOnLearner(e, [l.file, l.script.file]); } };
  const days = o.day !== undefined ? [numbers(o.day, 1, '--day')[0]] : [0, 0.25, 0.3, 0.36, 0.46, 0.55, 0.62, 0.78, 0.9];
  const three = (S, i) => [0, 1, 2].map((c) => S[i + c].toFixed(3)).join(' ');
  say(`The day by your dayAngle and ${moon ? 'moonKeys' : 'skyKeys'}. Colours are linear red, green, blue.`);
  say('  day  sun height  overhead             at the horizon');
  for (const u of days) {
    const sine = Math.sin(run(() => w.call('dayAngle', u)));
    const height = sine * (sine > 0 ? 44 : 16);
    const S = new Float32Array(20);
    run(() => w.call(moon ? 'moonKeys' : 'skyKeys', S, height));
    say(`${u.toFixed(2).padStart(5)} ${height.toFixed(1).padStart(8)}°    ${three(S, 8)}    ${three(S, 12)}`);
  }
}

// ------------------------------------------------------------------ scale: the resolution rule, as numbers

function scale(dir, o) {
  const p = project(dir);
  const l = lesson('9');
  const file = join(p, l.file);
  if (!existsSync(file)) throw Error(`${dir}/${l.file} is missing: make it with node lab.mjs next ${dir} 9 write (or supplied, or ai).`);
  let w;
  try { w = loadWorld(file, { label: l.file }); } catch (e) { throw Error(`${l.file} did not load: ${e.message}`); }
  const next = (...a) => { try { return w.call('nextScale', ...a); } catch (e) { throw stopOnLearner(e, [l.file]); } };
  const show = (xs) => xs.map((x) => x.toFixed(2)).join(' ');
  say('Your nextScale, one check each 0.7 s (calm counts checks under 17.6 ms and starts again when the scale changes; the page gives it an average frame time, and here it is given).');
  const slow = scaleRun(next, () => 50, 10);
  say(`From 1, ten checks with frames of 50 ms:      ${show(slow)}`);
  say(`Then ten with frames of 12 ms:                ${show(scaleRun(next, () => 12, 10, slow.at(-1)))}`);
  const full = o.device !== undefined ? Number(o.device) : 30;
  if (!(full > 0)) throw Error('--device takes the milliseconds a frame takes at full size');
  say(`A model device, ${full} ms a frame at full size (a frame takes its pixels' time, and never under 16.7 ms): 1 pixel in scale squared.`);
  say(`Its first 20 checks:                          ${show(scaleRun(next, device(full), 20))}`);
  say(`Checks 61 to 80:                              ${show(scaleRun(next, device(full), 80).slice(60))}`);
}

// ------------------------------------------------------------------ ship: one clean file

// Anything in a page that reaches another file: a shipped world has none of these.
const OUTSIDE = [[/<script[^>]*\ssrc\s*=/i, 'a script tag with a src'], [/<link\b/i, 'a <link> tag'], [/<(?:img|audio|video|iframe|source)\b/i, 'a tag that loads a file'], [/@import|url\s*\(/i, 'a stylesheet that loads a file'], [/\b(?:fetch|import|importScripts|XMLHttpRequest|WebSocket|EventSource)\s*\(/, 'a call that loads a file'], [/^\s*import\b/m, 'an import line']];
export function outside(text) { return OUTSIDE.filter(([pattern]) => pattern.test(text)).map(([, what]) => what); }

// A learner's own file made into one clean page: the lab's lines gone, and the named applications written into it.
export function shipText(text, names, scriptOf, label = 'the world') {
  let lines = text.split('\n');
  const left = lines.filter((l) => l.startsWith(LAB_LINE)).length;
  lines = lines.filter((l) => !l.startsWith(LAB_LINE));
  const blocks = [];
  const taken = new Set(declared(lines.join('\n')));
  for (const name of names) {
    const l = config.lessons.find((x) => x.script?.shipName === name);
    const { script } = l;
    const source = scriptOf(script.file);
    if (source === null) throw Error(`${script.file} is missing from the project folder.`);
    if (source.match(HOLE)) throw Error(`${script.file}: ${script.functions[0]} is not written yet.`);
    for (const own of declared(source)) {
      if (taken.has(own)) throw Error(`${script.file} declares ${own}, which ${label} also declares: rename yours, so that the shipped file holds one of each.`);
      taken.add(own);
    }
    const starter = new Set(script.starter.split('\n').filter((x) => x.startsWith('//')));
    const code = source.trim().split('\n').filter((x) => !starter.has(x.trimEnd())).join('\n').trim();
    const { ship } = script.page;
    const on = installText(script);
    blocks.push('', `// ${name}: the writer's own ${script.functions[0]} (lesson ${l.id}).`, code, ...(on ? [on] : []));
    if (ship) {
      const at = lines.findIndex((x) => x.trim() === ship.from);
      if (at < 0) throw Error(`the line "${ship.from}" was not found, so ${name} cannot be turned on. Put it back, or leave ${name} out.`);
      lines[at] = lines[at].replace(ship.from, ship.to);
    }
  }
  const at = lines.lastIndexOf('start();');
  if (at < 0) throw Error(`${label} has no "start();" line`);
  lines.splice(at, 0, ...blocks);
  return { text: lines.join('\n'), removed: left };
}
const HOLE = /new Error\('(\w+): not written yet'\)/g;
const SHIP_NAMES = config.lessons.filter((l) => l.script?.shipName).map((l) => l.script.shipName);
const scriptsIn = (html) => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

async function ship(dir, o) {
  const p = project(dir);
  const name = o.file ?? lesson('9').file;
  if (typeof name !== 'string' || !/^[\w-]+\.html$/.test(name)) throw Error('--file takes a file of your project, such as second.html');
  const file = join(p, name);
  if (!existsSync(file)) throw Error(name === lesson('9').file ? `${dir}/${name} is missing: make it with node lab.mjs next ${dir} 9 write (or supplied, or ai).` : `${dir}/${name} is missing.`);
  const names = o.with === undefined ? [] : String(o.with).split(',').filter(Boolean);
  const unknown = names.find((x) => !SHIP_NAMES.includes(x));
  if (unknown || o.with === true || new Set(names).size !== names.length) throw Error(`--with takes names from ${SHIP_NAMES.join(', ')}, separated by commas${unknown === 'fish' ? ' (fish is drawn with the gulls, so it does not ship)' : ''}.`);
  const text = readFileSync(file, 'utf8');
  const holes = [...text.matchAll(HOLE)].map((m) => m[1]);
  if (holes.length) throw Error(`${name} still has ${holes.join(' and ')} not written yet: write it, then ship.`);
  const { text: out, removed } = shipText(text, names, (f) => (existsSync(join(p, f)) ? readFileSync(join(p, f), 'utf8') : null), name);
  const found = outside(out);
  if (found.length) throw Error(`${name} reaches another file: ${found.join('; ')}. A shipped world is one file.`);
  for (const code of scriptsIn(out)) { try { new Script(code); } catch (e) { throw Error(`the shipped file would not run: ${firstLine(e)}`); } }
  const target = o.as ?? (name === lesson('9').file ? 'world.html' : name);
  if (typeof target !== 'string' || !/^[\w-]+\.html$/.test(target)) throw Error('--as takes a file name that ends in .html');
  mkdirSync(join(p, 'ship'), { recursive: true });
  // A build of the second world makes way for the next one: it keeps its content under a number.
  if (target === 'second.html' && existsSync(join(p, 'ship', target))) {
    let k = 1;
    while (existsSync(join(p, 'ship', `second-${k}.html`))) k++;
    renameSync(join(p, 'ship', target), join(p, 'ship', `second-${k}.html`));
    say(`The build before this one is now ${dir}/ship/second-${k}.html.`);
  }
  writeFileSync(join(p, 'ship', target), out, { flag: 'wx' });
  say(`Wrote ${dir}/ship/${target}: ${out.split('\n').length.toLocaleString('en-US')} lines, ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB, one file.`);
  say(`Removed ${removed} lab line${removed === 1 ? '' : 's'}. ${names.length ? `Written into it: ${names.join(', ')}.` : 'None of your own applications is in it; add them with --with ' + SHIP_NAMES.join(',') + '.'}`);
  say('It names no other file. It has not been opened in a browser: open it, and look.');
  say(`Your world and scripts are untouched. Send someone the file, or put it anywhere that serves a web page.`);
}

// ------------------------------------------------------------------ second: the second world, against lessons 2 to 8

// Runs the contract checks of lessons 2 to 8 on a shipped file, and records which passed on it. Lesson 9's is the
// first world's own. The second world is finished when all pass and a critique lies between two different builds.
const sha = (text) => createHash('sha256').update(text).digest('hex');
// Every record of the second world and its critiques, in the order they were made.
function secondRecords(p) {
  const folder = join(p, 'attempts');
  return (existsSync(folder) ? readdirSync(folder).sort() : []).map((n) => {
    for (const f of ['second.json', 'brief.json']) { try { return JSON.parse(readFileSync(join(folder, n, f), 'utf8')); } catch { /* another kind */ } }
    return null;
  }).filter(Boolean);
}
const secondBuilds = (p) => secondRecords(p).filter((r) => r.kind === 'second');
// The second world starts as a copy of the first one shipped.
function secondStart(dir, p) {
  const from = join(p, 'ship', 'world.html');
  if (!existsSync(from)) throw Error(`${dir}/ship/world.html is missing: ship your first world with node lab.mjs ship ${dir}.`);
  copyFileSync(from, join(p, 'second.html'), constants.COPYFILE_EXCL);
  say(`Copied ${dir}/ship/world.html to ${dir}/second.html, where your second world is made. Your first world is untouched.`);
}
const SECOND_LESSONS = ['2', '3', '4', '5', '6', '7', '8'];
async function second(dir, o) {
  const p = project(dir);
  if (o.start !== undefined) return secondStart(dir, p);
  const name = o.file ?? 'ship/second.html';
  if (typeof name !== 'string' || !/^(ship\/)?[\w-]+\.html$/.test(name)) throw Error('--file takes a file of your project, such as ship/second.html');
  const file = join(p, name);
  if (!existsSync(file)) throw Error(`${dir}/${name} is missing. Start it with node lab.mjs second ${dir} --start, make your second world in ${dir}/second.html, then node lab.mjs ship ${dir} --file second.html.`);
  const before = readFileSync(file);
  const text = before.toString('utf8');
  const first = join(p, 'ship', 'world.html');
  const problems = [];
  const found = outside(text);
  if (found.length) problems.push(`the file reaches another file: ${found.join('; ')}`);
  if (text.includes('\n' + LAB_LINE)) problems.push('the file still has a lab line: ship it first');
  if (existsSync(first) && readFileSync(first, 'utf8') === text) problems.push('the file is your first world, unchanged');
  say(`Second world ${name}: the contract checks of lessons 2 to 8, on its own functions.`);
  const rows = [];
  for (const id of SECOND_LESSONS) {
    const report = await runLessonGuarded(p, id, 60000, name);
    const own = report.results.filter((r) => r.part === 'contract');
    rows.push(...own.map((r) => ({ lesson: id, id: r.id, pass: r.pass, ...(r.skipped ? { skipped: r.skipped } : {}), ...(r.message ? { message: r.message } : {}) })));
    const count = tally(own);
    say(`Lesson ${id} ${count.failed ? 'fails' : 'passes'}: ${count.passed} of ${count.of}${skips(count)}`);
    for (const r of own) if (!r.pass || r.skipped) say('  ' + line(r));
  }
  unchanged(file, before, name);
  const hash = sha(before);
  const seen = secondRecords(p);
  const own = !problems.length;
  const distinct = [...new Set([...seen.filter((r) => r.kind === 'second' && r.own).map((r) => r.sha256), ...(own ? [hash] : [])])];
  // A critique with nothing missing, of a build that is not this one.
  const between = own && seen.some((r) => r.kind === 'critique' && String(r.lesson).startsWith('9') && !r.missing.length && r.of && r.of !== hash);
  const { passed, skipped, failed } = tally(rows);
  const out = { kind: 'second', course: config.id, file: name, sha256: hash, own, passed, skipped, of: rows.length, results: rows, problems, builds: distinct.length, critique_between: between, at: new Date().toISOString() };
  const saved = saveAttempt(p, [name], 'second', { file: 'second.json', data: out });
  say(`${passed} of ${rows.length} contract checks pass on ${name}${skips({ skipped })} (sha256 ${hash.slice(0, 12)}).`);
  for (const x of problems) say(`PROBLEM: ${x}`);
  say(`Builds checked so far: ${distinct.length}. A critique between two of them: ${between ? 'yes' : 'not yet'} (node lab.mjs brief ${dir} 9 --critique, then build again).`);
  say(`Saved in ${relative(process.cwd(), saved) || saved}. The lab cannot tell who built the file; it knows only its bytes.`);
  process.exitCode = !failed && !problems.length && between ? 0 : 1;
  say(process.exitCode ? 'Not finished yet.' : 'The second world passes, with a critique between two builds.');
}

// ------------------------------------------------------------------ serve: open the world on this computer or a phone

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.png': 'image/png' };

function serve(dir, o) {
  const p = realpathSync(project(dir));
  const port = o.port !== undefined ? Number(o.port) : 8080;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('--port takes a whole number from 1024 to 65535');
  const lan = o.lan !== undefined;
  // The newest lesson file in the project: world-0N.html for the highest N, or world.html.
  const newest = [...LESSONS].reverse().map(worldName).find((f) => existsSync(join(p, f))) ?? 'world.html';
  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('bad address'); return; }
    if (path === '/') { res.writeHead(302, { location: '/' + newest }).end(); return; }
    const file = resolve(p, '.' + path);
    let real;
    try { real = realpathSync(file); } catch { res.writeHead(404).end('not found'); return; }
    if (!real.startsWith(p + sep) || !statSync(real).isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(real)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(real));
  });
  server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use: add --port 8090 (or another).` : e.message); process.exitCode = 2; });
  server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
    say(`Serving ${dir}/ (only this folder) until you press Ctrl+C.`);
    say(`On this computer: http://localhost:${port}/${newest}`);
    if (!lan) { say('For a phone on the same Wi-Fi, stop this and run it again with --lan.'); return; }
    const addresses = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
    for (const a of addresses) say(`On a phone on the same Wi-Fi: http://${a}:${port}/${newest}`);
    if (!addresses.length) say('No network address found: is this computer on Wi-Fi?');
    say('Anyone on this network can read the files in this folder while it runs.');
  });
}

// ------------------------------------------------------------------ commands

const helpUsed = (o) => (typeof o['help-used'] === 'string' ? o['help-used'] : 'not declared');

export const COMMANDS = [
  { name: 'start', args: 'PROJECT write|supplied|ai', about: 'make your project folder: world.html at stage 1 (holes to type on write and ai), map.js, briefs/', run: ({ plain }) => start(plain[0], plain[1]) },
  { name: 'next', args: 'PROJECT N write|supplied|ai', about: 'make world-0N.html for lesson N from its stage, carrying your regions from the previous file; never overwrites', run: ({ plain }) => next(plain[0], plain[1], plain[2]) },
  { name: 'check', args: 'PROJECT N [--file world-0M.html] [--help-used TEXT]', about: "run lesson N's checks on your file for it (world.html, then world-0N.html), or on a later file, and its script; every run is saved", run: ({ plain, o }) => check(plain[0], plain[1], helpUsed(o), o.file) },
  { name: 'question', args: 'ID', about: 'show a prediction question (IDs are in the lessons)', run: ({ plain }) => question(plain[0]) },
  { name: 'predict', args: 'PROJECT ID ANSWER [--help-used TEXT]', about: 'commit an answer before reading on, then see the reason', run: ({ plain, o }) => predict(plain[0], plain[1], plain.slice(2).join(' '), helpUsed(o)) },
  { name: 'brief', args: 'PROJECT N [--critique]', about: 'check that briefs/0N.md names the interface, the constraints and the check command (or briefs/0N-critique.md its faults)', run: ({ plain, o }) => brief(plain[0], plain[1], o) },
  { name: 'view', args: 'PROJECT [--yaw D] [--pitch D] [--eye X,Y,Z] [--at X,Y,Z] [--screen phone|desktop] [--boxes ID] [--map [--centre X,Z] [--half M]]', about: 'a top view of the squares your boxHidden keeps for a camera (or for your map camera)', run: ({ plain, o }) => view(plain[0], o) },
  { name: 'island', args: 'PROJECT [--seed S] [--atoll]', about: 'a top view of the land in your world-02.html for a seed (or of your atoll)', run: ({ plain, o }) => island(plain[0], o) },
  { name: 'rain', args: 'PROJECT [--drops 1000] [--seed S] [--life STEPS]', about: 'what rain does to an island with your depositOrCut: rock worn, laid and lost', run: ({ plain, o }) => rain(plain[0], o) },
  { name: 'flock', args: 'PROJECT [--steps 600] [--seed S]', about: 'where the birds are after some steps, with your steerBird', run: ({ plain, o }) => flock(plain[0], o) },
  { name: 'sound', args: 'PROJECT [--call SEED] [--wav]', about: "a gull's call and the mix as numbers, with your gullCall, callEnvelope and soundMix (--wav writes the call to listen to)", run: ({ plain, o }) => sound(plain[0], o) },
  { name: 'forest', args: 'PROJECT [--share 0.5] [--seed S]', about: 'the trees your whichTree and bucket give an island, thinned to a share of each square', run: ({ plain, o }) => forest(plain[0], o) },
  { name: 'tile', args: 'PROJECT [--lagoon]', about: 'a picture of the wave tile from your world-04.html (or your lagoonTile), laid two by two', run: ({ plain, o }) => tile(plain[0], o) },
  { name: 'sky', args: 'PROJECT [--day U] [--moon]', about: "the sun's height and the sky's colours through the day, from your world-03.html (or your moonKeys)", run: ({ plain, o }) => sky(plain[0], o) },
  { name: 'scale', args: 'PROJECT [--device MS]', about: 'what your nextScale does to the picture size: ten slow checks, ten fast ones, and a model device', run: ({ plain, o }) => scale(plain[0], o) },
  { name: 'ship', args: 'PROJECT [--with atoll,moon,...] [--file second.html] [--as NAME.html]', about: 'write one clean HTML file into PROJECT/ship/: no lab line, no other file; --with writes your own applications into it; never overwrites', run: ({ plain, o }) => ship(plain[0], o) },
  { name: 'second', args: 'PROJECT [--start] [--file ship/second.html]', about: '--start copies your shipped world to second.html, where the second world is made; without it, run the contract checks of lessons 2 to 8 on the shipped second world and record which pass', run: ({ plain, o }) => second(plain[0], o) },
  { name: 'serve', args: 'PROJECT [--port 8080] [--lan]', about: 'serve your project folder to open world.html in a browser; --lan for a phone on the same Wi-Fi', run: ({ plain, o }) => serve(plain[0], o) },
  { name: 'recover', args: 'PROJECT N [write|supplied]', about: "write lesson N's stage file to PROJECT/recovery/, never over your work", run: ({ plain }) => recover(plain[0], plain[1], plain[2]) },
  { name: 'status', args: 'PROJECT', about: 'your routes, saved checks, predictions and briefs, in order', run: ({ plain }) => status(plain[0]) },
  { name: 'help', args: '', about: 'show this list', run: () => say(usage()) },
];

export function usage() {
  const rows = COMMANDS.map((c) => [`  ${c.name}${c.args ? ' ' + c.args : ''}`, c.about]);
  return ['Usage: node lab.mjs COMMAND ...', ...rows.map(([left, about]) => (left.length < 40 ? left.padEnd(40) + about : `${left}\n${''.padEnd(40)}${about}`))].join('\n');
}

function options(rest) {
  const o = {}, plain = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) { plain.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 2) o[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < rest.length && !rest[i + 1].startsWith('--') && !['map', 'lan', 'atoll', 'critique', 'moon', 'lagoon', 'wav', 'start'].includes(a.slice(2))) o[a.slice(2)] = rest[++i];
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
    console.error(e.code === 'EEXIST' ? 'That path exists: choose a new name. Nothing was overwritten.' : e.message);
    process.exitCode = 2;
  }
}

function invoked() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (invoked()) await main(process.argv.slice(2));
