// Lab commands for unit 12: your admission, recorder and replay on Lob behind the server.
// lab.mjs lists them with its own commands (node lab.mjs help).
//
//   play PROJECT [--model expert] [--rounds 3] [--seed S]
//       one session through your admission and the full view, message by message: every
//       input with your admission's decision, every round's start, shot, landing and result
//   clients PROJECT [--seed S]
//       the honest skilled player and the four protocol cheats, 3 sessions each, against your
//       admission: per client, messages sent, admitted, and refused by reason
//   record PROJECT --out FILE [--model expert] [--rounds N] [--seed S]
//       one session with your admission and your recorder; the record is saved to FILE
//   replay PROJECT FILE [--name NAME]
//       your replay, with your admission, of the record in FILE; for the course's own
//       records, FILE is checks/fixtures/12/records.json and --name picks one
//   tamper FILE --out FILE2 (--set PATH=VALUE | --drop PATH | --swap I,J)
//       a copy of the record in FILE with one change, to try on your replay. A PATH names a
//       field: inputs.3.power, final.score, seed; a number is a place in a list, counted from
//       0, so inputs.3 is the fourth input (n 4). VALUE is read as JSON when it can be (70,
//       true, null, "text" in double quotes) and as text otherwise; --set may add a field.
//       --drop removes a field, or an input: then n is numbered 1, 2, 3, ... again, as if
//       the server had never admitted it. --swap I,J exchanges inputs I and J and numbers n
//       again, as if the server had applied them in the other order. To break the numbering
//       itself, set an n: --set inputs.5.n=9. One change a run; run tamper on its output for more.
//   record and tamper never overwrite a file.
//
// The models are the player kinds in public/players.mjs and the protocol cheats in
// public/adversaries.mjs. Each plays over its own network unless a command says otherwise.
// A session's server seed is S (default 1); the client is seeded mixSeed(S, 2) and the
// links mixSeed(S, 3) and mixSeed(S, 4). Everything is seeded: the same command prints the
// same lines.
import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createLobServer } from '../public/runtime.mjs';
import { playSession } from '../public/sim.mjs';
import { link } from '../public/net.mjs';
import { fullView } from '../public/full-view.mjs';
import { makePlayer, PLAYER_KINDS } from '../public/players.mjs';
import { hitClaim, fireTwice, outOfRange, replay as replayCheat } from '../public/adversaries.mjs';
import { mixSeed } from '../public/stats.mjs';
import { makeLoader } from '../checks/harness.mjs';

// Output is held until a command ends, so a function that is not written yet stops the
// command with its one line and nothing before it; any other error still shows the lines
// printed up to the moment it happened.
let held = null;
const say = (s = '') => (held ? held.push(s) : console.log(s));
async function holding(run) {
  held = [];
  let lines;
  try {
    await run();
  } catch (e) {
    [lines, held] = [held, null];
    if (!e?.notWritten) for (const l of lines) console.log(l);
    throw e;
  }
  [lines, held] = [held, null];
  for (const l of lines) console.log(l);
}
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

const CHEATS = { hitClaim, fireTwice, outOfRange, replay: replayCheat };
const MODELS = [...Object.keys(PLAYER_KINDS), ...Object.keys(CHEATS)];
const NO_JITTER = { oneWayMs: 30, jitterMs: 0 };

// ------------------------------------------------------------------ shared

// A project folder, as lab.mjs checks it.
function project(dir) {
  if (!dir) throw Error('Name your project folder: node lab.mjs COMMAND PROJECT ...');
  const p = resolve(dir);
  if (!existsSync(join(p, 'PROJECT.json'))) throw Error(`${dir} is not a project folder: make it with a starting route from lesson 12 (node examples/start-chapter.mjs ${dir} write, or supplied)`);
  return p;
}

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

// Your functions, loaded with the checks' loader. A function that still throws "not written
// yet", or throws anything else, stops the command with one line naming it (as lab.mjs does).
async function learnerFunctions(p, file, names) {
  const loader = makeLoader(p);
  const out = {};
  for (const name of names) {
    let f;
    try { f = await loader.fn(file, name); } catch (e) {
      const message = String(e.fields?.observed ?? e.message).split('\n')[0];
      throw Object.assign(Error(message), { notWritten: message.includes('not written yet') });
    }
    out[name] = (...args) => {
      try {
        return f(...args);
      } catch (e) {
        if (e?.fromLab) throw e;
        const message = String(e?.message ?? e).split('\n')[0];
        const stop = (text, notWritten = false) => Object.assign(Error(text), { fromLab: true, notWritten });
        if (message.includes('not written yet')) throw stop(`${message.match(/^(\w+): not written yet/)?.[1] ?? name} in ${file} is not written yet: write it (API.md says what it must do), then run this again.`, true);
        const where = whereInProject(e, p);
        throw stop(`your ${name} in ${file} threw ${e?.name ?? 'Error'}: ${message}${where ? ` (${where})` : ''}`);
      }
    };
  }
  return out;
}

const admissionOf = (p) => learnerFunctions(p, 'server/admission.mjs', ['parseInput', 'admit']);

// The server calls createRecorder for each new session; the record's two functions are
// guarded the same way.
async function recorderOf(p) {
  const { createRecorder } = await learnerFunctions(p, 'server/recorder.mjs', ['createRecorder']);
  return (options) => {
    const r = createRecorder(options);
    if (!r || typeof r.admitted !== 'function' || typeof r.finish !== 'function') {
      throw Error(`your createRecorder in server/recorder.mjs returned ${JSON.stringify(r) ?? String(r)}, not an object with the functions admitted(tick, input) and finish(end, final)`);
    }
    const guard = (name, f) => (...args) => {
      try { return f(...args); } catch (e) {
        const message = String(e?.message ?? e).split('\n')[0];
        const where = whereInProject(e, p);
        throw Object.assign(Error(`your recorder's ${name} (made by createRecorder in server/recorder.mjs) threw ${e?.name ?? 'Error'}: ${message}${where ? ` (${where})` : ''}`), { fromLab: true });
      }
    };
    return { admitted: guard('admitted', r.admitted.bind(r)), finish: guard('finish', r.finish.bind(r)) };
  };
}

function wholeOption(o, name, fallback, least) {
  if (o[name] === undefined) return fallback;
  const n = Number(o[name]);
  if (o[name] === true || !Number.isSafeInteger(n) || n < least) throw Error(`--${name} takes a whole number, ${least} or more`);
  return n;
}

function modelOption(o, fallback) {
  const name = o.model === undefined ? fallback : String(o.model);
  if (!MODELS.includes(name)) throw Error(`--model takes one of ${MODELS.join(', ')}`);
  return name;
}

function makeClient(name, seed) {
  return CHEATS[name] ? CHEATS[name](mixSeed(seed, 2)) : makePlayer(name, mixSeed(seed, 2));
}

function describeModel(name) {
  if (CHEATS[name]) return `the ${name} client (a protocol cheat; otherwise a skilled player)`;
  return `the ${name} player`;
}

function describeNet(net) {
  return `${net.oneWayMs} ms each way${net.jitterMs ? ` + 0..${net.jitterMs} ms jitter` : ', no jitter'}${net.outages?.length ? `, outages at ${net.outages.map((x) => `${(x.at / 1000).toFixed(1)} s for ${(x.ms / 1000).toFixed(1)} s`).join(', ')}` : ''}`;
}

// What happened to one message: admitted, or refused by parseInput or admit with a reason.
function verdict({ parsed, decision }) {
  const what = (v) => (v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v));
  if (!parsed || parsed.ok !== true) return { admitted: false, by: 'parseInput', reason: typeof parsed?.reason === 'string' ? parsed.reason : `no reason (it returned ${what(parsed)})` };
  if (decision?.status === 'admitted') return { admitted: true };
  return { admitted: false, by: 'admit', reason: typeof decision?.reason === 'string' ? decision.reason : `no reason (it returned ${what(decision)})` };
}

// A message as you would type it: in single quotes when it can be, otherwise as JSON.
function quoted(text, limit = 90) {
  const s = typeof text === 'string' && !/['\\\u0000-\u001f]/.test(text) ? `'${text}'` : JSON.stringify(text) ?? String(text);
  return s.length > limit ? `${s.slice(0, limit - 3)}...` : s;
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const arrows = (level) => (level === 0 ? '~' : (level > 0 ? '>' : '<').repeat(Math.abs(level)));

// JSON with every object or list that fits in `width` characters on one line, so a record
// shows one input per line.
function formatJson(value, width = 100, indent = '') {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== 'object' || flat.length + indent.length <= width) return flat;
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => inner + formatJson(v, width, inner)).join(',\n')}\n${indent}]`;
  }
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${formatJson(value[k], width, inner)}`).join(',\n')}\n${indent}}`;
}

function writeNew(file, text) {
  const path = resolve(file);
  if (existsSync(path)) throw Error(`${file} exists: choose a new name, or delete it first. Nothing was overwritten.`);
  writeFileSync(path, text, { flag: 'wx' });
}

function readJsonFile(file) {
  if (!file) throw Error('Name the file that holds the record.');
  const path = resolve(file);
  if (!existsSync(path)) throw Error(`There is no file ${file}.`);
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw Error(`${file} is not valid JSON: ${String(e.message).split('\n')[0]}`); }
}

const isFixtureFile = (data) => data && typeof data === 'object' && Array.isArray(data.genuine) && Array.isArray(data.tampered);

// ------------------------------------------------------------------ play

async function play(dir, o) {
  const p = project(dir);
  const name = modelOption(o, 'expert');
  const rounds = wholeOption(o, 'rounds', 3, 1);
  const seed = wholeOption(o, 'seed', 1, 0);
  const admission = await admissionOf(p);
  const client = makeClient(name, seed);
  const net = client.network;
  const line = (tick, text) => say(`${lpad(tick, 5)}  ${text}`);
  let server = null;
  let entry = null;
  let shown = null; // what the trace last saw of the game: { round, flying }

  // The session exists once playSession has joined it; the first hook to run starts the trace.
  const start = () => {
    if (entry) return;
    entry = server.sessions[0];
    shown = { round: entry.session.round, flying: false };
    say(`${capital(describeModel(name))} against your admission and the full view: server seed ${seed}, game seed ${entry.seed}, ${describeNet(net)}${rounds < 12 ? `, stopping after ${plural(rounds, 'round')}` : ''}.`);
    say('');
    say(' tick  what happened');
    line(0, `round ${entry.session.round} starts: the flag at ${Math.round(entry.game.targetX())}, wind ${arrows(entry.game.windLevel())}`);
  };

  const onEvent = (event) => {
    start();
    const v = verdict(event);
    const after = entry.session.facts();
    if (!event.parsed || event.parsed.ok !== true) {
      line(event.tick, `${quoted(event.text, 66)}  refused by your parseInput: ${v.reason}`);
      return;
    }
    const { seq, angle, power, fire } = event.parsed.input;
    const cells = `seq ${pad(seq, 6)} angle ${pad(angle, 3)} power ${pad(power, 4)} ${fire === true ? 'fire' : '    '}`;
    let what;
    if (!v.admitted) what = `refused by your admit: ${v.reason}`;
    else if (fire === true && after.flying && !shown.flying) what = 'admitted; the shell is away';
    else if (fire === true) what = 'admitted, but the game fired nothing: a shell was in the air';
    else what = 'admitted';
    if (fire === true && after.flying) shown.flying = true;
    line(event.tick, `${cells}  ${what}`);
  };

  // The view runs after every tick: the trace notes landings and new rounds here.
  const view = (game, info) => {
    start();
    const facts = entry.session.facts();
    if (shown.flying && !facts.flying) {
      const impact = game.impact();
      line(info.tick, `the shell lands at ${impact ? Math.round(impact.x) : '?'}: ${game.message()}`);
    }
    if (facts.round !== shown.round) {
      const last = entry.session.outcomes().find((r) => r.round === shown.round);
      if (last && !last.shot) line(info.tick, `round ${shown.round} ends with no shot, ${info.tick - last.start} ticks after it started`);
      line(info.tick, `round ${facts.round} starts: the flag at ${Math.round(game.targetX())}, wind ${arrows(game.windLevel())}`);
    }
    shown = { round: facts.round, flying: facts.flying };
    return fullView(game, info);
  };

  // A message that makes your function throw gets its own line before the error.
  const crashed = (tick, text, who) => (e) => { if (!e?.notWritten) { start(); line(tick, `${text}  your ${who} threw on this message:`); } throw e; };
  const watched = {
    parseInput(text) { try { return admission.parseInput(text); } catch (e) { crashed(server.sessions[0].session.tick, quoted(text, 66), 'parseInput')(e); } },
    admit(state, input, facts) { try { return admission.admit(state, input, facts); } catch (e) { crashed(facts.tick, quoted(JSON.stringify(input), 66), 'admit')(e); } },
  };
  server = createLobServer({ seed, admission: watched, view, onEvent });
  const result = playSession({ server, client, up: link({ seed: mixSeed(seed, 3), ...net }), down: link({ seed: mixSeed(seed, 4), ...net }), rounds });
  line(result.ticks, entry.session.over() ? 'the session is over' : `stopped: ${plural(rounds, 'round')} played`);
  say('tick: ticks the server had run (50 ms each) when it decided the message, or when the change showed.');
  say('seq, angle, power, fire: the input as your parseInput read it. A message your parseInput refused is shown as sent.');
  say('');
  say(` round  start   shot  angle  power  landing     flag     miss  result  inputs`);
  const over = entry.session.over();
  for (const r of result.outcomes.filter((x) => over || x.round <= rounds)) {
    const shot = r.shot;
    const num = (x) => (x === null || x === undefined ? '-' : x.toFixed(2));
    say(` ${lpad(r.round, 5)}  ${lpad(r.start, 5)}  ${lpad(shot ? shot.tick : '-', 5)}  ${lpad(shot ? shot.angle : '-', 5)}  ${lpad(shot ? shot.power : '-', 5)}  ${lpad(num(r.impact), 7)}  ${lpad(num(r.flag), 7)}  ${lpad(num(r.miss), 7)}  ${pad(r.result ?? '-', 6)}  ${lpad(r.inputs, 6)}`);
  }
  say('start: the tick the round started; shot: the tick its fire was applied, with that angle and power; landing and flag: where');
  say('the shell landed and where the flag was then, in paces; miss: landing minus flag, negative is short; inputs: inputs admitted in the round.');
  say('');
  const f = result.final;
  say(`After ${plural(result.ticks, 'tick')}: round ${f.round}, score ${f.score}, shots ${f.shots}, angle ${f.angle}, power ${f.power}.`);
}

// ------------------------------------------------------------------ clients

// The reasons in API.md's order: parseInput's, then admit's.
const REASON_ORDER = ['text', 'too-long', 'json', 'object', 'keys', 'version', 'seq', 'angle', 'power', 'fire', 'stale', 'flying', 'fired'];

const CLIENT_ROWS = [
  ['skilled', 'the honest skilled player'],
  ['hitClaim', 'adds hit: true to every fire, once sends score: 99'],
  ['fireTwice', 'fires again while its shell flies, and after it lands'],
  ['outOfRange', 'sends copies with power 150, once angle 4, once power 60.5'],
  ['replay', 're-sends its previous round\'s fire, byte for byte'],
];

async function clients(dir, o) {
  const p = project(dir);
  const seed = wholeOption(o, 'seed', 1, 0);
  const admission = await admissionOf(p);
  const SESSIONS = 3;
  say(`Five clients against your admission: ${SESSIONS} sessions each (server seeds ${seed} to ${seed + SESSIONS - 1}), ${describeNet(NO_JITTER)}, the full view.`);
  say('');
  say(`${pad('client', 11)} ${lpad('sent', 5)} ${lpad('admitted', 9)} ${lpad('refused', 8)} ${lpad('shots', 6)} ${lpad('rounds', 7)}  refused by reason`);
  let over = 0;
  for (const [name] of CLIENT_ROWS) {
    const row = { sent: 0, admitted: 0, refused: 0, shots: 0, rounds: 0, reasons: new Map() };
    for (let s = seed; s < seed + SESSIONS; s++) {
      const server = createLobServer({ seed: s, admission, view: fullView });
      let result;
      try {
        result = playSession({ server, client: makeClient(name, s), up: link({ seed: mixSeed(s, 3), ...NO_JITTER }), down: link({ seed: mixSeed(s, 4), ...NO_JITTER }) });
      } catch (e) {
        if (!e?.notWritten) e.message += ` (while playing ${name === 'skilled' ? 'the skilled player' : `the ${name} client`}, server seed ${s}, at tick ${server.sessions[0]?.session.tick})`;
        throw e;
      }
      for (const event of server.session(result.token).decisions) {
        const v = verdict(event);
        row.sent++;
        if (v.admitted) { row.admitted++; continue; }
        row.refused++;
        const key = `${v.reason}`;
        row.reasons.set(key, (row.reasons.get(key) ?? 0) + 1);
      }
      row.shots += result.final.shots;
      row.rounds += result.final.round;
      if (result.final.shots > result.final.round) over++;
    }
    const rank = (r) => (REASON_ORDER.includes(r) ? REASON_ORDER.indexOf(r) : REASON_ORDER.length);
    const reasons = [...row.reasons].sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? -1 : 1)).map(([r, n]) => `${r} ${n}`).join(', ') || '-';
    say(`${pad(name, 11)} ${lpad(row.sent, 5)} ${lpad(row.admitted, 9)} ${lpad(row.refused, 8)} ${lpad(row.shots, 6)} ${lpad(row.rounds, 7)}  ${reasons}`);
  }
  say('client: skilled is the honest skilled player; the others are the protocol cheats in public/adversaries.mjs:');
  for (const [n, about] of CLIENT_ROWS.slice(1)) say(`  ${n} ${about}`);
  say('sent: messages that reached the server; admitted: what your admission let through; refused: the rest, by the reason your parseInput or admit gave.');
  say(`shots, rounds: shots fired and rounds played, over the ${SESSIONS} sessions.`);
  say('Apart from its cheating messages, each cheat plays exactly as the skilled player does with the same seeds. With a correct admission,');
  say('fireTwice, outOfRange and replay show the skilled row\'s admitted and shots; hitClaim\'s fires all carry hit, so it never gets a shot.');
  if (over) say(`${plural(over, 'session')} ended with more shots than rounds: your admission let a second fire through.`);
}

// ------------------------------------------------------------------ record

async function record(dir, o) {
  const p = project(dir);
  if (typeof o.out !== 'string') throw Error('Name the file to save the record in: node lab.mjs record PROJECT --out FILE');
  const name = modelOption(o, 'expert');
  const rounds = o.rounds === undefined ? Infinity : wholeOption(o, 'rounds', 12, 1);
  const seed = wholeOption(o, 'seed', 1, 0);
  if (existsSync(resolve(o.out))) throw Error(`${o.out} exists: choose a new name, or delete it first. Nothing was overwritten.`);
  const admission = await admissionOf(p);
  const recorder = await recorderOf(p);
  const client = makeClient(name, seed);
  const server = createLobServer({ seed, admission, view: fullView, recorder });
  const result = playSession({ server, client, up: link({ seed: mixSeed(seed, 3), ...client.network }), down: link({ seed: mixSeed(seed, 4), ...client.network }), rounds });
  const entry = server.session(result.token);
  const rec = result.record;
  let text;
  try { text = formatJson(rec); } catch (e) { throw Error(`your record cannot be written as JSON: ${String(e.message).split('\n')[0]}`); }
  if (text === undefined) throw Error(`your recorder's finish returned ${String(rec)}, not a record`);
  writeNew(o.out, `${text}\n`);
  const admitted = entry.decisions.filter((e) => verdict(e).admitted).length;
  say(`Recorded ${describeModel(name)}: server seed ${seed}, game seed ${entry.seed}, ${describeNet(client.network)}.`);
  say(`The server admitted ${admitted} of ${plural(entry.decisions.length, 'message')} and ran ${plural(entry.session.tick, 'tick')}; the session ${entry.session.over() ? 'was over' : `was still playing (stopped after ${plural(rounds, 'round')})`} when it called finish.`);
  say(`Your record: ${Array.isArray(rec?.inputs) ? plural(rec.inputs.length, 'input') : 'no inputs list'}, end ${JSON.stringify(rec?.end)}, final ${JSON.stringify(rec?.final)}.`);
  say(`Saved ${o.out}. Replay it: node lab.mjs replay ${dir} ${o.out}`);
}

// ------------------------------------------------------------------ replay

async function replayCommand(dir, file, o) {
  const p = project(dir);
  const data = readJsonFile(file);
  let rec = data, about = null, required = null;
  if (isFixtureFile(data)) {
    const all = [...data.genuine.map((g) => ({ ...g, kind: 'genuine' })), ...data.tampered.map((t) => ({ ...t, kind: 'tampered' }))];
    const names = all.map((x) => x.name).join(', ');
    if (typeof o.name !== 'string') throw Error(`${file} holds several records: choose one with --name NAME (${names})`);
    const pick = all.find((x) => x.name === o.name);
    if (!pick) throw Error(`${file} has no record named ${o.name}; its records are ${names}`);
    rec = pick.record;
    about = `${pick.kind} record "${pick.name}": ${pick.about ?? pick.what}`;
    required = pick.kind === 'genuine' ? { ok: true, final: rec.final } : { ok: false, reason: pick.reason };
  }
  const { replay } = await learnerFunctions(p, 'server/recorder.mjs', ['replay']);
  const admission = await admissionOf(p);
  const shape = rec && typeof rec === 'object' && Array.isArray(rec.inputs)
    ? `seed ${JSON.stringify(rec.seed)}, ${plural(rec.inputs.length, 'input')}, end ${JSON.stringify(rec.end)}, final ${JSON.stringify(rec.final)}`
    : 'it has no inputs list';
  say(`Your replay of ${file}${about ? `, ${about}` : ''}`);
  say(`The record: ${shape}.`);
  const out = replay(structuredClone(rec), admission);
  if (out?.ok === true) say(`Your replay: ok, final ${JSON.stringify(out.final)}.`);
  else if (out?.ok === false) say(`Your replay: refused, reason ${JSON.stringify(out.reason)}.`);
  else say(`Your replay returned ${JSON.stringify(out) ?? String(out)}, which is neither { ok: true, final } nor { ok: false, reason }.`);
  if (required) say(`The checks require ${required.ok ? 'ok, with the record\'s final' : `refused, reason "${required.reason}"`}: ${sameValue(out, required) ? 'yours agrees.' : 'yours differs.'}`);
}

// Equal as JSON values, whatever the order of the keys.
function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameValue(a[k], b[k]));
  }
  return Object.is(a, b);
}

// ------------------------------------------------------------------ tamper

// "inputs.3.power" -> ['inputs', 3, 'power']: numbers are positions in a list, from 0.
function steps(path) {
  if (typeof path !== 'string' || !path.trim()) throw Error('Give a path, such as inputs.3.power, final.score or seed');
  return path.split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

// The container that holds the last step of the path, and that step.
function locate(rec, path, { adding = false } = {}) {
  const parts = steps(path);
  let at = rec;
  for (let i = 0; i < parts.length - 1; i++) {
    at = at?.[parts[i]];
    if (at === null || typeof at !== 'object') throw Error(`The record has nothing at ${parts.slice(0, i + 1).join('.')}`);
  }
  const last = parts.at(-1);
  if (Array.isArray(at)) {
    if (typeof last !== 'number' || last >= at.length) throw Error(`${path}: ${parts.slice(0, -1).join('.') || 'the record'} is a list of ${at.length}; give a position from 0 to ${at.length - 1}`);
  } else if (!adding && !Object.hasOwn(at, last)) throw Error(`The record has no field ${path}`);
  return { at, last };
}

function readValue(text) {
  try { return JSON.parse(text); } catch { return text; }
}

async function tamper(file, o) {
  const changes = ['set', 'drop', 'swap'].filter((k) => o[k] !== undefined);
  if (changes.length !== 1) throw Error('Give one change: --set PATH=VALUE, --drop PATH or --swap I,J (run tamper again on its output for more)');
  if (typeof o.out !== 'string') throw Error('Name the new file: --out FILE2');
  const rec = readJsonFile(file);
  if (isFixtureFile(rec)) throw Error(`${file} holds the course's records, not one record: save one with node lab.mjs record PROJECT --out FILE, then tamper with that`);
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw Error(`${file} does not hold a record (a JSON object)`);
  let did;
  if (o.set !== undefined) {
    const text = String(o.set);
    const eq = text.indexOf('=');
    if (o.set === true || eq < 1) throw Error('--set takes PATH=VALUE, such as --set inputs.3.power=70');
    const path = text.slice(0, eq), value = readValue(text.slice(eq + 1));
    const { at, last } = locate(rec, path, { adding: true });
    const was = Object.hasOwn(at, last) ? JSON.stringify(at[last]) : null;
    at[last] = value;
    did = was === null ? `a new field ${path} = ${JSON.stringify(value)}` : `${path} changed from ${was} to ${JSON.stringify(value)}`;
  } else if (o.drop !== undefined) {
    if (o.drop === true) throw Error('--drop takes a path, such as --drop inputs.3 or --drop end');
    const { at, last } = locate(rec, String(o.drop));
    if (Array.isArray(at)) {
      const [gone] = at.splice(last, 1);
      if (at === rec.inputs) at.forEach((x, k) => { if (x && typeof x === 'object') x.n = k + 1; });
      did = `${o.drop} removed (${JSON.stringify(gone)})${at === rec.inputs ? ', and n numbered 1, 2, 3, ... again, as if the server had never admitted it' : ''}`;
    }
    else { delete at[last]; did = `the field ${o.drop} removed`; }
  } else {
    const m = String(o.swap).match(/^(\d+),(\d+)$/);
    if (!m) throw Error('--swap takes two positions in inputs, from 0, such as --swap 2,3');
    const [i, j] = [Number(m[1]), Number(m[2])];
    const inputs = rec.inputs;
    if (!Array.isArray(inputs)) throw Error(`${file} has no inputs list`);
    if (i === j || i >= inputs.length || j >= inputs.length) throw Error(`--swap takes two different positions from 0 to ${inputs.length - 1}`);
    [inputs[i], inputs[j]] = [inputs[j], inputs[i]];
    inputs.forEach((x, k) => { if (x && typeof x === 'object') x.n = k + 1; });
    did = `inputs ${i} and ${j} exchanged, as if the server had applied them in the other order (n numbered 1, 2, 3, ... again)`;
  }
  writeNew(o.out, `${formatJson(rec)}\n`);
  say(`Wrote ${o.out}: ${file} with ${did}.`);
  // Name the project folder the files sit in (it holds PROJECT.json), so the line can be pasted.
  const home = [dirname(o.out), dirname(file)].find((d) => existsSync(join(d, 'PROJECT.json')));
  say(home ? `Try it: node lab.mjs replay ${home} ${o.out}` : `Try it: node lab.mjs replay project ${o.out} (with your project folder's name, if it isn't project)`);
}

// ------------------------------------------------------------------ the rows lab.mjs lists

export const commands = [
  { name: 'play', args: 'PROJECT [--model expert] [--rounds 3] [--seed S]', about: 'one session through your admission, message by message, with each round\'s shot and result',
    run: ({ plain, o }) => holding(() => play(plain[0], o)) },
  { name: 'clients', args: 'PROJECT [--seed S]', about: 'the honest skilled player and the four protocol cheats against your admission: messages admitted and refused, by reason',
    run: ({ plain, o }) => holding(() => clients(plain[0], o)) },
  { name: 'record', args: 'PROJECT --out FILE [--model expert] [--rounds N] [--seed S]', about: 'one session with your admission and recorder, saved to FILE',
    run: ({ plain, o }) => holding(() => record(plain[0], o)) },
  { name: 'replay', args: 'PROJECT FILE [--name NAME]', about: 'your replay of a saved record (for checks/fixtures/12/records.json, --name picks the record)',
    run: ({ plain, o }) => holding(() => replayCommand(plain[0], plain[1], o)) },
  { name: 'tamper', args: 'FILE --out FILE2 (--set PATH=VALUE | --drop PATH | --swap I,J)', about: 'a copy of a record with one change, to try on your replay; positions count from 0 (inputs.3 is n 4)',
    run: ({ plain, o }) => holding(() => tamper(plain[0], o)) },
];
