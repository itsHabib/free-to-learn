// Unit 12: Lob behind a server.
//
// 12.parse-* and 12.admit-* call your parseInput and admit on crafted messages, states and
// facts, each with the answer API.md's rules give.
// 12.clients plays the supplied honest skilled player and the four protocol cheats through
// the supplied server (public/runtime.mjs) with your admission, and checks every decision
// as it is made. checks/fixtures/12/clients.json holds the refusals a correct admission
// makes in those sessions (the course played them when it was built); every other message
// must be admitted. Until a decision differs, your sessions run exactly as the course's did.
// 12.recorder compares your record with what the server admitted. 12.replay-genuine and
// 12.replay-tampered replay checks/fixtures/12/records.json: each genuine record must replay
// to its final, each tampered copy must be refused with its reason. 12.replay-own replays
// records your own recorder made, then altered copies of them, each changed in one way whose
// reason API.md's rules fix. 12.replay-genuine and 12.replay-own watch your admit while your
// replay runs: the facts.tick of each call must be the tick of the input it re-checks.
import { Buffer } from 'node:buffer';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fail, show, same, firstDifference, readJson, NOT_WRITTEN, CheckFailure } from './harness.mjs';
import { createLobServer } from '../public/runtime.mjs';
import { playSession } from '../public/sim.mjs';
import { link } from '../public/net.mjs';
import { fullView } from '../public/full-view.mjs';
import { makePlayer } from '../public/players.mjs';
import { hitClaim, fireTwice, outOfRange, replay as replayCheat } from '../public/adversaries.mjs';
import { mixSeed } from '../public/stats.mjs';

export const title = 'Lob behind a server';

// ---------------------------------------------------------------- the sessions (shared with tools/make-fixtures.mjs)

export const CLIENTS = {
  skilled: { about: 'the honest skilled player', make: (seed) => makePlayer('skilled', seed) },
  hitClaim: { about: 'hitClaim (adds hit: true to every fire, and once sends score: 99)', make: hitClaim },
  fireTwice: { about: 'fireTwice (fires again while its shell flies, and again after it lands)', make: fireTwice },
  outOfRange: { about: 'outOfRange (sends copies with power 150, once angle 4, once power 60.5)', make: outOfRange },
  replay: { about: 'replay (re-sends its previous round\'s fire byte for byte)', make: replayCheat },
};
export const CLIENT_SEEDS = [1221, 1222, 1223];
const NET = { oneWayMs: 30, jitterMs: 0 };

// One session of a client model against a new server: server seed `seed`, the client
// seeded mixSeed(seed, 2) by the caller, the links mixSeed(seed, 3) up and mixSeed(seed, 4)
// down, 30 ms each way and no jitter, so messages arrive in the order they were sent.
export function playClient(client, seed, admission, { recorder = null, rounds = Infinity, onServer = null } = {}) {
  const server = createLobServer({ seed, admission, view: fullView, recorder });
  if (onServer) onServer(server);
  const result = playSession({ server, client, up: link({ seed: mixSeed(seed, 3), ...NET }), down: link({ seed: mixSeed(seed, 4), ...NET }), rounds });
  return { server, result, entry: server.session(result.token) };
}
const clientCall = (name, seed) => (name === 'skilled' || name === 'expert' ? `makePlayer('${name}', mixSeed(${seed}, 2))` : `${name}(mixSeed(${seed}, 2))`);
const sessionText = (name, seed, extra = '') => `createLobServer({ seed: ${seed}, admission: yours, view: fullView${extra} }) against ${clientCall(name, seed)}, 30 ms each way, no jitter`;

// ---------------------------------------------------------------- helpers

const PARSE_REASONS = ['text', 'too-long', 'json', 'object', 'keys', 'version', 'seq', 'angle', 'power', 'fire'];
const WHY = {
  text: 'the message is not a string',
  'too-long': 'it is longer than 200 bytes in UTF-8',
  json: 'it is not valid JSON',
  object: 'it is not a plain object',
  keys: 'its keys are not exactly v, seq, angle, power, fire',
  version: 'v is not the number 1',
  seq: 'seq is not an integer from 1 to 1,000,000',
  angle: 'angle is not an integer from 5 to 85',
  power: 'power is not an integer from 10 to 100',
  fire: 'fire is not true or false',
};
const ORDER_NOTE = 'When several things are wrong, the first in API.md\'s order (text, too-long, json, object, keys, version, seq, angle, power, fire) names the reason';
const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
const firstLine = (error) => String(error?.message ?? error).split('\n')[0];
// A message as you would type it: in single quotes when it can be, otherwise as JSON.
function quoted(text, limit = 200) {
  if (typeof text !== 'string' || /['\\\u0000-\u001f]/.test(text)) return show(text, limit);
  return text.length + 2 > limit ? `'${text.slice(0, limit - 5)}...'` : `'${text}'`;
}
// A record in a line: its fields, with the inputs counted and the first one shown.
function recordSummary(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.inputs)) return show(r, 300);
  const rest = Object.entries(r).filter(([k]) => k !== 'inputs' && k !== 'final').map(([k, v]) => `${k}: ${show(v, 40)}`);
  return `{ ${rest.join(', ')}, inputs: [${plural(r.inputs.length, 'input')}${r.inputs.length ? `, the first ${show(r.inputs[0], 120)}` : ''}], final: ${show(r.final, 120)} }`;
}

function whereInWork(error, workDir) {
  if (!workDir) return '';
  const roots = new Set([workDir, pathToFileURL(workDir).href]);
  try { const real = realpathSync(workDir); roots.add(real); roots.add(pathToFileURL(real).href); } catch { /* keep the given path */ }
  for (const line of String(error?.stack ?? '').split('\n')) {
    for (const root of roots) {
      const i = line.indexOf(root);
      if (i < 0) continue;
      const m = line.slice(i + root.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return ` (${decodeURIComponent(m[1])} line ${m[2]})`;
    }
  }
  return '';
}

// Call one of your functions. Its own failure (a throw, or a Promise where a value is
// due) becomes a check failure that says where; "not written yet" passes through.
function call(run, { checked, input, expected, workDir }) {
  let out;
  try { out = run(); } catch (error) {
    if (error instanceof CheckFailure || String(error?.message ?? '').includes(NOT_WRITTEN)) throw error;
    fail({ checked, input, observed: `your code threw ${error?.name ?? 'an error'}: ${firstLine(error)}${whereInWork(error, workDir)}`, expected });
  }
  if (out && typeof out.then === 'function') {
    if (typeof out.catch === 'function') out.catch(() => {}); // its result is not used
    fail({ checked, input, observed: 'it returned a Promise', expected: `${expected}, returned directly: write it as an ordinary function, not an async one` });
  }
  return out;
}

async function admissionOf({ fn }) {
  return { parseInput: await fn('server/admission.mjs', 'parseInput'), admit: await fn('server/admission.mjs', 'admit') };
}

// The input parseInput returns for a well-formed message: its five fields.
function fiveFields(text) {
  const { v, seq, angle, power, fire } = JSON.parse(text);
  return { v, seq, angle, power, fire };
}

// The first place a value holds something JSON cannot carry, or null.
function notJson(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path} is ${value}, which JSON cannot hold`;
  if (value === undefined) return `${path} is undefined, which JSON drops`;
  if (typeof value !== 'object') return `${path} is a ${typeof value}`;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const p = notJson(value[i], `${path}[${i}]`); if (p) return p; }
    return null;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return `${path} is a ${value.constructor?.name ?? 'class instance'}, not a plain object`;
  for (const [k, v] of Object.entries(value)) { const p = notJson(v, `${path}.${k}`); if (p) return p; }
  return null;
}

// What admit must return for this input in this state, given the outcome the rules give.
function decision(outcome, state, input, facts) {
  if (outcome === 'admitted') return { status: 'admitted', next: { lastSeq: input.seq, firedRound: input.fire ? facts.round : state.firedRound } };
  return { status: 'refused', reason: outcome, next: { lastSeq: state.lastSeq, firedRound: state.firedRound } };
}
function decisionWhy(outcome, state, input, facts) {
  if (outcome === 'stale') return `seq ${input.seq} is not above the last admitted seq, ${state.lastSeq}`;
  if (outcome === 'flying') return 'the shell is in the air (facts.flying is true)';
  if (outcome === 'fired') return `fire is true and round ${facts.round} already has a shot (state.firedRound is ${state.firedRound})`;
  return `no rule refuses it, so it is admitted; next holds its seq, and firedRound ${input.fire ? `becomes the round, ${facts.round}, because it fires` : `stays ${state.firedRound}, because it does not fire`}`;
}

// ---------------------------------------------------------------- crafted messages

const pad = (text, bytes) => text + ' '.repeat(bytes - Buffer.byteLength(text, 'utf8'));
const NOTE = '{"v":1,"seq":24,"angle":45,"power":60,"fire":true,"note":"' + 'é'.repeat(80) + '"}';

const ACCEPTS = [
  ['{"v":1,"seq":1,"angle":5,"power":10,"fire":false}', 'the smallest seq, angle and power, fire false'],
  ['{"v":1,"seq":1000000,"angle":85,"power":100,"fire":true}', 'the largest seq, angle and power, fire true'],
  ['{"fire":true,"power":71,"angle":52,"seq":17,"v":1}', 'the keys in reverse order'],
  ['{"angle":45,"v":1,"fire":false,"seq":999999,"power":60}', 'the keys in another order'],
  ['{ "v" : 1 , "seq" : 18 , "angle" : 52 , "power" : 71 , "fire" : false }', 'spaces around every token'],
  ['{\n  "v": 1,\n  "seq": 19,\n  "angle": 30,\n  "power": 55,\n  "fire": true\n}\n', 'new lines and indentation, as JSON.stringify(input, null, 2) writes it, then a new line'],
  ['\t {"v":1,"seq":20,"angle":60,"power":90,"fire":false}\r\n', 'a tab and a space before the object, a carriage return and a new line after it'],
  [pad('{"v":1,"seq":21,"angle":84,"power":11,"fire":true}', 200), 'padded with spaces to exactly 200 bytes, the most allowed', '\'{"v":1,"seq":21,"angle":84,"power":11,"fire":true}\' followed by 149 spaces'],
];

// [value, reason, what it is, how to show it]. Every text differs from every other.
const REFUSES = [
  [undefined, 'text', 'nothing', 'undefined'],
  [null, 'text', 'null, not text', 'null'],
  [42, 'text', 'the number 42, not text', '42'],
  [{ v: 1, seq: 2, angle: 45, power: 60, fire: true }, 'text', 'an object holding a valid input, not text'],
  [['{"v":1,"seq":3,"angle":45,"power":60,"fire":true}'], 'text', 'a list holding valid text', '[\'{"v":1,"seq":3,"angle":45,"power":60,"fire":true}\']'],
  [Buffer.from('{"v":1,"seq":4,"angle":45,"power":60,"fire":true}'), 'text', 'a Buffer holding the bytes of a valid input, not a string', 'Buffer.from(\'{"v":1,"seq":4,"angle":45,"power":60,"fire":true}\')'],
  [pad('{"v":1,"seq":23,"angle":45,"power":60,"fire":true}', 201), 'too-long', 'a valid input padded with spaces to 201 bytes', '\'{"v":1,"seq":23,"angle":45,"power":60,"fire":true}\' followed by 151 spaces'],
  [NOTE, 'too-long', 'an input with an extra field holding 80 letters é: 140 characters, but 220 bytes in UTF-8, where é takes two bytes', '\'{"v":1,"seq":24,"angle":45,"power":60,"fire":true,"note":"ééé...é"}\' (80 é)'],
  ['x'.repeat(1000), 'too-long', '1,000 letters x: too long, and not JSON either', '\'x\'.repeat(1000)'],
  ['', 'json', 'empty text'],
  ['{', 'json', 'an unfinished object'],
  ["{'v':1,'seq':25,'angle':45,'power':60,'fire':true}", 'json', 'single quotes, which JSON does not allow'],
  ['{"v":1,"seq":26,"angle":45,"power":60,"fire":true,}', 'json', 'a comma after the last field'],
  ['{"v":1,"seq":27,"angle":45,"power":60,"fire":tru}', 'json', 'true misspelled'],
  ['{"v":1,"seq":28,"angle":NaN,"power":60,"fire":true}', 'json', 'NaN, which JSON does not have'],
  ['{v:1,seq:29,angle:45,power:60,fire:true}', 'json', 'keys without quotes'],
  ['null', 'object', 'the JSON null'],
  ['[]', 'object', 'an empty list'],
  ['5', 'object', 'a number'],
  ['"x"', 'object', 'a string'],
  ['true', 'object', 'true'],
  ['[{"v":1,"seq":30,"angle":45,"power":60,"fire":true}]', 'object', 'a valid input inside a list'],
  ['{"v":1,"seq":31,"angle":45,"power":60,"fire":true,"hit":true}', 'keys', 'an extra field, hit'],
  ['{"v":1,"seq":32,"angle":45,"power":60,"fire":false,"score":99}', 'keys', 'an extra field, score'],
  ['{"v":1,"seq":33,"angle":45,"power":60,"fire":false,"wind":0}', 'keys', 'an extra field, wind'],
  ['{"v":1,"seq":34,"angle":45,"power":60}', 'keys', 'fire missing'],
  ['{}', 'keys', 'no fields at all'],
  ['{"V":1,"seq":35,"angle":45,"power":60,"fire":false}', 'keys', 'V in capitals instead of v'],
  ['{"v":1,"seq":36,"angle,fire":45,"power":60}', 'keys', 'one key named "angle,fire" instead of the two keys angle and fire'],
  ['{"v":1,"seq":37,"angle":45,"power":60,"fire":false,"__proto__":{"hit":true}}', 'keys', 'an extra field named __proto__'],
  ['{"v":2,"seq":38,"angle":45,"power":60,"fire":true}', 'version', 'v 2'],
  ['{"v":"1","seq":39,"angle":45,"power":60,"fire":true}', 'version', 'v "1", a string'],
  ['{"v":0,"seq":40,"angle":45,"power":60,"fire":true}', 'version', 'v 0'],
  ['{"v":true,"seq":41,"angle":45,"power":60,"fire":true}', 'version', 'v true'],
  ['{"v":1.5,"seq":42,"angle":45,"power":60,"fire":true}', 'version', 'v 1.5'],
  ['{"v":null,"seq":43,"angle":45,"power":60,"fire":true}', 'version', 'v null'],
  ['{"v":1,"seq":0,"angle":45,"power":60,"fire":true}', 'seq', 'seq 0'],
  ['{"v":1,"seq":1000001,"angle":45,"power":60,"fire":true}', 'seq', 'seq 1000001'],
  ['{"v":1,"seq":1.5,"angle":45,"power":60,"fire":true}', 'seq', 'seq 1.5'],
  ['{"v":1,"seq":"3","angle":45,"power":60,"fire":true}', 'seq', 'seq "3", a string'],
  ['{"v":1,"seq":-1,"angle":45,"power":60,"fire":true}', 'seq', 'seq -1'],
  ['{"v":1,"seq":null,"angle":45,"power":60,"fire":true}', 'seq', 'seq null'],
  ['{"v":1,"seq":44,"angle":4,"power":60,"fire":true}', 'angle', 'angle 4'],
  ['{"v":1,"seq":45,"angle":86,"power":60,"fire":true}', 'angle', 'angle 86'],
  ['{"v":1,"seq":46,"angle":45.5,"power":60,"fire":true}', 'angle', 'angle 45.5'],
  ['{"v":1,"seq":47,"angle":"45","power":60,"fire":true}', 'angle', 'angle "45", a string'],
  ['{"v":1,"seq":48,"angle":null,"power":60,"fire":true}', 'angle', 'angle null'],
  ['{"v":1,"seq":49,"angle":true,"power":60,"fire":true}', 'angle', 'angle true'],
  ['{"v":1,"seq":50,"angle":45,"power":9,"fire":true}', 'power', 'power 9'],
  ['{"v":1,"seq":51,"angle":45,"power":101,"fire":true}', 'power', 'power 101'],
  ['{"v":1,"seq":52,"angle":45,"power":60.5,"fire":true}', 'power', 'power 60.5'],
  ['{"v":1,"seq":53,"angle":45,"power":true,"fire":true}', 'power', 'power true'],
  ['{"v":1,"seq":54,"angle":45,"power":"60","fire":true}', 'power', 'power "60", a string'],
  ['{"v":1,"seq":55,"angle":45,"power":150,"fire":true}', 'power', 'power 150'],
  ['{"v":1,"seq":56,"angle":45,"power":60,"fire":1}', 'fire', 'fire 1'],
  ['{"v":1,"seq":57,"angle":45,"power":60,"fire":"true"}', 'fire', 'fire "true", a string'],
  ['{"v":1,"seq":58,"angle":45,"power":60,"fire":null}', 'fire', 'fire null'],
  ['{"v":1,"seq":59,"angle":45,"power":60,"fire":0}', 'fire', 'fire 0'],
  ['{"v":2,"seq":0,"angle":4,"power":9,"fire":1,"hit":true}', 'keys', 'an extra field, and v, seq, angle, power and fire all wrong'],
  ['{"v":1,"seq":60,"angle":86,"power":60,"fire":true,"hit":true}', 'keys', 'an extra field, and angle 86'],
  ['{"v":2,"seq":0,"angle":4,"power":9,"fire":1}', 'version', 'v, seq, angle, power and fire all wrong'],
  ['{"v":1,"seq":0,"angle":4,"power":9,"fire":1}', 'seq', 'seq, angle, power and fire wrong'],
  ['{"v":1,"seq":61,"angle":4,"power":9,"fire":1}', 'angle', 'angle, power and fire wrong'],
  ['{"v":1,"seq":62,"angle":45,"power":9,"fire":1}', 'power', 'power and fire wrong'],
  ['{"v":"1","seq":"63","angle":"45","power":"60","fire":"true"}', 'version', 'every value a string'],
  ['{"seq":"64","angle":"45","power":"60","fire":"true"}', 'keys', 'v missing, and every value a string'],
];


// ---------------------------------------------------------------- crafted states and facts

const S = (lastSeq, firedRound) => ({ lastSeq, firedRound });
const I = (seq, fire = false, angle = 45, power = 60) => ({ v: 1, seq, angle, power, fire });
const F = (tick, round, flying = false) => ({ tick, round, flying });

// [state, input, facts, outcome, what it is]
const ORDER = [
  [S(0, 0), I(1), F(14, 1), 'admitted', 'the first input of a session'],
  [S(1, 0), I(2, false, 47, 62), F(17, 1), 'admitted', 'the next seq'],
  [S(7, 0), I(7), F(40, 1), 'stale', 'the same seq as the last admitted input: a message received twice'],
  [S(7, 0), I(6), F(40, 1), 'stale', 'a lower seq: a message overtaken on the way by a later one'],
  [S(7, 0), I(1, true), F(41, 1), 'stale', 'seq 1 again, with fire: a replayed first message'],
  [S(7, 2), I(9), F(260, 3), 'admitted', 'seq 8 never arrived: a gap is fine'],
  [S(9, 2), I(500000, false, 50, 70), F(270, 3), 'admitted', 'a jump from seq 9 to seq 500000'],
  [S(999999, 4), I(1000000), F(900, 6), 'admitted', 'the largest seq'],
  [S(1000000, 4), I(1000000), F(901, 6), 'stale', 'the largest seq, again'],
  [S(3, 0), I(4, true, 41, 73), F(57, 1), 'admitted', 'the session\'s first fire'],
  [S(12, 3), I(13, false, 40, 70), F(400, 4), 'admitted', 'aiming in round 4, after round 3\'s shot'],
];
// A new seq refused for another reason: next is still the state, so lastSeq does not move.
const KEEPS = [
  [S(10, 3), I(11, false, 50, 70), F(240, 3, true), 'flying', 'a new seq, 11, while the shell is in the air: refused, so lastSeq stays 10'],
  [S(10, 3), I(11, true), F(250, 3), 'fired', 'a new seq, 11, firing again in round 3 after its shell has landed: refused, so lastSeq stays 10'],
];
// One session's inputs in arrival order, all in round 1 with no shot: [input, tick, outcome].
const ORDER_RUN = [
  [I(1), 10, 'admitted'], [I(2, false, 46, 61), 12, 'admitted'], [I(2, false, 46, 61), 12, 'stale'], [I(1), 13, 'stale'],
  [I(5, false, 47, 62), 15, 'admitted'], [I(4, false, 47, 61), 15, 'stale'], [I(5, false, 47, 62), 16, 'stale'],
  [I(6, false, 48, 63), 18, 'admitted'], [I(9, false, 49, 64), 21, 'admitted'],
];

const ROUNDS = [
  [S(10, 3), I(11, true), F(250, 3), 'fired', 'a second fire in round 3, after its shell has landed'],
  [S(10, 3), I(11, true), F(262, 4), 'admitted', 'a fire in round 4, after round 3\'s shot'],
  [S(10, 2), I(11, true), F(262, 4), 'admitted', 'a fire in round 4, after round 3 ended with no shot (firedRound is still 2)'],
  [S(10, 3), I(11, false, 50, 70), F(255, 3), 'admitted', 'aiming after round 3\'s shell has landed, before round 4 starts'],
  [S(10, 3), I(11), F(240, 3, true), 'flying', 'aiming while the shell is in the air'],
  [S(10, 3), I(11, true), F(240, 3, true), 'flying', 'a second fire while the shell is in the air: flying comes before fired'],
  [S(10, 2), I(11, true, 50, 70), F(241, 3, true), 'flying', 'a fire while a shell is in the air, though the state says round 3 has no shot'],
  [S(10, 3), I(10, true), F(242, 3, true), 'stale', 'an old seq, firing, while the shell is in the air: stale comes before flying'],
  [S(10, 3), I(9, true), F(250, 3), 'stale', 'an old seq with a second fire: stale comes before fired'],
];
// Rounds 5 and 6 of a session, chained the way the server chains them: [input, facts, outcome].
const ROUNDS_RUN = [
  [I(41, false, 44, 62), F(500, 5), 'admitted'],
  [I(42, true, 44, 64), F(510, 5), 'admitted'],
  [I(43, false, 50, 70), F(510, 5, true), 'flying'],
  [I(44, true, 44, 64), F(530, 5, true), 'flying'],
  [I(45, false, 46, 66), F(560, 5), 'admitted'],
  [I(46, true, 46, 66), F(565, 5), 'fired'],
  [I(47, true, 47, 66), F(600, 6), 'admitted'],
  [I(48, true, 47, 66), F(601, 6, true), 'flying'],
  [I(47, true, 47, 66), F(640, 6), 'stale'],
];

function checkAdmit(admit, state, input, facts, outcome, { checked, what, workDir }) {
  const before = structuredClone(state);
  const want = decision(outcome, before, input, facts);
  const text = `admit(${show(state)}, ${show(input)}, ${show(facts)}): ${what}`;
  const got = call(() => admit(state, input, facts), { checked, input: text, expected: show(want), workDir });
  if (!same(got, want)) {
    fail({ checked, input: text, observed: `yours returned ${show(got)}`, expected: `${show(want)}: ${decisionWhy(outcome, before, input, facts)}${outcome === 'admitted' ? '' : '. A refusal\'s next equals the state it was given, whatever the reason: a refused message changes nothing, lastSeq included'}`, diff: firstDifference(got, want) });
  }
  if (!same(state, before)) {
    fail({ checked: 'admit never changes the state object it is given', input: text, observed: `the state object was ${show(before)} before the call and ${show(state)} after it`, expected: 'unchanged: the server keeps it, and a refused input must leave it as it was. Return a new object as next' });
  }
  return got;
}

function runAdmit(admit, rows, checked, workDir) {
  for (const [state, input, facts, outcome, what] of rows) checkAdmit(admit, state, input, facts, outcome, { checked, what, workDir });
}

function runChained(admit, start, steps, checked, about, workDir) {
  let state = structuredClone(start);
  steps.forEach(([input, facts, outcome], k) => {
    const what = `${about}: input ${k + 1} of ${steps.length}, with the state your admit returned as next for the input before`;
    const got = checkAdmit(admit, state, input, facts, outcome, { checked, what, workDir });
    state = got.next;
  });
}

// ---------------------------------------------------------------- records

let recordsFixture = null;
const records = () => recordsFixture ??= readJson('checks/fixtures/12/records.json');
const fixtureText = (kind, f) => `checks/fixtures/12/records.json, ${kind} record "${f.name}": ${f.about ?? f.what}`;
const tryIt = (f) => `node lab.mjs replay PROJECT checks/fixtures/12/records.json --name ${f.name}`;

function expectedRecord(entry) {
  const inputs = entry.decisions
    .filter((e) => e.decision?.status === 'admitted')
    .map((e, i) => ({ n: i + 1, tick: e.tick, seq: e.parsed.input.seq, angle: e.parsed.input.angle, power: e.parsed.input.power, fire: e.parsed.input.fire }));
  return { v: 1, game: 'lob', mode: 9, seed: entry.seed, inputs, end: entry.session.tick, final: entry.session.final() };
}

// Your admission, with each call's own failure reported with the moment it happened.
function guarded(adm, where, workDir) {
  return {
    parseInput: (text) => call(() => adm.parseInput(text), { checked: `your parseInput, while the server ran ${where()}`, input: `parseInput(${quoted(text)})`, expected: '{ ok: true, input } or { ok: false, reason } (12.parse-accepts and 12.parse-refuses check it)', workDir }),
    admit: (state, input, facts) => call(() => adm.admit(state, input, facts), { checked: `your admit, while the server ran ${where()}`, input: `admit(${show(state)}, ${show(input)}, ${show(facts)})`, expected: 'a decision (12.admit-order and 12.admit-rounds check it)', workDir }),
  };
}
function guardedRecorder(createRecorder, where, workDir) {
  return (options) => {
    const r = call(() => createRecorder(options), { checked: 'createRecorder, called by the server for a new session', input: `createRecorder(${show(options)}) for ${where()}`, expected: '{ admitted(tick, input), finish(end, final) }', workDir });
    if (!r || typeof r.admitted !== 'function' || typeof r.finish !== 'function') {
      fail({ checked: 'what createRecorder returns', input: `createRecorder(${show(options)}) for ${where()}`, observed: show(r), expected: 'an object with the functions admitted(tick, input) and finish(end, final)' });
    }
    return {
      admitted: (tick, input) => call(() => r.admitted(tick, input), { checked: 'your recorder\'s admitted(tick, input)', input: `admitted(${tick}, ${show(input)}) in ${where()}`, expected: 'it notes the input', workDir }),
      finish: (end, final) => call(() => r.finish(end, final), { checked: 'your recorder\'s finish(end, final)', input: `finish(${end}, ${show(final)}) in ${where()}`, expected: 'the record', workDir }),
    };
  };
}

// Your admission as replay is given it, with the facts.tick of every admit call noted in
// order. Your own functions do the deciding.
function tickWatch(adm) {
  const ticks = [];
  return {
    ticks,
    admission: {
      parseInput: (text) => adm.parseInput(text),
      admit: (state, input, facts) => {
        ticks.push(facts !== null && typeof facts === 'object' ? facts.tick : undefined);
        return adm.admit(state, input, facts);
      },
    },
  };
}
const TICK_RULE = 'An input\'s tick is the number of ticks the session had run when it was applied: inputs apply before the frames of their tick. Re-check and apply the inputs of tick t, then step() takes the session from t to t + 1 ticks, and give admit the facts { tick, round, flying } of that moment';

// Each admit call's facts.tick against the tick of the input it re-checks, in order. (A
// record without a list of inputs is for the replay's own answer, or 12.recorder, to judge.)
function checkTicks(ticks, record, input) {
  const inputs = Array.isArray(record?.inputs) ? record.inputs : [];
  for (let i = 0; i < Math.min(ticks.length, inputs.length); i++) {
    const x = inputs[i];
    if (x === null || typeof x !== 'object' || ticks[i] === x.tick) continue;
    const d = typeof ticks[i] === 'number' ? ticks[i] - x.tick : null;
    fail({
      checked: 'replay re-checks each input at its own tick',
      input,
      observed: `input n ${x.n} (seq ${x.seq}${x.fire ? ', a fire' : ''}) is re-checked by admit call ${i + 1}, and your replay gave it facts.tick ${show(ticks[i])}`,
      expected: `facts.tick ${x.tick}, the input's tick in the record. ${TICK_RULE}`,
      diff: d === null ? 'facts.tick must be the number of ticks the session has run' : d > 0 ? `yours is ${plural(d, 'tick')} after the record's: the frames of tick ${x.tick} ran before this input was re-checked` : `yours is ${plural(-d, 'tick')} before the record's`,
    });
  }
}
// After the replay's answer: admit called once for every input.
function checkAdmitCount(ticks, record, input) {
  if (!Array.isArray(record?.inputs)) return;
  const n = record.inputs.length;
  if (ticks.length === n) return;
  fail({
    checked: 'replay re-checks each input with your admit',
    input,
    observed: ticks.length === 0 ? 'your replay never called admit' : `your replay called admit ${plural(ticks.length, 'time')} for ${plural(n, 'input')}`,
    expected: 'admit called once for each input, in order: replay re-checks every input with your parseInput and your admit at its moment of the replay, as the server did when it admitted it',
  });
}
// What to look at when a genuine record does not replay to its final. `early` is a record
// finished while its session was still playing.
function genuineHint(out, early) {
  const reason = out?.ok === true ? 'final' : out?.ok === false ? out.reason : null;
  if (reason === 'order') return '. A genuine record is in order: n runs 1, 2, 3, ..., ticks never go down and stay below end, seq goes up (gaps are fine)';
  if (reason === 'refused') return '. Every input was admitted when it was recorded: apply each before the frames of its tick, read facts from the session at that moment, and carry admit\'s next to the next input';
  if (reason === 'shape') return '. A genuine record has v 1, game \'lob\', mode 9, and every field with the right type, at the top level, in each input and in final';
  if (reason !== 'final') return '';
  if (early) return '. This record was finished while the session was still playing, and two mistakes give another final here: applying an input after the frames of its tick instead of before them (apply the inputs of tick t, then step() takes the session from t to t + 1 ticks), and running past end (run exactly end ticks, not until the session is over)';
  return '. Run exactly end ticks from createLobSession({ seed, mode }), applying the inputs of tick t before step() takes the session from t to t + 1 ticks';
}

// Copies of a record your recorder made, each changed in one way whose reason API.md's
// rules fix, whatever the session: { name, reason, what, why, record }.
function ownTampers(record) {
  const out = [];
  const mid = Math.floor(record.inputs.length / 2);
  const tamper = (name, reason, change) => {
    const copy = structuredClone(record);
    const { what, why } = change(copy);
    out.push({ name, reason, what, why, record: copy });
  };
  tamper('edited-power', 'final', (r) => {
    const x = r.inputs.at(-1);
    const was = x.power;
    x.power = was <= 90 ? was + 10 : was - 10;
    return {
      what: `the last input, n ${x.n} at tick ${x.tick}, changed from power ${was} to power ${x.power}; final left as recorded`,
      why: `power ${x.power} is legal and nothing else about the input changed, so admit admits it at its moment and the replay plays to end; nothing after the last input changes the power, so the replayed final has power ${x.power}, and the record's says ${show(record.final?.power)}`,
    };
  });
  tamper('power-150', 'refused', (r) => {
    const x = r.inputs[mid];
    const was = x.power;
    x.power = 150;
    return {
      what: `input n ${x.n}, at tick ${x.tick}, changed from power ${was} to power 150`,
      why: 'the shape and order are as before (150 is a whole number), and your parseInput refuses power 150 when the replay re-checks that input',
    };
  });
  tamper('swapped-inputs', 'order', (r) => {
    let k = r.inputs.findIndex((x, i) => i >= mid && i + 1 < r.inputs.length && r.inputs[i + 1].tick !== x.tick);
    if (k < 0) k = r.inputs.findIndex((x, i) => i + 1 < r.inputs.length && r.inputs[i + 1].tick !== x.tick);
    const [a, b] = [r.inputs[k], r.inputs[k + 1]];
    const was = `n ${a.n} (tick ${a.tick}, seq ${a.seq}) and n ${b.n} (tick ${b.tick}, seq ${b.seq})`;
    [r.inputs[k], r.inputs[k + 1]] = [b, a];
    r.inputs.forEach((x, i) => { x.n = i + 1; });
    return {
      what: `inputs ${was} swapped, then n numbered 1, 2, 3, ... again`,
      why: `the tick goes down from ${b.tick} to ${a.tick}, and seq from ${b.seq} to ${a.seq}`,
    };
  });
  tamper('extra-key', 'shape', (r) => {
    r.note = 'trust me';
    return { what: 'an extra top-level field: "note": "trust me"', why: 'a record has exactly the fields v, game, mode, seed, inputs, end and final' };
  });
  tamper('input-extra-key', 'shape', (r) => {
    const x = r.inputs[mid];
    x.hit = true;
    return { what: `an extra field in input n ${x.n}: "hit": true`, why: 'an input has exactly the fields n, tick, seq, angle, power and fire' };
  });
  return out;
}
// Whether ownTampers can alter this record: a list of at least two inputs, each an object,
// with two neighbouring inputs at different ticks.
const alterable = (r) => Array.isArray(r?.inputs) && r.inputs.length >= 2 && r.inputs.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x))
  && r.inputs.some((x, i) => i + 1 < r.inputs.length && r.inputs[i + 1].tick !== x.tick);

// ---------------------------------------------------------------- the cases

export const cases = [
  {
    id: '12.parse-accepts',
    title: 'parseInput accepts every well-formed input, limits included',
    requirement: 'For text holding a JSON object with exactly the keys v, seq, angle, power and fire (in any order, with any JSON spacing, at most 200 bytes) where v is 1, seq a whole number from 1 to 1,000,000, angle from 5 to 85, power from 10 to 100 and fire true or false, parseInput returns { ok: true, input }, where input holds exactly those five fields with the values sent.',
    timeLimitMs: 10000,
    async run({ fn, workDir }) {
      const parseInput = await fn('server/admission.mjs', 'parseInput');
      for (const [text, what, display] of ACCEPTS) {
        const want = { ok: true, input: fiveFields(text) };
        const input = `parseInput(${display ?? quoted(text)}): ${what}, ${plural(Buffer.byteLength(text, 'utf8'), 'byte')}`;
        const got = call(() => parseInput(text), { checked: 'parseInput accepts a well-formed input', input, expected: show(want), workDir });
        if (!same(got, want)) fail({ checked: 'parseInput accepts a well-formed input', input, observed: `yours returned ${show(got)}`, expected: `${show(want)}: a new object holding exactly v, seq, angle, power and fire, with the values sent, and nothing else in the answer`, diff: firstDifference(got, want) });
      }
    },
  },
  {
    id: '12.parse-refuses',
    title: 'parseInput refuses everything else, with the first reason in API.md\'s order',
    requirement: 'parseInput returns { ok: false, reason } with the first failing reason in this order: text (not a string), too-long (over 200 bytes in UTF-8), json, object (null, a list, a number, a string), keys (not exactly v, seq, angle, power, fire), version (v not the number 1), seq, angle, power (not a whole number in range; "45" is not a number), fire (not true or false). Checked at the limits (angle 4 and 86, power 9 and 101, seq 0 and 1,000,001, 201 bytes) and with several faults at once.',
    timeLimitMs: 10000,
    async run({ fn, workDir }) {
      const parseInput = await fn('server/admission.mjs', 'parseInput');
      for (const [value, reason, what, display] of REFUSES) {
        const want = { ok: false, reason };
        const input = `parseInput(${display ?? quoted(value)}): ${what}`;
        const got = call(() => parseInput(value), { checked: `parseInput refuses with reason ${reason}`, input, expected: show(want), workDir });
        if (!same(got, want)) {
          const several = got && got.ok === false && PARSE_REASONS.includes(got.reason) && got.reason !== reason;
          fail({ checked: `parseInput refuses with reason ${reason}`, input, observed: `yours returned ${show(got)}`, expected: `${show(want)}: ${WHY[reason]}${several ? `. ${ORDER_NOTE}` : ''}`, diff: firstDifference(got, want) });
        }
      }
    },
  },
  {
    id: '12.admit-order',
    title: 'admit refuses old and repeated messages and never changes the state it is given',
    requirement: 'admit(state, input, facts) refuses an input whose seq is not above state.lastSeq: { status: \'refused\', reason: \'stale\', next } with next equal to state. Gaps in seq are fine. An admitted input gives { status: \'admitted\', next: { lastSeq: input.seq, firedRound: input.fire ? facts.round : state.firedRound } }. A refusal for any reason leaves next equal to state, so a new seq refused as flying or fired does not move lastSeq. admit never changes the state object it is given.',
    timeLimitMs: 10000,
    async run({ fn, workDir }) {
      const admit = await fn('server/admission.mjs', 'admit');
      runAdmit(admit, ORDER, 'admit and the order of messages', workDir);
      runAdmit(admit, KEEPS, 'a refusal for any reason leaves the state as it was, lastSeq included', workDir);
      runChained(admit, S(0, 0), ORDER_RUN.map(([input, tick, outcome]) => [input, F(tick, 1), outcome]), 'admit over one session\'s messages, chained as the server chains them', 'nine messages in round 1, some repeated or overtaken', workDir);
    },
  },
  {
    id: '12.admit-rounds',
    title: 'admit allows one shot per round and nothing while the shell flies',
    requirement: 'In API.md\'s order: stale (seq not above state.lastSeq), then flying (anything while facts.flying is true), then fired (input.fire is true and state.firedRound === facts.round). A fire in a later round is admitted, and so is aiming after the round\'s shell has landed. A refusal\'s next equals the state.',
    timeLimitMs: 10000,
    async run({ fn, workDir }) {
      const admit = await fn('server/admission.mjs', 'admit');
      runAdmit(admit, ROUNDS, 'admit and the one shot a round', workDir);
      runChained(admit, S(40, 4), ROUNDS_RUN, 'admit over rounds 5 and 6 of a session, chained as the server chains them', 'aim, fire, two messages while the shell flies, aim after it lands, a second fire, the next round\'s fire, a message while that shell flies, that fire replayed', workDir);
    },
  },
  {
    id: '12.clients',
    title: 'Through the real server, your admission refuses every cheat and admits every honest input',
    requirement: 'The supplied honest skilled player and the four protocol cheats (public/adversaries.mjs) play 3 sessions each through createLobServer with your admission and the full view, 30 ms each way, no jitter. Every decision must be the one API.md\'s rules give: every honest input admitted; every cheating input refused with its reason (hitClaim: keys; fireTwice: flying, then fired; outOfRange: power and angle; replay: stale); the cheats\' ordinary inputs admitted; no session ends with more shots than rounds.',
    timeLimitMs: 20000,
    async run(env) {
      const { workDir } = env;
      const learner = await admissionOf(env);
      const fx = readJson('checks/fixtures/12/clients.json');
      const count = {};
      for (const expect of fx.sessions) {
        const { client: name, seed } = expect;
        count[name] = (count[name] ?? 0) + 1;
        const about = `${CLIENTS[name].about}, session ${count[name]} (server seed ${seed})`;
        const refusals = new Map(expect.refused.map(([k, reason, text]) => [k, { reason, text }]));
        let k = -1;
        let server = null;
        let currentText = '';
        const where = () => `tick ${server?.sessions[0]?.session.tick}, message ${k + 1} of the session: the server received ${quoted(currentText)}`;
        const kindOf = (want) => (name === 'skilled' ? 'an honest input' : want ? 'a cheating input' : `an ordinary input from ${name}`);
        const watched = {
          parseInput(text) {
            k += 1;
            currentText = text;
            const want = refusals.get(k);
            if (want && want.text !== text) fail({ checked: `${about}: the session runs as the course's did`, input: sessionText(name, seed), observed: `message ${k + 1} is ${quoted(text)}`, expected: `${quoted(want.text)} (report this: the check's fixture does not match this copy of the course)` });
            const expected = want && PARSE_REASONS.includes(want.reason) ? { ok: false, reason: want.reason } : { ok: true, input: fiveFields(text) };
            const input = `${where()}. The session: ${sessionText(name, seed)}`;
            const checked = `what your parseInput said about ${kindOf(want)}: ${about}`;
            const got = call(() => learner.parseInput(text), { checked, input, expected: show(expected), workDir });
            if (!same(got, expected)) {
              const why = expected.ok ? (want ? `it is well formed (admit refuses it: ${want.reason})` : 'it is well formed') : `${WHY[want.reason]}${want.reason === 'keys' ? ` (it has ${Object.keys(JSON.parse(text)).join(', ')})` : ''}`;
              fail({ checked, input, observed: `yours returned ${show(got)}`, expected: `${show(expected)}: ${why}`, diff: firstDifference(got, expected) });
            }
            return got;
          },
          admit(state, input, facts) {
            const want = refusals.get(k);
            const outcome = want ? want.reason : 'admitted';
            const before = structuredClone(state);
            const expected = decision(outcome, before, input, facts);
            const text = `${where()}. admit(${show(state)}, ${show(input)}, ${show(facts)}). The session: ${sessionText(name, seed)}`;
            const checked = `what your admit decided for ${kindOf(want)}: ${about}`;
            const got = call(() => learner.admit(state, input, facts), { checked, input: text, expected: show(expected), workDir });
            if (!same(got, expected)) fail({ checked, input: text, observed: `yours returned ${show(got)}`, expected: `${show(expected)}: ${decisionWhy(outcome, before, input, facts)}`, diff: firstDifference(got, expected) });
            if (!same(state, before)) fail({ checked: 'admit never changes the state object it is given', input: text, observed: `the state object was ${show(before)} before the call and ${show(state)} after it`, expected: 'unchanged: return a new object as next' });
            return got;
          },
        };
        const { result } = playClient(CLIENTS[name].make(mixSeed(seed, 2)), seed, watched, { onServer: (s) => { server = s; } });
        if (k + 1 !== expect.decisions) fail({ checked: `${about}: the session runs as the course's did`, input: sessionText(name, seed), observed: `the server received ${plural(k + 1, 'message')}`, expected: `${expect.decisions} (report this: the check's fixture does not match this copy of the course)` });
        const { shots, round } = result.final;
        if (shots > round) fail({ checked: `${about}: no more shots than rounds`, input: sessionText(name, seed), observed: `the session ended at round ${round} with ${plural(shots, 'shot')}`, expected: 'at most one shot a round' });
      }
    },
  },
  {
    id: '12.recorder',
    title: 'The record holds exactly the admitted inputs, numbered, with their ticks',
    requirement: 'Fed by the server (createLobServer\'s recorder option) through three sessions on one server, decided by your admission (a skilled player, the outOfRange client whose refused copies must not appear, and a skilled session recorded after 2 rounds while still playing), finish returns exactly { v: 1, game: \'lob\', mode: 9, seed, inputs, end, final }: seed and mode as createRecorder was given them; inputs the admitted inputs in order, each exactly { n, tick, seq, angle, power, fire }, numbered n = 1, 2, 3, ..., with the tick the server passed to admitted(tick, input); end and final as the server passed them to finish(end, final). A record is plain JSON, and one session\'s record holds nothing of another\'s.',
    timeLimitMs: 20000,
    async run(env) {
      const { workDir } = env;
      const createRecorder = await env.fn('server/recorder.mjs', 'createRecorder');
      const learner = await admissionOf(env);
      const seed = 1231;
      const plan = [
        ['skilled', 'the honest skilled player', Infinity],
        ['outOfRange', 'the outOfRange client', Infinity],
        ['skilled', 'the honest skilled player, recorded after 2 rounds while the session is still playing', 2],
      ];
      let current = '';
      const server = createLobServer({ seed, admission: guarded(learner, () => current, workDir), view: fullView, recorder: guardedRecorder(createRecorder, () => current, workDir) });
      const runs = plan.map(([name, about, rounds], i) => {
        const clientSeed = seed * 10 + i + 1;
        current = `session ${i + 1} on one server (createLobServer({ seed: ${seed}, admission: yours, view: fullView, recorder: your createRecorder })): ${about}, ${clientCall(name, clientSeed)}, links mixSeed(${clientSeed}, 3) and mixSeed(${clientSeed}, 4), 30 ms each way, no jitter`;
        const result = playSession({ server, client: CLIENTS[name].make(mixSeed(clientSeed, 2)), up: link({ seed: mixSeed(clientSeed, 3), ...NET }), down: link({ seed: mixSeed(clientSeed, 4), ...NET }), rounds });
        return { about: current, token: result.token };
      });
      for (const run of runs) {
        const entry = server.session(run.token);
        const want = expectedRecord(entry);
        const record = server.record(run.token);
        const refused = entry.decisions.length - want.inputs.length;
        const input = `${run.about}. The server admitted ${plural(want.inputs.length, 'input')} and refused ${refused}; it called finish(${want.end}, ${show(want.final)})`;
        const problem = notJson(record, 'record');
        if (problem) fail({ checked: 'the record is plain JSON', input, observed: problem, expected: 'plain objects, lists, numbers, strings, true, false and null only: the lab saves records to files and reads them back' });
        if (!same(record, want)) {
          fail({ checked: 'the record finish returns', input, observed: `yours: ${recordSummary(record)}`, expected: recordSummary(want), diff: firstDifference(record, want) });
        }
      }
    },
  },
  {
    id: '12.replay-genuine',
    title: 'Genuine records replay to their final',
    requirement: 'replay(record, admission), given your admission, re-runs each genuine record in checks/fixtures/12/records.json from its seed with public/session.mjs, applying each input before the frames of its tick, for end ticks, and returns { ok: true, final } with the record\'s final ({ round, score, shots, angle, power }). Each input is re-checked by one call of your admit, in order, whose facts.tick is the input\'s tick. The records include two inputs applied in one tick, a round that ended with no shot, and seqs with gaps (lost and overtaken messages).',
    timeLimitMs: 20000,
    async run(env) {
      const { workDir } = env;
      const replay = await env.fn('server/recorder.mjs', 'replay');
      const adm = await admissionOf(env);
      for (const g of records().genuine) {
        const want = { ok: true, final: g.record.final };
        const input = `replay(record, { parseInput, admit }) with your admission: ${fixtureText('genuine', g)}. ${plural(g.record.inputs.length, 'input')}, end ${g.record.end}. To see it yourself: ${tryIt(g)}`;
        const watch = tickWatch(adm);
        const out = call(() => replay(structuredClone(g.record), watch.admission), { checked: 'replay of a genuine record', input, expected: show(want), workDir });
        checkTicks(watch.ticks, g.record, input);
        if (!same(out, want)) fail({ checked: 'replay of a genuine record', input, observed: `yours returned ${show(out)}`, expected: `${show(want)}${genuineHint(out, false)}`, diff: firstDifference(out, want) });
        checkAdmitCount(watch.ticks, g.record, input);
      }
    },
  },
  {
    id: '12.replay-tampered',
    title: 'Tampered records are refused with the right reason',
    requirement: 'replay refuses each tampered record in checks/fixtures/12/records.json with { ok: false, reason }, checking in this order: shape (v 1, game \'lob\', mode 9; every field present with the right type and none extra, at the top level, in each input and in final; seed from 0 to 4,294,967,295; end and every tick 0 or more), order (n exactly 1, 2, ..., k; ticks never go down and stay below end; seq goes up), refused (your parseInput or admit refuses an input when it is re-checked at its moment of the replay), final (the replayed final differs in any field). Two records pass every check but admission: one with a second fire after the shell landed and its final recomputed to match, one with a fire while the shell flies.',
    timeLimitMs: 20000,
    async run(env) {
      const { workDir } = env;
      const replay = await env.fn('server/recorder.mjs', 'replay');
      const adm = await admissionOf(env);
      for (const t of records().tampered) {
        const want = { ok: false, reason: t.reason };
        const input = `replay(record, { parseInput, admit }) with your admission: ${fixtureText('tampered', t)}. To see it yourself: ${tryIt(t)}`;
        const out = call(() => replay(structuredClone(t.record), adm), { checked: `replay refuses a tampered record (${t.name})`, input, expected: show(want), workDir });
        if (!same(out, want)) fail({ checked: `replay refuses a tampered record (${t.name})`, input, observed: `yours returned ${show(out)}`, expected: `${show(want)}. The reasons are checked in order: shape, order, refused, final; the first that fails names the reason`, diff: firstDifference(out, want) });
      }
    },
  },
  {
    id: '12.replay-own',
    title: 'Records your recorder makes replay with your replay, even one finished early, and altered copies are refused',
    requirement: 'A record your recorder makes through the server (with your admission) replays with your replay and admission to { ok: true, final } with the session\'s final, each input re-checked by one call of your admit whose facts.tick is the input\'s tick: a whole expert session, and an outOfRange session the server recorded after 3 rounds while it was still playing. A replay runs exactly end ticks, not until the session is over. Copies of each record, altered at check time, are refused with the reason API.md\'s rules give: the last input\'s power changed to another legal value (final), one input\'s power set to 150 (refused), two neighbouring inputs with different ticks swapped (order), an extra top-level field (shape), an extra field in one input (shape).',
    timeLimitMs: 20000,
    async run(env) {
      const { workDir } = env;
      const createRecorder = await env.fn('server/recorder.mjs', 'createRecorder');
      const replay = await env.fn('server/recorder.mjs', 'replay');
      const learner = await admissionOf(env);
      const plan = [
        [1241, 'expert', 'the honest expert player, the whole session', Infinity, (s) => makePlayer('expert', s)],
        [1242, 'outOfRange', 'the outOfRange client, recorded by the server after 3 rounds while still playing', 3, outOfRange],
      ];
      for (const [seed, name, about, rounds, make] of plan) {
        const session = `${about}: ${sessionText(name, seed, ', recorder: your createRecorder')}${rounds === Infinity ? '' : `, played with playSession({ ..., rounds: ${rounds} })`}`;
        const where = () => session;
        const { result, entry } = playClient(make(mixSeed(seed, 2)), seed, guarded(learner, where, workDir), { recorder: guardedRecorder(createRecorder, where, workDir), rounds });
        const record = result.record;
        const final = entry.session.final();
        const early = !entry.session.over();
        const want = { ok: true, final };
        const input = `replay(record, { parseInput, admit }) with your admission, record being what your recorder returned for ${session}. The session ran ${plural(entry.session.tick, 'tick')}; it ${early ? 'was still playing' : 'was over'} when the server called finish`;
        const watch = tickWatch(learner);
        const out = call(() => replay(structuredClone(record), watch.admission), { checked: 'replay of a record your recorder made', input, expected: show(want), workDir });
        checkTicks(watch.ticks, record, input);
        if (!same(out, want)) fail({ checked: 'replay of a record your recorder made', input, observed: `yours returned ${show(out)}`, expected: `${show(want)}: the session's own final after ${record?.end ?? 'end'} ticks${genuineHint(out, early)}`, diff: firstDifference(out, want) });
        checkAdmitCount(watch.ticks, record, input);
        if (!alterable(record)) {
          fail({ checked: 'the record your recorder made can be altered for the refusal tests', input: `${session}: your record ${recordSummary(record)}`, observed: 'it has no list of inputs with two neighbouring inputs at different ticks', expected: 'the record API.md gives, whose inputs list holds every admitted input (12.recorder checks it)' });
        }
        for (const t of ownTampers(record)) {
          const wantRefusal = { ok: false, reason: t.reason };
          const checked = `replay refuses an altered copy of a record your recorder made (${t.name})`;
          const altered = `replay(altered, { parseInput, admit }) with your admission, altered being a copy of the record your recorder returned for ${session}, with one change: ${t.what}`;
          const got = call(() => replay(structuredClone(t.record), learner), { checked, input: altered, expected: show(wantRefusal), workDir });
          if (!same(got, wantRefusal)) fail({ checked, input: altered, observed: `yours returned ${show(got)}`, expected: `${show(wantRefusal)}: ${t.why}. The reasons are checked in order: shape, order, refused, final; the first that fails names the reason`, diff: firstDifference(got, wantRefusal) });
        }
      }
    },
  },
];
