// Unit 17's scoreboard: the course's clients against a whole defence, counted. Both
// `node lab.mjs scoreboard` (labcmds/17.mjs) and the unit 17 checks (checks/17.mjs)
// measure through this file, with different seeds, so a number the lab prints and the
// number a check judges mean the same thing.
//
// Lob. Every session is a new server, public/runtime.mjs's createLobServer, with your
// admission (server/admission.mjs), your view (server/view.mjs) and your recorder
// (server/recorder.mjs), and one client that joins it, played by public/sim.mjs over two
// seeded links (public/net.mjs). The seeding is public/corpus.mjs's: for server seed
// `seed` the client is seeded mixSeed(seed, 2), the link up mixSeed(seed, 3) and the link
// down mixSeed(seed, 4), and every client plays on its own kind of network. Your
// features get each session as { record: { inputs }, rounds }: the inputs your recorder
// wrote and the rounds the server played, and nothing else (no id, label, kind or seed),
// as API.md says. A session is flagged when your score reaches detect/settings.json's
// threshold.
//
// Every message the server receives is also judged by API.md's rules at the moment it
// is decided, from the session's facts and the newest seq the server has admitted, so
// that a refusal the rules require can be told from one they do not:
//   - a message that is not exactly { v: 1, seq, angle, power, fire }, each value in
//     its range (public/rules.mjs), is refused;
//   - an input whose seq is not above the newest seq admitted is stale: replayed, or
//     overtaken on the network by a newer one;
//   - nothing is admitted while the shell is in the air, and a round has at most one fire.
// A cheating input is one these rules refuse. A legal player's input may be refused only
// as stale.
//
// Courier. public/courier.mjs's runCourier at your rewindWindow, with your
// judgeInteract, measureRtt and positionAt, counted by unit 15's rules.
//
// Trades. A short script of trades on public/store.mjs's store, crashed after each of
// its writes; the server restarts and runs your recover (also crashed after each of its
// own writes and run again), then the client sends its interrupted request again, then
// the rest of the script. Every item must stay in exactly one inventory and the coins
// must add up to what they did.
import { Buffer } from 'node:buffer';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { show, NOT_WRITTEN } from './harness.mjs';
import { createLobServer } from '../public/runtime.mjs';
import { playSession } from '../public/sim.mjs';
import { link } from '../public/net.mjs';
import { fullView } from '../public/full-view.mjs';
import { makePlayer, PLAYER_KINDS } from '../public/players.mjs';
import { hitClaim, fireTwice, outOfRange, replay, searcher } from '../public/adversaries.mjs';
import { runCourier } from '../public/courier.mjs';
import { createStore, Crash } from '../public/store.mjs';
import { mixSeed } from '../public/stats.mjs';
import { INPUT_MAX_BYTES, ANGLE, POWER, SEQ } from '../public/rules.mjs';

// ---------------------------------------------------------------- the budgets (API.md, unit 17)

export const BUDGET = Object.freeze({
  // At most 1 legal session in 125 flagged: 12 of the check's 1,500. The threshold aims at
  // 1 in 500 on 1,000 dev legal sessions; fitted exactly that way it flags more than 12 of
  // 1,500 fresh ones about once in 100, by chance (BetaBinomial(1500, 2, 999)).
  legalFlagsOneIn: 125,
  expertHitRate: 0.18,   // expert players hit at least 18% of their shots
  searcherHitRate: 0.75, // the searching client, live against your view, hits at most 75%
  searcherFlagged: 0.9,  // and at least 90% of its sessions are flagged
  honestRefused: 0.01,   // courier: honest presses refused although in range at seen, at most 1%
  naiveAccepted: 0.01,   // courier: the naive faker's presses accepted while not in range now, at most 1%
});

// The lesson to revisit for each part of the defence.
export const LESSON = Object.freeze({
  admission: 'lesson 12 (your admission)',
  view: 'lesson 13 (your view)',
  detector: 'lesson 14 (your detector and its threshold)',
  window: 'lesson 15 (your judge and your window)',
  trade: 'lesson 16 (your trade and recover)',
});

export const FILES = Object.freeze({
  admission: 'server/admission.mjs',
  recorder: 'server/recorder.mjs',
  view: 'server/view.mjs',
  features: 'detect/features.mjs',
  detector: 'detect/detector.mjs',
  settings: 'detect/settings.json',
  rewind: 'courier/rewind.mjs',
  trade: 'trade/trade.mjs',
  defence: 'capstone/defence.json',
});

// ---------------------------------------------------------------- the Lob rows

export const LEGAL = Object.keys(PLAYER_KINDS);
export const CHEATS = ['hitClaim', 'fireTwice', 'outOfRange', 'replay'];
const CHEAT_CLIENTS = { hitClaim, fireTwice, outOfRange, replay };

// In this order; a row's place in the list is its r in the seeds.
export const ROWS = Object.freeze([
  ...LEGAL.map((kind) => ({ id: kind, label: kind, prose: kind, group: 'legal', make: (seed) => makePlayer(kind, seed), call: (s) => `makePlayer('${kind}', ${s})` })),
  ...CHEATS.map((id) => ({ id, label: id, prose: id, group: 'protocol', make: CHEAT_CLIENTS[id], call: (s) => `${id}(${s})` })),
  { id: 'searcher', label: 'searcher, your view', prose: 'searching client\'s', group: 'searcher', make: (seed) => searcher(seed, { perceive: 'auto' }), call: (s) => `searcher(${s}, { perceive: 'auto' })` },
  { id: 'searcherFull', label: 'searcher, full view', prose: 'searching client\'s full-view', group: 'contrast', fullView: true, make: (seed) => searcher(seed, { perceive: 'auto' }), call: (s) => `searcher(${s}, { perceive: 'auto' })` },
]);
export const MAX_SESSIONS = 100_000;
export const rowOf = (id) => {
  const row = ROWS.find((r) => r.id === id);
  if (!row) throw Error(`no scoreboard row ${id}`);
  return row;
};
// Session n (0, 1, 2, ...) of a row: server seed base + 100,000 * r + n.
export const lobSeed = (base, id, n) => base + 100_000 * ROWS.indexOf(rowOf(id)) + n;

const grouped = (n) => Number(n).toLocaleString('en-US');

// How to play one session again: the call, and what it does.
export function sessionText(id, seed) {
  const row = rowOf(id);
  return `the ${row.prose} session with server seed ${seed} (checks/scoreboard.mjs playLobSession({ row: '${id}', seed: ${seed} }): createLobServer({ seed: ${seed}, admission: yours, view: ${row.fullView ? 'fullView' : 'yours'}, recorder: yours }) against ${row.call(`mixSeed(${seed}, 2)`)}, on the client's own network, links seeded mixSeed(${seed}, 3) up and mixSeed(${seed}, 4) down)`;
}

// ---------------------------------------------------------------- your functions

// An error thrown by one of your functions, with what it was given.
export class LearnerError extends Error {
  constructor({ fn, file, error, call }) {
    super(`your ${fn} in ${file} threw ${error?.name ?? 'Error'}: ${firstLine(error)}`);
    this.name = 'LearnerError';
    this.fn = fn;
    this.file = file;
    this.error = error;
    this.call = call;
    this.notWritten = firstLine(error).includes(NOT_WRITTEN);
  }
}

// An error that stopped a session somewhere else (the server, a client reading your
// view's message), with the session it stopped.
export class SessionError extends Error {
  constructor(error, session) {
    super(firstLine(error));
    this.name = 'SessionError';
    this.error = error;
    this.session = session;
  }
}

export function firstLine(error) {
  return String(error?.message ?? error).split('\n')[0];
}

// "server/view.mjs line 12" for the first stack line inside the folder, or null.
export function whereIn(error, folder) {
  if (!folder) return null;
  const roots = new Set([folder, pathToFileURL(folder).href]);
  try { const real = realpathSync(folder); roots.add(real); roots.add(pathToFileURL(real).href); } catch { /* keep the given path */ }
  for (const line of String(error?.stack ?? '').split('\n')) {
    for (const root of roots) {
      const i = line.indexOf(root);
      if (i < 0) continue;
      const m = line.slice(i + root.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return `${decodeURIComponent(m[1])} line ${m[2]}`;
    }
  }
  return null;
}
const course = new URL('..', import.meta.url).pathname;
// The first stack line in the course's own files ("public/client.mjs line 80"), or null.
export const whereInCourse = (error) => whereIn(error, course);

// Wraps one of your functions: an error it throws becomes a LearnerError naming it and
// what it was given. Errors that pass (a store Crash) go through unchanged.
export function guarded(fn, file, f, describe = null, passes = () => false) {
  return (...args) => {
    try {
      return f(...args);
    } catch (error) {
      if (error instanceof LearnerError || passes(error)) throw error;
      let call = null;
      try { call = describe ? describe(...args) : null; } catch { /* keep null */ }
      throw new LearnerError({ fn, file, error, call });
    }
  };
}

// Loads your functions through a loader with fn(file, name) and json(file): checks/harness.mjs's
// makeLoader, or a check's env. Each part loads only its own files.
export async function loadLob(loader, { detector = true } = {}) {
  const parseInput = await loader.fn(FILES.admission, 'parseInput');
  const admit = await loader.fn(FILES.admission, 'admit');
  const drawnView = await loader.fn(FILES.view, 'drawnView');
  const createRecorder = await loader.fn(FILES.recorder, 'createRecorder');
  const lob = {
    admission: {
      parseInput: guarded('parseInput', FILES.admission, parseInput, (text) => `parseInput(${show(text, 220)})`),
      admit: guarded('admit', FILES.admission, admit, (state, input, facts) => `admit(${show(state)}, ${show(input)}, ${show(facts)})`),
    },
    view: guarded('drawnView', FILES.view, drawnView, (game, info) => `drawnView(game, ${show(info)}) after tick ${info?.tick}`),
    createRecorder: recorderOf(createRecorder),
  };
  if (detector) {
    const settings = loader.json(FILES.settings);
    lob.settings = settings;
    lob.settingsProblem = settingsProblem(settings);
    lob.features = guarded('features', FILES.features, await loader.fn(FILES.features, 'features'), () => 'features({ record: { inputs }, rounds })');
    lob.score = guarded('score', FILES.detector, await loader.fn(FILES.detector, 'score'), (f) => `score(${show(f, 400)}, settings)`);
  }
  return lob;
}

function recorderOf(createRecorder) {
  const make = guarded('createRecorder', FILES.recorder, createRecorder, (options) => `createRecorder(${show(options)})`);
  return (options) => {
    const recorder = make(options);
    return {
      admitted: guarded('createRecorder', FILES.recorder, (tick, input) => recorder.admitted(tick, input), (tick, input) => `the recorder's admitted(${tick}, ${show(input)})`),
      finish: guarded('createRecorder', FILES.recorder, (end, final) => recorder.finish(end, final), (end, final) => `the recorder's finish(${end}, ${show(final)})`),
    };
  };
}

export function settingsProblem(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return `${FILES.settings} holds ${show(settings, 80)}, not a JSON object with your score's settings and "threshold"`;
  if (typeof settings.threshold !== 'number' || !Number.isFinite(settings.threshold)) return `${FILES.settings} holds threshold ${show(settings.threshold)}, not a finite number: lesson 14 has you store the threshold chooseThreshold gives on the dev split (node lab.mjs tune PROJECT --write) and freeze it`;
  return null;
}

export async function loadRewind(loader) {
  const out = {};
  for (const name of ['positionAt', 'measureRtt', 'judgeInteract']) out[name] = await loader.fn(FILES.rewind, name);
  return {
    positionAt: guarded('positionAt', FILES.rewind, out.positionAt, (history, tick) => `positionAt(history, ${show(tick)})`),
    measureRtt: guarded('measureRtt', FILES.rewind, out.measureRtt, (samples) => `measureRtt(${show(samples, 200)})`),
    judgeInteract: guarded('judgeInteract', FILES.rewind, out.judgeInteract, (a) => `judgeInteract({ seen: ${a?.seen}, now: ${a?.now}, window: ${a?.window}, rtt: ${a?.rtt}, readyAt: ${a?.readyAt}, target: ${show(a?.target)}, range: ${a?.range}, history, positionAt })`),
  };
}

// The window in capstone/defence.json, or a problem saying what is wrong with the file.
export function windowOf(defence) {
  if (!defence || typeof defence !== 'object' || Array.isArray(defence)) return { problem: `${FILES.defence} holds ${show(defence, 80)}, not a JSON object like { "rewindWindow": <ticks> }` };
  const w = defence.rewindWindow;
  if (!Number.isSafeInteger(w) || w < 0) return { problem: `${FILES.defence} holds rewindWindow ${show(w)}, not a whole number of ticks, 0 or more (the window you chose in lesson 15)` };
  return { window: w };
}

export async function loadTrade(loader) {
  const trade = await loader.fn(FILES.trade, 'trade');
  const recover = await loader.fn(FILES.trade, 'recover');
  const passes = (e) => e instanceof Crash;
  return {
    trade: guarded('trade', FILES.trade, trade, (store, request) => `trade(store, ${show(request)})`, passes),
    recover: guarded('recover', FILES.trade, recover, () => 'recover(store)', passes),
  };
}

// ---------------------------------------------------------------- API.md's rules for one message

const FIVE = ['v', 'seq', 'angle', 'power', 'fire'];

// { input } for a well-formed input, or { kind, fault }: what is wrong, in words.
function readInput(text) {
  if (typeof text !== 'string') return { kind: 'shape', fault: 'it is not text' };
  if (Buffer.byteLength(text, 'utf8') > INPUT_MAX_BYTES) return { kind: 'shape', fault: `it is longer than ${INPUT_MAX_BYTES} bytes` };
  let value;
  try { value = JSON.parse(text); } catch { return { kind: 'shape', fault: 'it is not JSON' }; }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { kind: 'shape', fault: 'it is not a JSON object' };
  const keys = Object.keys(value);
  const extra = keys.filter((k) => !FIVE.includes(k));
  if (extra.length) return { kind: 'shape', fault: `it has a field an input does not have: ${extra.join(', ')}` };
  const missing = FIVE.filter((k) => !keys.includes(k));
  if (missing.length) return { kind: 'shape', fault: `it has no ${missing.join(' or ')}` };
  if (value.v !== 1) return { kind: 'shape', fault: `its v is ${show(value.v)}, not 1` };
  for (const [name, { min, max }] of [['seq', SEQ], ['angle', ANGLE], ['power', POWER]]) {
    const x = value[name];
    if (!Number.isSafeInteger(x) || x < min || x > max) return { kind: 'range', fault: `its ${name} ${show(x)} is not a whole number from ${grouped(min)} to ${grouped(max)}` };
  }
  if (typeof value.fire !== 'boolean') return { kind: 'range', fault: `its fire ${show(value.fire)} is not true or false` };
  return { input: { v: 1, seq: value.seq, angle: value.angle, power: value.power, fire: value.fire } };
}

// What the rules say about a message arriving now: why it must be refused, or null.
function judgeText(text, facts, newest) {
  const at = { tick: facts.tick, round: facts.round, flying: facts.flying, fired: facts.fired, newest };
  const { input, kind, fault } = readInput(text);
  if (!input) return { ...at, kind, why: fault };
  if (input.seq <= newest) return { ...at, input, kind: 'stale', why: `its seq ${input.seq} is not above ${newest}, the newest seq the server had admitted` };
  if (facts.flying) return { ...at, input, kind: 'flying', why: 'the shell was in the air' };
  if (input.fire && facts.fired) return { ...at, input, kind: 'fired', why: `round ${facts.round} had already had its shot` };
  return { ...at, input, kind: null, why: null };
}

// Why the rules admit a message, in words.
const admitWhy = (j) => `${j.newest ? `its seq ${j.input.seq} is above ${j.newest}, the newest seq admitted` : `its seq ${j.input.seq} is the session's first admitted`}, the shell was not in the air${j.input.fire ? `, and round ${j.round} had no shot yet` : ''}`;

// What your admission answered for one message.
// The server (public/runtime.mjs) applies an input when parseInput's answer has a truthy
// ok and admit's answer has status 'admitted'; anything else is a refusal.
function answerText(event) {
  const { parsed, decision } = event;
  if (!parsed || typeof parsed !== 'object') return `your parseInput returned ${show(parsed, 120)}, so the server refused it`;
  if (!parsed.ok) return parsed.ok === false ? `your parseInput refused it (reason ${show(parsed.reason)})` : `your parseInput returned ${show(parsed, 120)}, so the server refused it`;
  if (decision && decision.status === 'admitted') return 'your admission admitted it';
  if (!decision || typeof decision !== 'object') return `your parseInput accepted it and your admit returned ${show(decision, 120)}, so the server refused it`;
  return `your admit refused it (reason ${show(decision.reason)})`;
}
const appliedBy = (event) => !!(event.parsed && event.parsed.ok) && !!event.decision && event.decision.status === 'admitted';

// ---------------------------------------------------------------- one Lob session

// Plays one session of a row with your files (from loadLob) and counts what happened.
export function playLobSession({ row: id, seed, lob, detect = true }) {
  const row = rowOf(id);
  const out = {
    row: id, seed, gameSeed: null, shots: 0, hits: 0,
    texts: 0, refused: 0, stale: 0, cheating: 0, cheatingRefused: 0, refusedOther: 0, refusedAdmissible: 0,
    firstStale: null, firstRefusal: null, firstCheatAdmitted: null, faults: {},
    score: null, flagged: false,
  };
  let server = null;
  let pending = null;
  let newest = 0;
  const admission = {
    parseInput(text) {
      pending = judgeText(text, server.sessions[0].session.facts(), newest);
      return lob.admission.parseInput(text);
    },
    admit: (state, input, facts) => lob.admission.admit(state, input, facts),
  };
  const onEvent = (event) => {
    const j = pending;
    pending = null;
    const admitted = appliedBy(event);
    out.texts += 1;
    if (admitted) {
      const s = event.parsed.input?.seq;
      if (Number.isSafeInteger(s) && s > newest) newest = s;
    } else out.refused += 1;
    const seen = () => ({ tick: j.tick, text: event.text, answer: answerText(event), rule: j.why ? 'refuse' : 'admit', kind: j.kind, why: j.why ?? admitWhy(j) });
    if (j.why) {
      out.cheating += 1;
      out.faults[j.kind] = (out.faults[j.kind] ?? 0) + 1;
      if (!admitted) {
        out.cheatingRefused += 1;
        if (j.kind === 'stale') { out.stale += 1; out.firstStale ??= seen(); } else { out.refusedOther += 1; out.firstRefusal ??= seen(); }
      } else out.firstCheatAdmitted ??= seen();
    } else if (!admitted) {
      out.refusedAdmissible += 1;
      out.firstRefusal ??= seen();
    }
  };
  try {
    server = createLobServer({ seed, admission, view: row.fullView ? fullView : lob.view, recorder: lob.createRecorder, onEvent });
    const client = row.make(mixSeed(seed, 2));
    const net = client.network;
    const result = playSession({ server, client, up: link({ seed: mixSeed(seed, 3), ...net }), down: link({ seed: mixSeed(seed, 4), ...net }) });
    out.gameSeed = server.sessions[0].seed;
    for (const r of result.outcomes) if (r.shot) { out.shots += 1; if (r.result === 'hit') out.hits += 1; }
    if (detect) {
      const f = lob.features({ record: { inputs: result.record?.inputs }, rounds: result.outcomes });
      out.score = lob.score(f, lob.settings);
      out.flagged = typeof out.score === 'number' && out.score >= lob.settings.threshold;
    }
  } catch (error) {
    if (error instanceof LearnerError) { error.session ??= { row: id, seed }; throw error; }
    throw new SessionError(error, { row: id, seed });
  }
  return out;
}

// Plays sessions 0 .. sessions-1 of a row and adds them up.
export function playLobRow({ row: id, base, sessions, lob, detect = true }) {
  const t = {
    row: id, label: rowOf(id).label, group: rowOf(id).group, sessions: 0, shots: 0, hits: 0,
    flagged: 0, flaggedSessions: [], scored: 0, unscored: 0, firstUnscored: null,
    texts: 0, refused: 0, stale: 0, staleSessions: [], cheating: 0, cheatingRefused: 0, refusedOther: 0, refusedAdmissible: 0,
    refusedNotStaleSessions: 0, firstRefusedNotStale: null, cheatSessionsBroken: 0, firstCheatAdmitted: null, faults: {},
  };
  for (let n = 0; n < sessions; n += 1) {
    const seed = lobSeed(base, id, n);
    const s = playLobSession({ row: id, seed, lob, detect });
    t.sessions += 1;
    t.shots += s.shots;
    t.hits += s.hits;
    if (s.flagged) { t.flagged += 1; t.flaggedSessions.push({ seed, score: s.score }); }
    if (detect) {
      if (typeof s.score === 'number' && Number.isFinite(s.score)) t.scored += 1;
      else { t.unscored += 1; t.firstUnscored ??= { seed, score: s.score }; }
    }
    for (const k of ['texts', 'refused', 'stale', 'cheating', 'cheatingRefused', 'refusedOther', 'refusedAdmissible']) t[k] += s[k];
    for (const [k, v] of Object.entries(s.faults)) t.faults[k] = (t.faults[k] ?? 0) + v;
    if (s.stale) t.staleSessions.push({ seed, count: s.stale, first: s.firstStale });
    if (s.refusedOther + s.refusedAdmissible) { t.refusedNotStaleSessions += 1; t.firstRefusedNotStale ??= { seed, ...s.firstRefusal }; }
    if (s.firstCheatAdmitted) { t.cheatSessionsBroken += 1; t.firstCheatAdmitted ??= { seed, ...s.firstCheatAdmitted }; }
  }
  return t;
}

export const hitRate = (t) => (t.shots ? t.hits / t.shots : null);
export const percent = (x, digits = 1) => (x === null || x === undefined ? '-' : `${(100 * x).toFixed(digits)}%`);
export const hitText = (t) => `${percent(hitRate(t))} (${grouped(t.hits)}/${grouped(t.shots)})`;

// ---------------------------------------------------------------- the Lob budgets

// Each protocol cheat: every input the rules refuse, refused, in every session.
export function protocolVerdict(rows) {
  const cheats = rows.filter((t) => t.group === 'protocol');
  const broken = cheats.find((t) => t.firstCheatAdmitted);
  return {
    pass: !broken,
    cheats: cheats.map((t) => ({ row: t.row, cheating: t.cheating, refused: t.cheatingRefused, sessions: t.sessions, broken: t.cheatSessionsBroken, first: t.firstCheatAdmitted, faults: t.faults, refusedAdmissible: t.refusedAdmissible })),
    first: broken ? { row: broken.row, ...broken.firstCheatAdmitted } : null,
  };
}

// Legal players: no input refused except as stale; at most 1 session in 125 flagged; experts hit at least 18%.
export function legalVerdict(rows) {
  const legal = rows.filter((t) => t.group === 'legal');
  const sessions = legal.reduce((s, t) => s + t.sessions, 0);
  const bad = legal.reduce((s, t) => s + t.refusedNotStaleSessions, 0);
  const firstBad = legal.find((t) => t.firstRefusedNotStale);
  const flagged = legal.reduce((s, t) => s + t.flagged, 0);
  const expert = legal.find((t) => t.row === 'expert');
  const rate = expert ? hitRate(expert) : null;
  const stale = legal.reduce((s, t) => s + t.stale, 0);
  return {
    sessions,
    refusals: { pass: bad === 0, sessions: bad, first: firstBad ? { row: firstBad.row, ...firstBad.firstRefusedNotStale } : null, stale, staleSessions: legal.flatMap((t) => t.staleSessions.map((x) => ({ row: t.row, ...x }))) },
    flags: { pass: flagged * BUDGET.legalFlagsOneIn <= sessions, flagged, allowed: Math.floor(sessions / BUDGET.legalFlagsOneIn), sessions, which: legal.flatMap((t) => t.flaggedSessions.map((x) => ({ row: t.row, ...x }))) },
    expert: { pass: rate !== null && rate >= BUDGET.expertHitRate, rate, hits: expert?.hits ?? 0, shots: expert?.shots ?? 0, sessions: expert?.sessions ?? 0 },
  };
}

// The searching client, live against your view: hit rate at most 75%; at least 90% flagged.
export function searcherVerdict(t) {
  const rate = hitRate(t);
  return {
    hit: { pass: rate === null || rate <= BUDGET.searcherHitRate, rate, hits: t.hits, shots: t.shots },
    flags: { pass: t.flagged >= BUDGET.searcherFlagged * t.sessions, flagged: t.flagged, sessions: t.sessions, missed: t.sessions - t.flagged },
  };
}

// ---------------------------------------------------------------- the recordings (unit 14)

export function scoreRecordings(cases, lob) {
  const t = { sessions: cases.length, shots: 0, hits: 0, flagged: 0 };
  for (const c of cases) {
    for (const r of c.rounds) if (r.shot) { t.shots += 1; if (r.result === 'hit') t.hits += 1; }
    const s = lob.score(lob.features({ record: { inputs: c.record.inputs }, rounds: c.rounds }), lob.settings);
    if (typeof s === 'number' && s >= lob.settings.threshold) t.flagged += 1;
  }
  return t;
}

// ---------------------------------------------------------------- the courier

// runCourier at one window with your functions, counted by unit 15's rules.
export function courierAt({ seed, sessions, window, rewind }) {
  const run = runCourier({ seed, sessions, window, judge: rewind.judgeInteract, measureRtt: rewind.measureRtt, positionAt: rewind.positionAt });
  const c = { seed, sessions, window, honest: 0, honestRefused: 0, naive: 0, naiveAccepted: 0, slow: 0, slowAccepted: 0, firstHonestRefused: null, firstNaiveAccepted: null };
  for (const o of run.outcomes) {
    if (o.who === 'honest') {
      c.honest += 1;
      if (!o.accepted && o.inRangeAtSeen) { c.honestRefused += 1; c.firstHonestRefused ??= o; }
    } else if (o.who === 'naiveFaker') {
      c.naive += 1;
      if (o.accepted && !o.inRangeNow) { c.naiveAccepted += 1; c.firstNaiveAccepted ??= o; }
    } else if (o.who === 'slowPongFaker') {
      c.slow += 1;
      if (o.accepted && !o.inRangeNow) c.slowAccepted += 1;
    }
  }
  const mean = (who) => { const mine = run.sessions.filter((s) => s.who === who); return mine.reduce((sum, s) => sum + s.deliveries, 0) / mine.length; };
  c.deliveries = { honest: mean('honest'), naive: mean('naiveFaker'), slow: mean('slowPongFaker') };
  return c;
}

export function courierVerdict(c) {
  const honestRate = c.honest ? c.honestRefused / c.honest : 0;
  const naiveRate = c.naive ? c.naiveAccepted / c.naive : 0;
  return {
    honest: { pass: honestRate <= BUDGET.honestRefused, rate: honestRate, refused: c.honestRefused, of: c.honest, first: c.firstHonestRefused },
    naive: { pass: naiveRate <= BUDGET.naiveAccepted, rate: naiveRate, accepted: c.naiveAccepted, of: c.naive, first: c.firstNaiveAccepted },
  };
}

// ---------------------------------------------------------------- trades under a crash

const copy = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
const coinsIn = (snap) => Object.entries(snap).filter(([k, v]) => k.startsWith('coins:') && typeof v === 'number').reduce((sum, [, v]) => sum + v, 0);
const holdersOf = (snap, item) => Object.entries(snap).filter(([k, v]) => k.startsWith('inv:') && Array.isArray(v)).flatMap(([k, v]) => v.filter((id) => id === item).map(() => k.slice(4)));
export const describeRequest = (r) => `${r.key}: ${r.seller} sells ${r.buyer} the ${r.item} for ${r.price}`;

// Every item held other than once, and whether the coins still add up.
function damage(snap, items, total) {
  const twice = [], missing = [];
  for (const item of items) {
    const h = holdersOf(snap, item);
    if (h.length > 1) twice.push(`the ${item} is held ${h.length} times (${h.join(', ')})`);
    if (h.length === 0) missing.push(`the ${item} is held by nobody`);
  }
  const coins = coinsIn(snap);
  return { twice, missing, delta: coins - total, coins };
}

// A crash after each write of the script, recovery crashed after each of its own writes,
// then recovery, the client's retry and the rest of the script.
export function crashTrades({ world, script, trade, recover }) {
  const items = Object.entries(world).filter(([k]) => k.startsWith('inv:')).flatMap(([, v]) => v);
  const total = coinsIn(world);
  const clean = createStore(world);
  const writesAfter = [];
  for (const request of script) {
    trade(clean, copy(request));
    writesAfter.push(clean.writes);
  }
  const t = { requests: script.length, writes: clean.writes, crashPoints: 0, recoveryPoints: 0, heldTwice: 0, missing: 0, coinsWrong: 0, coinsMoved: 0, broken: 0, first: null, unreached: [] };
  const requestAt = (g) => writesAfter.findIndex((w) => g <= w);
  const story = (g, m) => {
    const i = requestAt(g);
    const first = i > 0 ? writesAfter[i - 1] + 1 : 1;
    return `a crash after write ${g} of the script (write ${g - first + 1} of request ${i + 1}, ${describeRequest(script[i])})${m ? `, then recover crashed after its write ${m}` : ''}, then recover, the retry of request ${i + 1} and the rest of the script`;
  };

  // Runs the script until the crash; null when the crash never came.
  function upToCrash(g) {
    const store = createStore(world);
    store.crashAfter(g);
    for (const [i, request] of script.entries()) {
      try {
        trade(store, copy(request));
      } catch (error) {
        if (!(error instanceof Crash)) throw error;
        store.restart();
        return { store, at: i };
      }
      // A trade that caught the Crash and went on: the server died there all the same.
      if (store.writes >= g) { store.restart(); return { store, at: i }; }
    }
    return null;
  }

  function scenario(g, m) {
    const start = upToCrash(g);
    if (!start) { t.unreached.push(g); return; }
    const { store, at } = start;
    if (m) {
      store.crashAfter(m);
      try { recover(store); } catch (error) { if (!(error instanceof Crash)) throw error; }
      store.restart();
    }
    recover(store);
    const afterRecovery = damage(store.snapshot(), items, total);
    for (const request of script.slice(at)) trade(store, copy(request));
    const atEnd = damage(store.snapshot(), items, total);
    const twice = [...new Set([...afterRecovery.twice, ...atEnd.twice])];
    const missing = [...new Set([...afterRecovery.missing, ...atEnd.missing])];
    const delta = afterRecovery.delta || atEnd.delta;
    t.heldTwice += twice.length;
    t.missing += missing.length;
    if (delta) { t.coinsWrong += 1; t.coinsMoved += Math.abs(delta); }
    if (twice.length || missing.length || delta) {
      t.broken += 1;
      if (!t.first) {
        const after = [...afterRecovery.twice, ...afterRecovery.missing, ...(afterRecovery.delta ? [`the coins add up to ${afterRecovery.coins}, not ${total}`] : [])];
        const end = [...atEnd.twice, ...atEnd.missing, ...(atEnd.delta ? [`the coins add up to ${atEnd.coins}, not ${total}`] : [])];
        t.first = { story: story(g, m), afterRecovery: after, atEnd: end };
      }
    }
  }

  for (let g = 1; g <= t.writes; g += 1) {
    t.crashPoints += 1;
    scenario(g, 0);
    // How many writes recovery makes from this crash, on a copy of the store.
    const start = upToCrash(g);
    if (!start) continue;
    const probe = createStore(start.store.snapshot());
    recover(probe);
    for (let m = 1; m <= probe.writes; m += 1) {
      t.recoveryPoints += 1;
      scenario(g, m);
    }
  }
  return t;
}

export function tradeVerdict(t) {
  return { pass: t.broken === 0 && t.unreached.length === 0, ...t };
}
