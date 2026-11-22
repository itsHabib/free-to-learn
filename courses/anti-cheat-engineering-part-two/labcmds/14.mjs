// Lab commands for unit 14: your detector on the corpus, its threshold, the freeze and the
// held-out split. lab.mjs lists them with its own commands (node lab.mjs help).
//
//   features PROJECT [--split dev|heldout]   your features by kind, and robust scales over the legal sessions
//                                            (held-out only after your first held-out result)
//   tune PROJECT [--write]                   your score and chooseThreshold on the dev split
//   freeze PROJECT                           record the sha256 of your detector's three files
//   restore-frozen PROJECT                   put back the three files as your latest freeze copied them
//   heldout PROJECT                         your frozen detector on the held-out split
//   recordings PROJECT                       your detector on the recorded adapted searchers (with no
//                                            threshold stored, at the one tune would choose on dev)
//
// Freezes and held-out results are kept the way lab.mjs keeps check attempts and predictions:
// one new folder per record in PROJECT/attempts/, named by the time, holding freeze.json or
// heldout.json. A folder is never overwritten, so your first held-out result stays where it
// was written and every later one is added after it.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeCorpus, KINDS } from '../public/corpus.mjs';
import { median, quantile } from '../public/stats.mjs';
import { makeLoader, NOT_WRITTEN } from '../checks/harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const say = (s = '') => console.log(s);
// A path as you would type it from the folder you run commands in: project/attempts/...
const shown = (path) => relative(process.cwd(), path) || '.';
const COURSE = JSON.parse(readFileSync(join(root, 'course.json'), 'utf8')).id;
const BUDGET = 0.002;
const FROZEN = ['detect/settings.json', 'detect/features.mjs', 'detect/detector.mjs'];
const FEATURES = ['shots', 'hitRate', 'missMedian', 'fireMedian', 'fireSpread', 'inputsMedian', 'cadenceCV', 'missLag1'];
const RECORDINGS = ['delay', 'delay-misses'];
const COUNT_FIELDS = ['total', 'tp', 'fp', 'tn', 'fn', 'recall', 'falsePositiveRate', 'precision'];

const f3 = (x) => (x === null || x === undefined ? '-' : typeof x === 'number' && Number.isFinite(x) ? x.toFixed(3) : String(x));
const pct = (k, n) => (n ? `${((100 * k) / n).toFixed(1)}%` : '-');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const ratio = (k, n) => (n ? k / n : null);

function project(dir) {
  if (!dir) throw Error('Name your project folder: node lab.mjs COMMAND PROJECT ...');
  const p = resolve(dir);
  if (!existsSync(join(p, 'PROJECT.json'))) throw Error(`${dir} is not a project folder: make it with a starting route from lesson 12 (node examples/start-chapter.mjs ${dir} write, or supplied)`);
  return p;
}

// "detect/features.mjs line 12" for the first line of an error's stack inside the project.
function where(error, p) {
  const roots = [p, pathToFileURL(p).href];
  try { const real = realpathSync(p); roots.push(real, pathToFileURL(real).href); } catch { /* keep the given path */ }
  for (const line of String(error?.stack ?? '').split('\n')) {
    for (const r of roots) {
      const i = line.indexOf(r);
      const m = i < 0 ? null : line.slice(i + r.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return ` (${decodeURIComponent(m[1])} line ${m[2]})`;
    }
  }
  return '';
}

// Calls your function; an error it throws comes back saying what it was given and where.
function caller(p) {
  return (what, f) => {
    try {
      return f();
    } catch (error) {
      const message = String(error?.message ?? error).split('\n')[0];
      if (message.includes(NOT_WRITTEN)) throw Error(message);
      throw Error(`${what}: ${error?.name ?? 'Error'}: ${message}${where(error, p)}`);
    }
  };
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const hashes = (p) => Object.fromEntries(FROZEN.map((f) => [f, existsSync(join(p, f)) ? sha256(join(p, f)) : null]));

// Your freezes and held-out results, oldest first.
function records(p) {
  const folder = join(p, 'attempts');
  const out = [];
  for (const name of existsSync(folder) ? readdirSync(folder).sort() : []) {
    for (const file of ['freeze.json', 'heldout.json']) {
      const path = join(folder, name, file);
      if (!existsSync(path)) continue;
      try { out.push({ ...JSON.parse(readFileSync(path, 'utf8')), folder: name }); } catch (e) { throw Error(`${shown(path)} is not valid JSON (${e.message}): restore it before you go on`); }
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// A file's bytes written over another's. Not copyFileSync: that also copies the file's mode,
// which only the destination's owner may change, so it fails on a file another tool rewrote.
function copyBytes(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, readFileSync(from));
}

// A new folder in attempts/ named by the record's own time; never an existing one.
function newFolder(p, kind, at) {
  const name = `${at.replaceAll(':', '-')}-${kind}-${randomUUID().slice(0, 8)}`;
  mkdirSync(join(p, 'attempts', name), { recursive: true });
  return `attempts/${name}`;
}
const writeRecord = (p, folder, kind, record) => writeFileSync(join(p, folder, `${kind}.json`), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
function save(p, kind, record, copies = []) {
  const folder = newFolder(p, kind, record.at);
  for (const f of copies) copyBytes(join(p, f), join(p, folder, f));
  writeRecord(p, folder, kind, record);
  return folder;
}

// The latest freeze, provided your three files still hash to it; otherwise a refusal.
function requireFrozen(p, dir, what) {
  const all = records(p);
  const freeze = all.filter((r) => r.kind === 'freeze').at(-1);
  if (!freeze) throw Error(`Freeze first: node lab.mjs freeze ${dir}. ${what} looks at the held-out split, so it runs only on a frozen detector.`);
  const now = hashes(p);
  const changed = FROZEN.filter((f) => now[f] !== freeze.files?.[f]);
  if (changed.length) {
    const seen = all.some((r) => r.kind === 'heldout');
    throw Error(`${changed.join(' and ')} changed since you froze at ${freeze.at} (the frozen copies are in ${freeze.folder ? shown(join(p, 'attempts', freeze.folder)) : 'your attempts folder'}). Freeze again (node lab.mjs freeze ${dir}) before ${what}.${seen ? ' Your first held-out result stays first; the next one is saved as a later run.' : ''}`);
  }
  return { freeze, runs: all.filter((r) => r.kind === 'heldout') };
}

function count(decisions) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const d of decisions) {
    if (d.label === 'cheat') { if (d.flagged) tp++; else fn++; } else if (d.flagged) fp++; else tn++;
  }
  return { total: decisions.length, tp, fp, tn, fn, recall: ratio(tp, tp + fn), falsePositiveRate: ratio(fp, fp + tn), precision: ratio(tp, tp + fp) };
}
const precisionAt = (b, r, f) => { const d = b * r + (1 - b) * f; return d === 0 ? null : (b * r) / d; };

async function detector(p, need = []) {
  const loader = makeLoader(p);
  const settings = loader.json('detect/settings.json');
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('detect/settings.json must hold a JSON object: your score\'s settings, "budget" and "threshold"');
  const fns = {};
  for (const [file, name] of [['detect/features.mjs', 'features'], ['detect/detector.mjs', 'score'], ...need]) fns[name] = await loader.fn(file, name);
  return { settings, loader, ...fns };
}

// What your features are given, here as in the checks and the scoreboard: a session's play,
// its record.inputs and rounds, and nothing else (no id, label, kind or seed).
const playOf = (c) => ({ record: { inputs: c.record.inputs }, rounds: c.rounds });

function scored(cases, d, settings, call) {
  return cases.map((c) => {
    const f = call(`your features threw on case ${c.id}, given { record: { inputs }, rounds } only`, () => d.features(playOf(c)));
    return { c, s: call(`your score threw on case ${c.id}`, () => d.score(f, settings)) };
  });
}

const finiteThreshold = (settings) => typeof settings.threshold === 'number' && Number.isFinite(settings.threshold);
const listed = (rows, k = 5) => rows.slice(0, k).map((x) => `${x.c.id} ${f3(x.s)}`).join(', ');

// ------------------------------------------------------------------ features

async function features({ plain, o }) {
  const dir = plain[0];
  const p = project(dir);
  const split = o.split === undefined ? 'dev' : String(o.split);
  if (!['dev', 'heldout'].includes(split)) throw Error('--split takes dev or heldout');
  // The held-out split's features only once your first held-out result is saved, so that
  // looking at them can shape only later runs.
  const first = records(p).find((r) => r.kind === 'heldout');
  if (split === 'heldout' && !first) throw Error(`The held-out split's features are shown only after your first held-out result is saved (node lab.mjs freeze ${dir}, then node lab.mjs heldout ${dir}), so that looking at them cannot shape that result.`);
  const call = caller(p);
  const feature = await makeLoader(p).fn('detect/features.mjs', 'features');
  const cases = makeCorpus({ split });
  const rows = cases.map((c) => ({ c, f: call(`your features threw on case ${c.id}, given { record: { inputs }, rounds } only`, () => feature(playOf(c))) }));
  say(`Your features on the ${split} split: ${cases.length} sessions (makeCorpus({ split: '${split}' }) in public/corpus.mjs).`);
  if (split === 'heldout') say(`Your first held-out result was saved at ${first.at}; what you see here can shape only later runs.`);
  say();
  say('Pooled hit rate by kind: all hits over all shots of the kind\'s sessions.');
  say(`  ${pad('kind', 12)} ${lpad('sessions', 8)} ${lpad('shots', 7)} ${lpad('hits', 6)} ${lpad('hit rate', 9)}`);
  for (const kind of KINDS) {
    const of = cases.filter((c) => c.kind === kind);
    let shots = 0, hits = 0;
    for (const c of of) for (const r of c.rounds) if (r.shot) { shots++; if (r.result === 'hit') hits++; }
    say(`  ${pad(kind, 12)} ${lpad(of.length, 8)} ${lpad(shots, 7)} ${lpad(hits, 6)} ${lpad(pct(hits, shots), 9)}`);
  }
  say();
  const legal = rows.filter((x) => x.c.label === 'legal');
  say('Each feature by kind: the median, lower quartile and upper quartile of your features over');
  say('the kind\'s sessions (a session where the feature is null is left out and counted).');
  say(`Under each, all ${legal.length} legal sessions together: the median and 1.4826 × the median`);
  say('absolute deviation (MAD), a robust scale: z = (value - median) / scale; and the same for');
  say('Math.log1p(value), for a feature you compare on a log scale.');
  for (const name of FEATURES) {
    say();
    say(`${pad(name, 14)} ${lpad('sessions', 14)} ${lpad('median', 9)} ${lpad('lower q', 9)} ${lpad('upper q', 9)}`);
    for (const kind of KINDS) {
      const all = rows.filter((x) => x.c.kind === kind).map((x) => x.f?.[name]);
      const values = all.filter((v) => typeof v === 'number' && Number.isFinite(v));
      const missing = all.length - values.length;
      const n = `${values.length}${missing ? ` (${missing} null)` : ''}`;
      say(`  ${pad(kind, 12)} ${lpad(n, 14)} ${lpad(f3(median(values)), 9)} ${lpad(f3(quantile(values, 0.25)), 9)} ${lpad(f3(quantile(values, 0.75)), 9)}`);
    }
    const values = legal.map((x) => x.f?.[name]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const m = median(values);
    const scale = m === null ? null : 1.4826 * median(values.map((v) => Math.abs(v - m)));
    const missing = legal.length - values.length;
    say(`  ${pad('all legal', 12)} ${lpad(`${values.length}${missing ? ` (${missing} null)` : ''}`, 14)}   median ${f3(m)}, 1.4826 × MAD ${f3(scale)}`);
    if (values.length && values.every((v) => v >= 0)) {
      const logs = values.map((v) => Math.log1p(v));
      const lm = median(logs);
      say(`  ${pad('', 12)} ${lpad('', 14)}   of log1p: median ${f3(lm)}, 1.4826 × MAD ${f3(1.4826 * median(logs.map((v) => Math.abs(v - lm))))}`);
    }
  }
}

// ------------------------------------------------------------------ tune

async function tune({ plain, o }) {
  const dir = plain[0];
  const p = project(dir);
  const write = o.write === true || o.write === 'true';
  const call = caller(p);
  const d = await detector(p, [['detect/detector.mjs', 'chooseThreshold']]);
  const { settings } = d;
  const budget = settings.budget;
  if (typeof budget !== 'number' || !(budget >= 0 && budget <= 1)) throw Error(`detect/settings.json needs "budget": 0.002 (one false flag in 500 legal sessions); it holds ${JSON.stringify(budget)}`);
  if (budget !== BUDGET) say(`Note: detect/settings.json holds budget ${budget}. The course's budget is 0.002, and freeze takes no other.`);
  const dev = scored(makeCorpus({ split: 'dev' }), d, settings, call);
  const legal = dev.filter((x) => x.c.label === 'legal');
  const cheats = dev.filter((x) => x.c.label === 'cheat');
  const t = call('your chooseThreshold threw on the dev legal scores', () => d.chooseThreshold(legal.map((x) => x.s), budget));
  say(`Your score on the dev split (makeCorpus({ split: 'dev' })): ${legal.length} legal sessions, ${cheats.length} searcher sessions.`);
  say(`Your chooseThreshold on the ${legal.length} legal scores at budget ${budget} (at most ${budget * legal.length} of them at or above it):`);
  say(`  threshold ${t}${typeof t === 'number' && Number.isFinite(t) ? ` (${f3(t)})` : ''}`);
  if (typeof t !== 'number' || Number.isNaN(t)) throw Error(`chooseThreshold returned ${JSON.stringify(t)}, not a number: nothing ${write ? 'written' : 'to store'}`);
  const r = count(dev.map((x) => ({ label: x.c.label, flagged: x.s >= t })));
  const flaggedLegal = legal.filter((x) => x.s >= t).sort((a, b) => b.s - a.s);
  say(`At that threshold, on dev (counted by the lab from your scores):`);
  say(`  legal sessions flagged     ${r.fp} of ${legal.length}${flaggedLegal.length ? `: ${listed(flaggedLegal)}${flaggedLegal.length > 5 ? ', ...' : ''}` : ''}`);
  say(`  searcher sessions flagged  ${r.tp} of ${cheats.length} (recall ${f3(r.recall)})`);
  say(`  tp ${r.tp}  fn ${r.fn}  fp ${r.fp}  tn ${r.tn}`);
  say(`  highest legal scores:   ${listed([...legal].sort((a, b) => b.s - a.s))}`);
  say(`  lowest searcher scores: ${listed([...cheats].sort((a, b) => a.s - b.s))}`);
  if (!Number.isFinite(t)) {
    say(`No score meets the budget, so no threshold can be stored (JSON has no ${t}).`);
    return;
  }
  const held = settings.threshold;
  if (Object.is(held, t)) { say(`detect/settings.json already holds threshold ${t}.`); return; }
  if (!write) { say(`detect/settings.json holds threshold ${JSON.stringify(held)}. Run node lab.mjs tune ${dir} --write to store ${t}.`); return; }
  const file = join(p, 'detect/settings.json');
  const fresh = JSON.parse(readFileSync(file, 'utf8')); // re-read, so only threshold changes
  fresh.threshold = t;
  writeFileSync(file, JSON.stringify(fresh, null, 2) + '\n');
  say(`Stored threshold ${t} in detect/settings.json (it held ${JSON.stringify(held)}); its other fields are unchanged.`);
  const freeze = records(p).filter((x) => x.kind === 'freeze').at(-1);
  const now = hashes(p);
  if (freeze && FROZEN.some((f) => now[f] !== freeze.files?.[f])) say(`This differs from what you froze at ${freeze.at}, so heldout refuses until you freeze again (node lab.mjs freeze ${dir}).`);
}

// ------------------------------------------------------------------ freeze

async function freeze({ plain }) {
  const dir = plain[0];
  const p = project(dir);
  for (const f of FROZEN) if (!existsSync(join(p, f))) throw Error(`${f} is missing from your project: nothing frozen`);
  const call = caller(p);
  const d = await detector(p, [['detect/detector.mjs', 'chooseThreshold']]);
  const { settings } = d;
  if (settings.budget !== BUDGET) throw Error(`detect/settings.json holds budget ${JSON.stringify(settings.budget)}; the course's budget is 0.002 (API.md). Nothing frozen.`);
  if (!finiteThreshold(settings)) throw Error(`detect/settings.json holds threshold ${JSON.stringify(settings.threshold)}, not a finite number. Run node lab.mjs tune ${dir} --write first. Nothing frozen.`);
  const now = hashes(p);
  const all = records(p);
  const last = all.filter((r) => r.kind === 'freeze').at(-1);
  if (last && FROZEN.every((f) => last.files?.[f] === now[f])) {
    say(`Already frozen at ${last.at} with these exact files (${shown(join(p, 'attempts', last.folder))}). Nothing new recorded.`);
    return;
  }
  // The dev split first: a freeze that fails the budget there would waste your first held-out look.
  const dev = scored(makeCorpus({ split: 'dev' }), d, settings, call);
  const legal = dev.filter((x) => x.c.label === 'legal');
  const flagged = legal.filter((x) => x.s >= settings.threshold).length;
  const allowed = BUDGET * legal.length;
  const cheats = dev.filter((x) => x.c.label === 'cheat');
  const caught = cheats.filter((x) => x.s >= settings.threshold).length;
  if (flagged > allowed) throw Error(`At your threshold ${settings.threshold}, your score flags ${flagged} of the ${legal.length} dev legal sessions; the budget allows ${allowed}. Run node lab.mjs tune ${dir} --write, then freeze. Nothing frozen.`);
  let chosen;
  try { chosen = d.chooseThreshold(legal.map((x) => x.s), BUDGET); } catch (e) { chosen = `an error (${String(e?.message ?? e).split('\n')[0]})`; }
  say(`On the dev split, at your threshold ${settings.threshold}: ${flagged} of ${legal.length} legal sessions flagged (the budget allows ${allowed}); ${caught} of ${cheats.length} searcher sessions flagged.`);
  if (!Object.is(chosen, settings.threshold)) say(`Note: your chooseThreshold gives ${chosen} on these scores, not ${settings.threshold}. The checks accept any threshold within the budget on dev; node lab.mjs tune ${dir} --write stores chooseThreshold's.`);
  const seen = all.filter((r) => r.kind === 'heldout');
  const at = new Date().toISOString();
  const folder = save(p, 'freeze', {
    kind: 'freeze', course: COURSE, files: now, afterHeldout: seen.length > 0,
    dev: { threshold: settings.threshold, budget: BUDGET, legal: legal.length, falseFlags: flagged, cheats: cheats.length, flaggedCheats: caught },
    at,
  }, FROZEN);
  say(`Froze your detector at ${at}:`);
  for (const f of FROZEN) say(`  ${pad(f, 22)} sha256 ${now[f]}`);
  say(`Saved in ${shown(join(p, folder))} (freeze.json, with a copy of the three files).`);
  if (seen.length) say(`You have already seen a held-out result (first at ${seen[0].at}). This freeze comes after it, so every later held-out result is saved as a later run.`);
  say(`Next: node lab.mjs heldout ${dir}. If any of these files changes, heldout refuses until you freeze again.`);
}

// ------------------------------------------------------------------ restore-frozen

// Why a file could not be read or written (verb), in words, and what to do about it.
const denied = (error) => error.code === 'EACCES' || error.code === 'EPERM';
function reason(error, verb) {
  if (denied(error)) return `this user may not ${verb} it`;
  if (error.code === 'EISDIR') return 'it is a folder, not a file';
  if (error.code === 'ENOTDIR') return 'a file stands where one of its folders should be';
  if (error.code === 'ENOSPC') return 'the disk is full';
  return error.code ?? String(error.message).split('\n')[0];
}
function remedy(error, verb) {
  if (denied(error)) return verb === 'read' ? 'make it readable (check who owns it)' : 'delete it or make it writable (check who owns it)';
  if (error.code === 'EISDIR') return 'move that folder out of the way';
  if (error.code === 'ENOSPC') return 'free some space';
  return 'fix that';
}

// Puts back the three files as the latest freeze copied them, byte for byte, so that they
// hash as frozen again. The files it replaces are kept first, in a folder of their own; the
// record that says they were put back is written only once every file is in place.
async function restoreFrozen({ plain }) {
  const dir = plain[0];
  const p = project(dir);
  const freeze = records(p).filter((r) => r.kind === 'freeze').at(-1);
  if (!freeze) throw Error(`No freeze yet, so there is nothing to restore: node lab.mjs freeze ${dir} records one.`);
  const folder = join(p, 'attempts', freeze.folder);
  const damaged = FROZEN.filter((f) => !existsSync(join(folder, f)) || sha256(join(folder, f)) !== freeze.files?.[f]);
  if (damaged.length) throw Error(`The copy of ${damaged.join(' and ')} in ${shown(folder)} does not match the hash recorded at ${freeze.at}, so nothing was restored.`);
  const again = `then run node lab.mjs restore-frozen ${dir} again`;
  const now = {};
  for (const f of FROZEN) {
    try { now[f] = existsSync(join(p, f)) ? sha256(join(p, f)) : null; } catch (e) { throw Error(`Nothing was restored, because ${f} could not be read (${reason(e, 'read')}): ${remedy(e, 'read')}, ${again}.`); }
  }
  const changed = FROZEN.filter((f) => now[f] !== freeze.files[f]);
  if (!changed.length) { say(`Your detector files are already the ones you froze at ${freeze.at}. Nothing changed.`); return; }
  const present = changed.filter((f) => now[f] !== null);
  const at = new Date().toISOString();
  let kept;
  try {
    kept = newFolder(p, 'restore', at);
    for (const f of present) copyBytes(join(p, f), join(p, kept, f));
  } catch (e) {
    const where = shown(join(p, kept ?? 'attempts'));
    throw Error(`Nothing was restored, because the files it would replace could not be kept in ${where} (${denied(e) ? `this user may not write there` : reason(e, 'write')}): ${denied(e) ? `check who owns ${shown(join(p, 'attempts'))}` : remedy(e, 'write')}, ${again}.`);
  }
  const done = [];
  for (const f of changed) {
    try { copyBytes(join(folder, f), join(p, f)); } catch (e) {
      throw Error(`${f} was not restored, because ${reason(e, 'write')}: ${remedy(e, 'write')}, ${again}${done.length ? ` (${done.join(' and ')} ${done.length > 1 ? 'are' : 'is'} already put back)` : ''}; ${present.length ? `the files it would replace are kept in ${shown(join(p, kept))}` : 'no file of yours was replaced'}.`);
    }
    done.push(f);
  }
  try {
    writeRecord(p, kept, 'restore', { kind: 'restore', course: COURSE, frozenAt: freeze.at, from: freeze.folder, restored: changed, replaced: present, at });
  } catch (e) {
    throw Error(`${changed.join(', ')} ${changed.length > 1 ? 'are' : 'is'} put back from your freeze at ${freeze.at}, but the record of it could not be saved in ${shown(join(p, kept))} (${denied(e) ? 'this user may not write there' : reason(e, 'write')}), so status will not list this restore.`);
  }
  say(`Restored ${changed.join(', ')} from your freeze at ${freeze.at} (${shown(folder)}).`);
  if (present.length) say(`The files it replaced are kept in ${shown(join(p, kept))}.`);
  say(`Your detector files are now the ones you froze. The line above the scoreboard's table confirms it: node lab.mjs scoreboard ${dir}`);
}

// ------------------------------------------------------------------ heldout

async function heldout({ plain }) {
  const dir = plain[0];
  const p = project(dir);
  const { freeze, runs } = requireFrozen(p, dir, 'heldout');
  const call = caller(p);
  const d = await detector(p);
  const { settings } = d;
  const cases = scored(makeCorpus({ split: 'heldout' }), d, settings, call);
  const r = count(cases.map((x) => ({ label: x.c.label, flagged: x.s >= settings.threshold })));
  const legal = r.fp + r.tn, cheats = r.tp + r.fn;
  const at100 = precisionAt(0.01, r.recall, r.falsePositiveRate);

  // Your own evaluate (given the whole cases: it needs their labels) and precisionAt, compared
  // with the lab's counting of your scores of each session's play.
  let yours;
  try {
    const evaluate = await d.loader.fn('detect/detector.mjs', 'evaluate');
    const mine = await d.loader.fn('detect/detector.mjs', 'precisionAt');
    const e = evaluate(cases.map((x) => x.c), settings);
    const differs = COUNT_FIELDS.find((k) => !(e?.[k] === r[k] || (typeof e?.[k] === 'number' && typeof r[k] === 'number' && Math.abs(e[k] - r[k]) <= 1e-12)));
    const q = mine(0.01, r.recall, r.falsePositiveRate);
    const qOk = q === at100 || (typeof q === 'number' && typeof at100 === 'number' && Math.abs(q - at100) <= 1e-12);
    yours = differs ? `your evaluate differs in ${differs}: ${JSON.stringify(e?.[differs])}, the lab's count ${JSON.stringify(r[differs])}, made from each session's record.inputs and rounds alone; if your features read more of the case, such as its label, that is the difference (check 14.heldout)`
      : !qOk ? `your evaluate agrees; your precisionAt gives ${JSON.stringify(q)}, the formula ${JSON.stringify(at100)} (check 14.counting)`
        : 'your evaluate and precisionAt agree';
  } catch (e) {
    yours = `your evaluate or precisionAt did not run: ${String(e?.message ?? e).split('\n')[0]}`;
  }

  const first = runs.length === 0;
  const folder = save(p, 'heldout', {
    kind: 'heldout', course: COURSE, run: runs.length + 1, first,
    frozenAt: freeze.at, files: freeze.files,
    sessions: cases.length, legal, cheats, threshold: settings.threshold,
    result: r, precisionAt1in100: at100, yourFunctions: yours,
    at: new Date().toISOString(),
  });
  say(`The held-out split: ${cases.length} sessions (${legal} legal, ${cheats} searcher), your detector as frozen at ${freeze.at}, threshold ${settings.threshold}.`);
  say(`  tp ${r.tp}  fn ${r.fn}  fp ${r.fp}  tn ${r.tn}  (counted per session by the lab from your scores; ${yours})`);
  say(`  searcher recall       ${f3(r.recall)} (${r.tp} of ${cheats} flagged)`);
  say(`  false flags           ${r.fp} of ${legal.toLocaleString('en-US')} legal sessions (false positive rate ${r.falsePositiveRate === null ? '-' : r.falsePositiveRate.toFixed(4)})`);
  say(`  precision at 1 in 100 ${f3(at100)}${at100 === null ? '' : ` (with cheaters at 1 session in 100, ${(100 * at100).toFixed(1)}% of the flagged sessions would be cheats)`}`);
  if (first) {
    say(`This is your first held-out result. It stays first in your receipt: ${shown(join(p, folder, 'heldout.json'))}`);
  } else {
    const one = runs[0];
    say(`This is held-out run ${runs.length + 1}, saved after your first in ${shown(join(p, folder, 'heldout.json'))}, marked as a later run.`);
    say(`Your first result, from ${one.at}, stays first: tp ${one.result.tp}  fn ${one.result.fn}  fp ${one.result.fp}  tn ${one.result.tn}, precision at 1 in 100 ${f3(one.precisionAt1in100)}.`);
  }
}

// ------------------------------------------------------------------ recordings

async function recordings({ plain }) {
  const dir = plain[0];
  const p = project(dir);
  const call = caller(p);
  const d = await detector(p, [['detect/detector.mjs', 'chooseThreshold']]);
  const { settings } = d;
  let threshold = settings.threshold;
  let source = `detect/settings.json, threshold ${threshold}`;
  if (!finiteThreshold(settings)) {
    // No threshold stored yet, as while you design your score: use the one tune would choose
    // for your current score on the dev split. Nothing is written, and held-out is not read.
    const budget = settings.budget;
    if (typeof budget !== 'number' || !(budget >= 0 && budget <= 1)) throw Error(`detect/settings.json holds threshold ${JSON.stringify(settings.threshold)} and budget ${JSON.stringify(budget)}; add "budget": 0.002 so that recordings can choose a threshold on the dev split as tune does.`);
    const legal = scored(makeCorpus({ split: 'dev' }).filter((c) => c.label === 'legal'), d, settings, call);
    threshold = call('your chooseThreshold threw on the dev legal scores', () => d.chooseThreshold(legal.map((x) => x.s), budget));
    if (typeof threshold !== 'number' || Number.isNaN(threshold)) throw Error(`chooseThreshold returned ${JSON.stringify(threshold)} on the dev legal scores, not a number`);
    source = `no threshold stored yet, so the one tune would choose for your current score on the dev split: ${threshold}; nothing written`;
  }
  say(`Your detector (${source}) on the recorded adapted searchers in recordings/.`);
  say('Every recorded session is a cheat, so recall is the share flagged; there are no legal sessions to flag falsely.');
  say(`  ${pad('set', 13)} ${lpad('sessions', 8)} ${lpad('hit rate', 18)} ${lpad('flagged', 8)} ${lpad('missed', 7)} ${lpad('recall', 7)}`);
  for (const name of RECORDINGS) {
    const cases = JSON.parse(readFileSync(join(root, 'recordings', `${name}.json`), 'utf8'));
    let shots = 0, hits = 0;
    for (const c of cases) for (const r of c.rounds) if (r.shot) { shots++; if (r.result === 'hit') hits++; }
    const r = count(scored(cases, d, settings, call).map((x) => ({ label: x.c.label, flagged: x.s >= threshold })));
    say(`  ${pad(name, 13)} ${lpad(cases.length, 8)} ${lpad(`${pct(hits, shots)} (${hits}/${shots})`, 18)} ${lpad(r.tp, 8)} ${lpad(r.fn, 7)} ${lpad(f3(r.recall), 7)}`);
  }
}

export const commands = [
  { name: 'features', args: 'PROJECT [--split dev|heldout]', about: 'your features by kind, with robust scales (held-out only after your first held-out result)', run: features },
  { name: 'tune', args: 'PROJECT [--write]', about: 'your score and chooseThreshold on the dev split; --write stores the threshold', run: tune },
  { name: 'freeze', args: 'PROJECT', about: 'record the sha256 of your detector\'s three files before the held-out split', run: freeze },
  { name: 'restore-frozen', args: 'PROJECT', about: 'put back your detector\'s three files as your latest freeze copied them (the replaced files are kept)', run: restoreFrozen },
  { name: 'heldout', args: 'PROJECT', about: 'your frozen detector on the held-out split; the first result is kept', run: heldout },
  { name: 'recordings', args: 'PROJECT', about: 'your detector on the recorded adapted searchers (with no threshold stored, at the one tune would choose on dev)', run: recordings },
];
