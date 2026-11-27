/* eslint-disable no-unused-vars -- later modules use these imports and parameters */
// The engine: one loop that plays the game level by level. Code does the work:
// it reads the game's memory, takes the game's code apart, and tests everything it
// finds against the game before relying on it. Where more than one thing is worth
// trying, the decision model picks which to try first. Every level has a budget of
// rounds and shots, so a poor order can run out.
//
// kit: what the engine has learned so far. Plain data, carried from level to level.
// env: { models, log }, handed in by the lab and the checks. models.decide is the
//      decision model, or a stand-in for one.
// Every function throws "not written yet" until you write it. API.md has the details.
import * as S from './scan.mjs';
import { findValues } from './find.mjs';
import {
  testShot,
  fitShots,
  predictFit,
  judgeFit,
  nearest,
  search,
  LIMITS,
} from './learn.mjs';
import { parseModule } from './wasm.mjs';
import {
  liftAll,
  place,
  placeKey,
  parts,
  loadsIn,
  xrefs,
  overlay,
} from './lift.mjs';
import {
  launchOf,
  aimValues,
  flightOf,
  simulator,
  decoding,
  windWord,
  resolve,
} from './flight.mjs';
import {
  flagOf,
  readerFrom,
  readState,
  checkReader,
  aimBand,
} from './reader.mjs';
import {
  moverOf,
  flagPath,
  judgeMotion,
  lead,
  ready,
  FRAME_BUDGET,
} from './race.mjs';

export const PRACTICE = [
  [30, 70],
  [50, 60],
  [40, 85],
  [60, 75],
  [25, 90],
  [45, 50],
  [65, 95],
  [35, 60],
  [55, 80],
  [70, 65],
  [20, 75],
  [50, 95],
  [40, 55],
  [60, 90],
];
export const CHECK_SHOTS = [
  [30, 70],
  [55, 80],
  [40, 85],
];
// Powers for sighting shots at the lowest angle: none of them can reach a flag.
export const SIGHTERS = [70, 55, 40];
// region: given-keys
const KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyN',
  'Space',
];

const { parseStatus } = S;
const say = (env, rung, step, result) => {
  env.log?.({ rung, step, result });
};
// "1 round", "2 rounds": a count and its word, for the log.
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const newRound = (host, kit) => {
  host.press(kit.controls.new_round);
  host.tick(2);
};
// endregion: given-keys
function readAt(host, addr, type) {
  const m = host.memory();
  const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
  return type === 'f32'
    ? view.getFloat32(addr, true)
    : view.getInt32(addr, true);
}

// Two hosts run the same game when their files are the same bytes.
export function gameId(host) {
  const bytes = host.binary();
  let sum = 0;
  for (const b of bytes) sum = (sum * 31 + b) >>> 0;
  return `${bytes.length}:${sum}`;
}

// ---------- the budget ----------

export class OutOfBudget extends Error {}

// What a level leaves for learning: its budget less what the scored rounds need.
// region: given-allowance
export function allowance(level) {
  return {
    rounds: level.budget.rounds - level.rounds,
    shots: level.budget.shots - level.rounds,
  };
}
// endregion: given-allowance

// The host the engine learns with. It counts every key press, and once the kit
// knows which keys start a round and fire, it refuses (throws OutOfBudget) a press
// that would spend more than the allowance `left`.
// region: given-metered
export function metered(host, kit, left) {
  const presses = {};
  const spent = () => ({
    rounds: presses[kit.controls?.new_round] ?? 0,
    shots: presses[kit.controls?.fire] ?? 0,
  });
  const wrapped = {
    binary: () => host.binary(),
    memory: () => host.memory(),
    screen: () => host.screen(),
    write: (addr, type, value) => host.write(addr, type, value),
    tick: (frames) => host.tick(frames),
    press(key) {
      if (kit.controls) {
        const s = spent();
        if (key === kit.controls.new_round && s.rounds >= left.rounds)
          throw new OutOfBudget(
            `out of rounds: ${left.rounds} were left for learning`,
          );
        if (key === kit.controls.fire && s.shots >= left.shots)
          throw new OutOfBudget(
            `out of shots: ${left.shots} were left for learning`,
          );
      }
      presses[key] = (presses[key] ?? 0) + 1;
      host.press(key);
    },
  };
  return { host: Object.freeze(wrapped), spent };
}
// endregion: given-metered

// ---------- module 01: the controls ----------
// Lesson 01 fills the four regions below. A listing replaces everything
// between one pair of region markers; keep the markers.

// Press each key but Space and watch what changes on the status line.
// region: probe-controls
function probeControls(host, kit) {
  const found = {};
  for (const key of KEYS.filter((k) => k !== 'Space')) {
    const before = S.snapshot(host.memory());
    host.press(key);
    host.tick(2);
    const after = S.snapshot(host.memory());
    for (const s of S.changedStrings(before, after)) {
      const was = S.readCString(before, s.addr);
      const label = S.changedLabel(was, s.text);
      if (label === 'angle' || label === 'power') {
        // Only the status line puts ANGLE or POWER before a change.
        const up = parseStatus(s.text)[label] > parseStatus(was)[label];
        found[`${label}_${up ? 'up' : 'down'}`] = key;
        kit.statusLine = s.addr;
      } else if (/^ROUND/.test(s.text)) found.new_round = key;
    }
  }
  // The one key that named nothing fires. It is never pressed here.
  found.fire = KEYS.find((k) => !Object.values(found).includes(k));
  const six = ['angle_up', 'angle_down', 'power_up', 'power_down'];
  six.push('new_round', 'fire');
  return six.every((name) => found[name]) ? found : null;
}
// endregion: probe-controls

// The message is the string, in the game's own capitals, that changes when
// a new round starts.
// region: find-message
function findMessage(host, kit) {
  const before = S.snapshot(host.memory());
  newRound(host, kit);
  const after = S.snapshot(host.memory());
  const message = S.changedStrings(before, after).find(
    (s) => s.addr !== kit.statusLine && /^[A-Z][^a-z]*$/.test(s.text),
  );
  kit.message = message ? message.addr : null;
}
// endregion: find-message

// Do the keys in the kit still do what they did? Step the angle and the power one
// way and back, watching the status line. Costs no round.
// region: controls-hold
export function controlsHold(host, kit) {
  const unset = (v) => v === undefined || v === null;
  const { controls, statusLine, message } = kit;
  if (!controls || unset(statusLine) || unset(message)) return false;
  const shown = (label) =>
    parseStatus(S.readCString(host.memory(), statusLine))[label];
  for (const label of ['angle', 'power']) {
    const up = controls[`${label}_up`];
    const down = controls[`${label}_down`];
    const top = label === 'angle' ? LIMITS.angle_max : LIMITS.power_max;
    const was = shown(label);
    if (was === null) return false;
    // At the top of its range an up press can't move the value,
    // so the test steps down and back up instead.
    const atTop = was >= top;
    const [first, back] = atTop ? [down, up] : [up, down];
    const step = atTop ? -1 : 1;
    host.press(first);
    host.tick(2);
    const now = shown(label);
    host.press(back);
    host.tick(2);
    if (now !== was + step) return false;
  }
  return true;
}
// endregion: controls-hold

// region: learn-controls
export async function learnControls(host, kit, env) {
  if (controlsHold(host, kit)) {
    const why = 'the keys in the kit still do what they did';
    say(env, 'code', 'check the controls', why);
    return kit.controls;
  }
  const probed = probeControls(host, kit);
  if (!probed) throw new Error('could not work out the controls');
  kit.controls = probed;
  findMessage(host, kit);
  const how = 'pressed each key and watched the status line';
  say(env, 'code', 'work out the controls', how);
  return probed;
}
// endregion: learn-controls
// ---------- module 02: picks ----------

// Ask the decision model to pick one option. With one option there is nothing to
// decide and no call is made. Any answer that is not a usable index, and a model
// that is not there, is option 0. The options go to the model as labels; the
// stand-ins that are not models get the options themselves as well.
// region: choose
export async function choose(env, what, text, options) {
  if (options.length <= 1) return 0; // nothing to decide: no call
  const labelOf = (o) => (typeof o === 'string' ? o : o.label);
  const labels = options.map(labelOf);
  const step = `pick ${what}`;
  try {
    const answer = await env.models.decide(text, labels, options);
    const choice = answer?.choice;
    const onMenu = choice >= 0 && choice < labels.length;
    if (Number.isInteger(choice) && onMenu) {
      say(env, 'decision', step, labels[choice]);
      return choice;
    }
    const shown = JSON.stringify(choice);
    const why = `answered ${shown}, which is not on the menu`;
    say(env, 'decision', step, `${why}; taking option 0`);
  } catch (error) {
    if (error instanceof OutOfBudget) throw error; // the level is over
    const why = `unavailable (${error.message})`;
    say(env, 'decision', step, `${why}; taking option 0`);
  }
  return 0;
}
// endregion: choose
// ---------- module 03: an aim from practice shots ----------

// region: learn-fit
export async function learnFit(host, kit, env) {
  // Sighting shots first: fired flat, each lands far short of any flag,
  // so its message gives a distance that narrows the landing slot.
  for (const power of SIGHTERS) {
    if (kit.found.landing) break;
    newRound(host, kit);
    testShot(host, kit.found, kit.controls, LIMITS.angle_min, power);
  }
  const shots = [];
  for (let i = 0; i < PRACTICE.length; i++) {
    if (i % 4 === 0) newRound(host, kit); // before shots 1, 5, 9 and 13
    shots.push(testShot(host, kit.found, kit.controls, ...PRACTICE[i]));
  }
  kit.shots = shots;
  // The 4th, 8th and 12th are held back; the fit sees the other 11.
  const fitOn = shots.filter((_, i) => i % 4 !== 3);
  const heldOut = shots.filter((_, i) => i % 4 === 3);
  const coef = fitShots(fitOn);
  const v = judgeFit(coef, { fitOn, heldOut });
  const sizes = `${fitOn.length} fitted, ${heldOut.length} held back`;
  const worst =
    `worst miss ${v.fitWorst.toFixed(1)} paces on the fitted shots, ` +
    `${v.heldWorst.toFixed(1)} on the held-back ones`;
  const accepted = v.verdict === 'accept';
  const verdict = accepted ? 'accepted' : 'not good enough';
  const step = 'fit the practice shots';
  say(env, 'code', step, `${sizes}; ${worst}: ${verdict}`);
  kit.fit = accepted ? { coef, game: gameId(host) } : null;
  return kit.fit;
}
// endregion: learn-fit
// What the passes find in the game's code, worked out once per game. Every
// finding is a hypothesis until a test against the game confirms it.
// region: analyse
// The findings, worked out once per game: look and aimFor ask for them
// every round, and the same file always gives the same findings.
const analyses = new Map();

export function analyse(host) {
  const id = gameId(host);
  if (analyses.has(id)) return analyses.get(id);
  const lifted = liftAll(parseModule(host.binary()));
  const keyFn = lifted.get('game_key');
  const tickFn = lifted.get('game_tick');
  const launch = keyFn ? launchOf(keyFn) : null;
  const aim = launch ? aimValues(keyFn, launch) : null;
  const flight = launch && tickFn ? flightOf(tickFn, launch) : null;
  const raw = aim?.angle.raw;
  const rawKey = raw ? placeKey(raw.addr, raw.offset) : null;
  const decode = aim ? decoding(aim.angle.value, rawKey) : null;
  const all = launch && aim && flight;
  const simulate = all ? simulator(launch, aim, flight) : null;
  const code = {
    ...{ lifted, launch, aim, flight, decode, flag: null, simulate },
    ...{ readers: [], constants: [] },
  };
  if (launch) code.constants = constantsOf(lifted, launch);
  // The flag, by the hit test, and a reader for each place it may be
  // kept in, with the flag's motion for that place.
  if (flight && decode) {
    code.flag = later(() => flagOf(tickFn, flight, decode.key));
  }
  for (const raw of code.flag?.raws ?? []) {
    const reader = later(() => readerFrom(aim, flight, raw));
    const mover = later(() => moverOf(tickFn, raw));
    if (reader) code.readers.push({ raw, reader, mover });
  }
  analyses.set(id, code);
  return code;
}

// The value of f(), or null while f needs a function that is not
// written yet, so analyse works before reader.mjs and race.mjs do.
function later(f) {
  try {
    return f();
  } catch (error) {
    if (/not written yet/.test(error.message)) return null;
    throw error;
  }
}
// endregion: analyse

// region: constants-of
// Constant tracking: the floats the launch's trig stores read that no
// lifted function writes. The game sets them once, when it starts.
function constantsOf(lifted, launch) {
  const refs = xrefs(lifted);
  const read = new Map();
  for (const st of launch.trig) {
    for (const l of loadsIn(st.value)) {
      const written = refs.get(l.key)?.writes.length;
      if (l.type === 'f32.load' && !written) read.set(l.key, l);
    }
  }
  return [...read.values()];
}

// The findings, or null while a pass they need is not written yet.
function codeOrNull(host) {
  try {
    return analyse(host);
  } catch (error) {
    if (/not written yet/.test(error.message)) return null;
    throw error;
  }
}
// endregion: constants-of
// region: say-reader
// "+N" for a load of the field at offset N.
const field = (load) => `+${load.offset}`;

// How the values are stored, from the angle's decoding.
function howStored(d) {
  if (d.op === 'plain') return 'values stored as they are';
  const at = `the word at ${field(d.key)}`;
  if (d.op === 'xor') return `values stored XORed with ${at}`;
  return `values stored with ${at} added`;
}

// Where the wind comes from: its word, and the server where the wind
// expression calls it.
function windWords(code) {
  const w = code.flight.wind;
  if (!w) return 'the wind is not used';
  const calls = [...parts(w)].filter((e) => e.op === 'call');
  const server = calls.some((e) => /server_wind$/.test(e.name));
  const word = windWord(code.flight, code.decode);
  const at = word ? `wind at ${field(word)}` : 'wind';
  const more = 'or from the server in builds that take it from there';
  return server ? `${at}, ${more}` : at;
}

export function sayReader(code, cand) {
  const d = code.decode;
  const { power } = code.aim;
  const powerKey = placeKey(power.raw.addr, power.raw.offset);
  const powerRaw = decoding(power.value, powerKey)?.raw ?? d.raw;
  const struct = `The state is the struct at ${place(d.raw.addr)}`;
  const at = `angle at ${field(d.raw)}, power at ${field(powerRaw)}`;
  const flag = `flag at ${field(cand.raw)}`;
  const how = howStored(d);
  return `${struct}, ${how}: ${at}, ${flag}, ${windWords(code)}.`;
}
// endregion: say-reader
// region: say-physics
export function sayPhysics(code, host = null) {
  const l = code.launch;
  const f = code.flight;
  // A constant's value now, read through its pointer, given a host.
  const now = (c) => {
    if (!host) return '';
    const m = overlay(host.memory());
    const at = resolve(m, c.addr);
    if (at === null) return '';
    return `; ${m.load('f32.load', at + c.offset)} now`;
  };
  const free = 'no store through the pointer writes it';
  const one = (c) => `+${c.offset} (${free}${now(c)})`;
  const fixed = code.constants.map(one);
  const writes = l.trig.map((st) => `+${st.offset}`).join(' ');
  const plus = fixed.length ? ` and ${fixed.join(', ')}` : '';
  const flag = `+${l.flyingStore.offset}`;
  const n = f.stores.length - 1; // the landing is not a move
  const moves = `game_tick moves the shell with ${n} stores`;
  const land = `+${f.landing.offset}`;
  return (
    `A shot starts on key code ${l.code}: game_key writes ${writes}` +
    ` from the angle, the power${plus}, and sets ${flag}; ${moves}` +
    ` while ${flag} is set and writes the landing to ${land}.`
  );
}
// endregion: say-physics
// region: say-mover
export function sayMover(cand) {
  const n = count(cand.mover.length, 'store');
  const fields = cand.mover.map((st) => `+${st.offset}`);
  const places = [...new Set(fields)].join(' ');
  return `game_tick moves the flag with ${n}, to ${places}.`;
}
// endregion: say-mover
// region: fire
// Set the barrel to the plan, counting press by press from the angle
// and power look reads. A press takes no frame, so none is ticked.
function setBarrel(host, kit, env, plan) {
  const { controls } = kit;
  const state = look(host, kit, env);
  let a = Math.round(state.angle);
  let p = Math.round(state.power);
  for (let n = 0; n < 200 && a !== plan.angle; n++) {
    const up = a < plan.angle;
    host.press(up ? controls.angle_up : controls.angle_down);
    a += up ? 1 : -1;
  }
  for (let n = 0; n < 200 && p !== plan.power; n++) {
    const up = p < plan.power;
    host.press(up ? controls.power_up : controls.power_down);
    p += up ? 1 : -1;
  }
}

// Fire, and tick one frame at a time until the message shows text.
function release(host, kit) {
  host.press(kit.controls.fire);
  let text = '';
  let frames = 0;
  while (frames < 1500 && !text) {
    host.tick(1);
    frames++;
    text = S.readCString(host.memory(), kit.message);
  }
  return { text, frames, hit: text.startsWith('HIT') };
}

export function fire(host, kit, env, plan) {
  setBarrel(host, kit, env, plan);
  return release(host, kit);
}
// endregion: fire
// Check shots for the physics: each is simulated from memory just before it is
// fired, then fired. The landing comes from the message (SHORT BY 37 is 37 paces
// before the flag, to the nearest pace), with the flag read when it lands. A shot
// that hits says only "within 12 paces", so it is fired again with other power.
// region: learn-physics
export async function learnPhysics(host, kit, env) {
  const code = analyse(host);
  if (!code.simulate) {
    const why = 'the code shows no launch and flight';
    say(env, 'code', 'read the physics', why);
    return null;
  }
  if (typeof look(host, kit, env).wind !== 'number') {
    const why =
      'the exact wind is not on the client, so no check shot can be' +
      ' compared here';
    say(env, 'code', 'check the physics', why);
    return null;
  }
  say(env, 'code', 'read the physics', sayPhysics(code, host));
  const rows = [];
  for (const [angle, power] of CHECK_SHOTS) {
    const row = checkShot(host, kit, env, code, angle, power);
    if (row) rows.push(row);
  }
  const off = (r) =>
    !r.predicted ||
    Math.abs(r.predicted.x - r.landed) > 1 ||
    r.predicted.frames !== r.frames;
  const bad = rows.filter(off);
  const ok = rows.length === CHECK_SHOTS.length && bad.length === 0;
  const verdict = ok ? confirmed(rows) : refuted(bad);
  say(env, 'code', 'check the physics', verdict);
  kit.physics = ok
    ? { game: gameId(host), says: sayPhysics(code, host) }
    : null;
  return kit.physics;
}
// endregion: learn-physics

// region: check-shot
// One check shot, fired again with 7 more power and then 7 less while
// it hits, since HIT! gives no distance. Each try in a new round: set
// the barrel, simulate from memory as it is, fire, and place the
// landing by the message. null when every try hit.
function checkShot(host, kit, env, code, angle, power0) {
  for (const extra of [0, 7, -7]) {
    const power = power0 + extra;
    newRound(host, kit);
    setBarrel(host, kit, env, { angle, power });
    const predicted = code.simulate(host.memory(), { angle, power });
    const shot = release(host, kit);
    const m = shot.text.match(/(SHORT|LONG) BY (\d+)/);
    if (!m) continue;
    // The flag, read once the shell has landed.
    const at = look(host, kit, env).target_x;
    const by = Number(m[2]);
    const landed = m[1] === 'SHORT' ? at - by : at + by;
    return { angle, power, predicted, landed, frames: shot.frames };
  }
  return null;
}

// What the log says for each verdict.
const confirmed = (rows) =>
  `${count(rows.length, 'check shot')} each landed within a pace of` +
  ' the simulated landing, after the same number of frames';
function refuted(bad) {
  const one = (r) => {
    const { predicted: p, angle, power } = r;
    const sim = p ? `${p.x.toFixed(1)} after ${p.frames} frames` : null;
    const real = `${r.landed.toFixed(1)} after ${r.frames}`;
    const what = `simulated ${sim ?? 'nothing'}, landed ${real}`;
    return `angle ${angle} power ${power}: ${what}`;
  };
  const which = bad.map(one).join('; ');
  return `refuted: ${which || 'too few check shots could be measured'}`;
}
// endregion: check-shot
// The game's state right now, through the reader if the kit has one, otherwise
// from the addresses a search found.
// region: look
// The reader the kit names, rebuilt from the code's findings: the kit
// keeps only its index, so it stays plain data.
function readerOf(host, kit) {
  return analyse(host).readers[kit.reader.which];
}

export function look(host, kit, env) {
  if (kit.reader) {
    const { reader } = readerOf(host, kit);
    return readState(host, reader, kit.statusLine);
  }
  const f = kit.found;
  if (!f) throw new Error('nothing in the kit reads the state');
  return {
    angle: readAt(host, f.angle.addr, f.angle.type),
    power: readAt(host, f.power.addr, f.power.type),
    wind: readAt(host, f.wind.addr, 'f32'),
    wind_arrows: null,
    target_x: readAt(host, f.flag.addr, 'f32'),
  };
}
// endregion: look
// region: learn-reader
export async function learnReader(host, kit, env, which) {
  const code = analyse(host);
  const cand = code.readers[which];
  const says = sayReader(code, cand);
  say(env, 'code', 'read the state out of the code', says);
  const read = () => readState(host, cand.reader, kit.statusLine);
  const newRound = kit.controls.new_round;
  const opts = { lineAddr: kit.statusLine, newRound, rounds: 3 };
  const v = checkReader(host, read, opts);
  const rounds = count(v.rows.length, 'round');
  const first = v.problems.slice(0, 2).join('; ');
  const verdict = v.ok
    ? `it agreed with the screen in ${rounds}`
    : `refuted: ${first}`;
  say(env, 'code', 'check the reader against the screen', verdict);
  if (!v.ok) return null;
  kit.reader = { game: gameId(host), which, says };
  delete kit.found; // the reader the screen confirmed replaces them
  return kit.reader;
}
// endregion: learn-reader
// region: reader-holds
// Does the reader in the kit agree with the screen now? null when it
// does; otherwise how it fails. It starts no round.
function readerHolds(host, kit) {
  let state;
  try {
    state = look(host, kit, {});
  } catch {
    return 'the reader in the kit fails here';
  }
  const mine = 'the reader in the kit';
  const line = S.readCString(host.memory(), kit.statusLine);
  const shown = parseStatus(line);
  const angleOk = Math.abs(state.angle - shown.angle) <= 0.5;
  const powerOk = Math.round(state.power) === shown.power;
  if (shown.angle === null || !angleOk || !powerOk) {
    const reads = `reads angle ${state.angle} and power ${state.power}`;
    const screen = `the screen shows ${shown.angle} and ${shown.power}`;
    return `${mine} ${reads}; ${screen}`;
  }
  const isNumber = typeof state.wind === 'number';
  const windOk = isNumber && Math.abs(state.wind - shown.wind) <= 0.051;
  if (shown.wind !== null && !windOk) {
    const screen = `the screen shows ${shown.wind}`;
    return `${mine} reads wind ${state.wind}; ${screen}`;
  }
  const seen = S.findRed(host.screen());
  if (seen && !(Math.abs(state.target_x - seen.x) <= 12)) {
    return `${mine} puts the flag where the screen does not`;
  }
  return null;
}
// endregion: reader-holds
// region: flag-moves
// Does the flag move on its own? Read it three times, 20 frames apart:
// a flag that stood still during the first wait may not in the second.
function flagMoves(host, kit, env) {
  const at = () => look(host, kit, env).target_x;
  const a = at();
  host.tick(20);
  const b = at();
  host.tick(20);
  return Math.abs(b - a) > 1e-3 || Math.abs(at() - b) > 1e-3;
}
// endregion: flag-moves
// ---------- module 07: the flag's motion ----------

// region: learn-motion
export async function learnMotion(host, kit, env, which) {
  const cand = analyse(host).readers[which];
  const says = sayMover(cand);
  say(env, 'code', "read the flag's motion out of the code", says);
  const { mover, reader } = cand;
  const pathNow = (frames) =>
    flagPath(host.memory(), mover, reader.flag, frames);
  const read = () => look(host, kit, env);
  const newRound = kit.controls.new_round;
  const opts = { newRound, rounds: 2, frames: 300 };
  const v = judgeMotion(host, read, pathNow, opts);
  const held = `the path held for ${v.predicted} frames over 2 rounds`;
  const verdict = v.ok ? held : `refuted: ${v.problems[0]}`;
  say(env, 'code', 'watch the flag', verdict);
  if (!v.ok) return null;
  kit.mover = { game: gameId(host), which, says };
  return kit.mover;
}
// endregion: learn-motion
// What is missing or broken for this level, most basic first:
// { part, why, evidence, options }, or null when the kit is ready.
// region: repair-find
// The search, as a repair: findValues asks the picker through choose.
async function repairFind(host, kit, env) {
  const step = 'search memory for the values';
  const decide = (text, labels) =>
    choose(env, 'the next experiment', text, labels);
  try {
    kit.found = await findValues(host, kit.controls, { decide });
    const n = kit.found.experiments;
    const what = 'found angle, power, wind and flag';
    say(env, 'code', step, `${what} in ${n} experiments`);
  } catch (error) {
    if (error instanceof OutOfBudget) throw error; // the level is over
    kit.found = null;
    say(env, 'code', step, `failed: ${error.message}`);
  }
}
// endregion: repair-find

// region: options
// What each option costs, the sentence a picker reads, what rules it
// out, and what runs. which is the reader a reader or motion option
// belongs to.
const OPTIONS = {
  controls: {
    cost: { rounds: 2, shots: 0 },
    limits: [],
    label: () => 'Press each key and watch the status line',
    run: learnControls,
  },
  search: {
    cost: { rounds: 6, shots: 0 },
    limits: ['moves', 'arrows'],
    label: () =>
      'Search memory for the values (about 6 rounds; what it finds' +
      ' stops working if the state moves or is scrambled, and it' +
      ' needs the wind on the screen)',
    run: repairFind,
  },
  reader: {
    cost: { rounds: 3, shots: 0 },
    limits: [],
    label: (code, which) =>
      'Test what the code says about the state (3 rounds against the' +
      ` screen): ${sayReader(code, code.readers[which])}`,
    run: learnReader,
  },
  fit: {
    cost: { rounds: 7, shots: 17 },
    limits: ['exact', 'arrows', 'flag-moves'],
    label: () =>
      'Fire 14 practice shots and fit an aim to them' +
      ' (about 7 rounds and 17 shots; good to about 10 paces)',
    run: learnFit,
  },
  physics: {
    cost: { rounds: 3, shots: 3 },
    limits: ['arrows'], // no check shot can be compared on arrows
    label: (code) =>
      'Test what the code says about a shot with 3 check shots' +
      ` (3 rounds, 3 shots): ${sayPhysics(code)}`,
    run: learnPhysics,
  },
  motion: {
    cost: { rounds: 2, shots: 0 },
    limits: [],
    label: (code, which) =>
      'Test what the code says about the flag by watching it for 2' +
      ` rounds: ${sayMover(code.readers[which])}`,
    run: learnMotion,
  },
};

// One option of a menu. which is the reader it belongs to, or 0.
function option(kind, code = null, which = 0) {
  const { cost, limits, label, run: runs } = OPTIONS[kind];
  const run = (host, kit, env) => runs(host, kit, env, which);
  const key = `${kind}:${which}`;
  const words = label(code, which);
  return { kind, which, key, label: words, cost, limits, run };
}
// endregion: options

// region: state-broke
// Do the addresses the search found still hold what the status line
// shows, a round later? null when they do; otherwise { why, evidence }.
function stateBroke(host, kit) {
  const f = kit.found;
  newRound(host, kit);
  const line = S.readCString(host.memory(), kit.statusLine);
  const shown = parseStatus(line);
  const angle = readAt(host, f.angle.addr, f.angle.type);
  const power = readAt(host, f.power.addr, f.power.type);
  const wind = readAt(host, f.wind.addr, 'f32');
  if (shown.angle === null || shown.power === null) {
    const none = 'shows no angle and power to compare with';
    return { why: `the status line ${none}` };
  }
  const angleHolds = Math.abs(angle - shown.angle) <= 0.5;
  if (!angleHolds || Math.round(power) !== shown.power) {
    const where = `angle ${angle} there, ${shown.angle} on screen`;
    const why =
      'a round later the addresses found by searching no longer' +
      ` hold what the screen shows (${where})`;
    return { why, evidence: 'moves' };
  }
  if (shown.wind === null) {
    const why =
      'the screen shows only wind arrows, so an address for the' +
      ' wind is no use';
    return { why, evidence: 'arrows' };
  }
  if (!(Math.abs(wind - shown.wind) <= 0.051)) {
    const holds = `the address found for the wind holds ${wind}`;
    const why = `${holds}; the screen shows ${shown.wind}`;
    return { why, evidence: 'moves' };
  }
  return null;
}
// endregion: state-broke

// region: check-kit
// The state: a reader in the kit is tested now, at no cost, and found
// addresses a round later. null when one of them reads the state.
function stateProblem(host, kit, code, evidence) {
  let why = 'nothing reads the state yet';
  if (kit.reader) {
    const bad = readerHolds(host, kit);
    if (!bad) return null;
    why = bad;
    delete kit.reader;
  }
  if (kit.found) {
    const broke = stateBroke(host, kit); // costs one round
    if (!broke) return null;
    why = broke.why;
    if (broke.evidence) evidence.push(broke.evidence);
    delete kit.found;
  }
  const readers = code?.readers ?? [];
  const options = [option('search')];
  readers.forEach((_, i) => options.push(option('reader', code, i)));
  return { part: 'state', why, evidence, options };
}

// The evidence that a fit can't serve: the level needs the physics.
const NEEDS_PHYSICS = ['exact', 'arrows', 'flag-moves'];

export async function checkKit(host, kit, level, env) {
  const code = codeOrNull(host);
  const evidence = [];
  if (level.radius < 12) evidence.push('exact'); // a fit is not enough
  if (!controlsHold(host, kit)) {
    const why = 'the controls are not known on this game';
    const options = [option('controls')];
    return { part: 'controls', why, evidence, options };
  }
  const line = S.readCString(host.memory(), kit.statusLine);
  if (parseStatus(line).wind_arrows !== null) evidence.push('arrows');
  const state = stateProblem(host, kit, code, evidence);
  if (state) return state;
  if (!kit.mover && flagMoves(host, kit, env)) {
    evidence.push('flag-moves');
    const why =
      'the flag moves while nothing is happening, and nothing in' +
      ' the kit says how';
    // One option per reader with a mover: none until module 07.
    const withMover = (code?.readers ?? []).map((r, i) => [r, i]);
    const options = withMover
      .filter(([r]) => r.mover)
      .map(([, i]) => option('motion', code, i));
    return { part: 'flag', why, evidence, options };
  }
  if (kit.mover) evidence.push('flag-moves');
  const id = gameId(host);
  if (kit.physics?.game === id) return null; // ready to play
  const exact = evidence.some((e) => NEEDS_PHYSICS.includes(e));
  if (!exact && kit.fit?.game === id) return null;
  const options = [];
  if (!exact && kit.found) options.push(option('fit'));
  if (code?.simulate) options.push(option('physics', code));
  const why = exact
    ? 'this level needs the exact physics'
    : 'nothing in the kit aims yet';
  return { part: 'aim', why, evidence, options };
}
// endregion: check-kit
// The rule the decision model is measured against: the cheapest option that no
// evidence rules out, in rounds and then shots; the first of equals.
// region: heuristic
export function heuristic(problem, options) {
  const seen = problem.evidence;
  const ruledOut = (o) => o.limits.some((l) => seen.includes(l));
  let best = 0; // the menu's own order, when every option is ruled out
  let bestCost = Infinity;
  options.forEach((o, i) => {
    if (ruledOut(o)) return;
    const cost = o.cost.rounds * 100 + o.cost.shots; // rounds first
    if (cost < bestCost) {
      best = i;
      bestCost = cost;
    }
  });
  return best;
}
// endregion: heuristic
// ---------- module 07: aiming, and a decision in time ----------

// The shot to fire for this state, with the best part the kit has: the code's
// physics (leading the flag if it moves), else the fit, else the nearest practice
// shot. delay: frames that pass before the shot leaves.
// region: aim-for
// The flag's path for the next `frames` frames, from the reader the
// kit's flag motion belongs to.
function pathFor(code, kit, bytes, frames) {
  const { mover, reader } = code.readers[kit.mover.which];
  return flagPath(bytes, mover, reader.flag, frames);
}

// A plan that leads a moving flag, marked so playRounds waits for it to
// be ready.
function leadFlag(state, predict, path, delay) {
  const plan = lead(state, predict, path, delay);
  if (plan) plan.moving = true;
  return plan;
}

export function aimFor(host, kit, state, env, delay = 1) {
  const at = () => state.target_x; // a flag that stands still
  if (kit.physics) {
    const code = analyse(host);
    const bytes = host.memory();
    const predict = (angle, power, wind) =>
      code.simulate(bytes, { angle, power, wind });
    const path = kit.mover ? pathFor(code, kit, bytes, 700) : [];
    // A path that is not all one value: the flag moves, so lead it.
    if (path.some((x) => x !== path[0])) {
      return leadFlag(state, predict, path, delay);
    }
    // Only the arrows on the screen: aim inside their band.
    if (typeof state.wind !== 'number') return aimBand(state, predict);
    return search((a, p) => predict(a, p, state.wind), at);
  }
  if (kit.fit && typeof state.wind === 'number') {
    const { coef } = kit.fit;
    // A fit can't say how long a shot flies, so frames is null.
    const predict = (angle, power) => {
      const x = predictFit(coef, angle, power, state.wind);
      return { x, frames: null };
    };
    return search(predict, at);
  }
  return kit.shots?.length ? nearest(kit.shots, state) : null;
}
// endregion: aim-for
// region: play-rounds
// Ask the decider whether to fire a plan that is ready.
async function fireNow(env, plan) {
  const miss = plan.miss.toFixed(1);
  const text =
    `The planned shot lands in ${plan.frames} frames, ${miss} paces` +
    ' from where the flag will be.';
  const options = ['Fire now', 'Wait and look again'];
  return (await choose(env, 'fire or wait', text, options)) === 0;
}

// Look and plan until the plan can be fired: { plan }, with plan null
// when nothing can aim, or { cannot } when nothing reads the state.
async function planToFire(host, kit, env, who) {
  const delay = who.plan ?? who.frames;
  // waited: the frames this round has spent looking, waits included.
  for (let waited = 0; ;) {
    let state;
    try {
      state = look(host, kit, env);
    } catch (error) {
      return { cannot: error.message };
    }
    const plan = aimFor(host, kit, state, env, delay);
    // At 600 frames, fire the plan just made, ready or not.
    if (!plan || waited >= 600) return { plan };
    if (plan.moving && !ready(plan)) {
      host.tick(1); // a frame later another setting may fit
      waited += 1;
      continue;
    }
    if (who.who !== 'model') return { plan };
    if (await fireNow(env, plan)) return { plan };
    host.tick(who.frames); // asking took the decider's frames
    waited += who.frames;
  }
}

export async function playRounds(host, level, kit, env) {
  const who = kit.decider ?? { who: 'code', frames: 1 };
  let hits = 0;
  for (let n = 1; n <= level.rounds; n++) {
    newRound(host, kit);
    const { plan, cannot } = await planToFire(host, kit, env, who);
    if (cannot) {
      const why = `cannot play: ${cannot}; firing nothing`;
      say(env, 'code', `round ${n}`, why);
      return { hits, rounds: level.rounds };
    }
    if (!plan) {
      say(env, 'code', `round ${n}`, 'nothing in the kit can aim');
      continue;
    }
    host.tick(who.frames); // the delay the plan was made for
    if (fire(host, kit, env, plan).hit) hits++;
  }
  return { hits, rounds: level.rounds };
}
// endregion: play-rounds
// Time the decision model three times. Its middle time, in frames, is the
// delay the engine plans for. What cannot be planned for is the spread between
// its fastest and slowest answer: the model may decide during a round only if
// that spread, in frames, is within the budget.
// region: pick-decider
// The decider's three timing answers in ms, or null if it is not there.
async function timeAnswers(env) {
  const times = [];
  for (let i = 0; i < 3; i++) {
    const text =
      `The planned shot lands in ${96 + 10 * i} frames,` +
      ` 0.${4 + i} paces from where the flag will be.`;
    try {
      const options = ['Fire now', 'Wait and look again'];
      times.push((await env.models.decide(text, options)).ms);
    } catch {
      return null;
    }
  }
  return times.sort((a, b) => a - b);
}

export async function pickDecider(env, budget = FRAME_BUDGET) {
  const step = 'time the decision model';
  const times = await timeAnswers(env);
  if (!times) {
    say(env, 'decision', step, 'unavailable; code decides');
    return { who: 'code', frames: 1 };
  }
  const toFrames = (ms) => Math.round((ms * 60) / 1000);
  const frames = Math.max(1, toFrames(times[1])); // the middle answer
  const spread = toFrames(times[2] - times[0]); // after the subtraction
  const who = spread <= budget ? 'model' : 'code';
  const took = times.map((t) => Math.round(t)).join(', ');
  const plan = `${count(frames, 'frame')} to plan for`;
  const gap = `a spread of ${count(spread, 'frame')}`;
  const against = `${gap} against a budget of ${budget}`;
  const so = who === 'model' ? 'the model decides' : 'code decides';
  const result = `answers took ${took} ms: ${plan}, and ${against}`;
  say(env, 'code', step, `${result}, so ${so} when to fire`);
  return who === 'model' ? { who, frames } : { who, frames: 1 };
}
// endregion: pick-decider
// Hit rate against decision latency, two ways. planned: the engine knows the
// shot leaves `latency` frames after the plan and aims for that. unplanned: it
// aims as if the shot left at once, and the shot leaves `latency` frames late.
// region: sweep
export async function sweep(newHost, level, kit, env, latencies) {
  const out = [];
  const keep = kit.decider;
  for (const latency of latencies) {
    // The plan made for the delay, then made for 1 frame while the shot
    // still leaves after the whole delay; each on a fresh host.
    kit.decider = { who: 'code', frames: latency };
    const hits = async () =>
      (await playRounds(newHost(), level, kit, env)).hits;
    const planned = await hits();
    kit.decider = { who: 'code', frames: latency, plan: 1 };
    const unplanned = await hits();
    out.push({ latency, planned, unplanned });
  }
  kit.decider = keep;
  return out;
}
// endregion: sweep
// ---------- module 08: one level, start to finish ----------

// region: what-fits
// What is left of the allowance, and the options not yet tried on
// this level whose estimated cost fits in it.
function whatFits(problem, left, spent, tried) {
  const rounds = left.rounds - spent.rounds;
  const shots = left.shots - spent.shots;
  const fits = (o) => o.cost.rounds <= rounds && o.cost.shots <= shots;
  const untried = problem.options.filter((o) => !tried.has(o.key));
  const room = `${count(rounds, 'round')} and ${count(shots, 'shot')}`;
  return { options: untried.filter(fits), room };
}
// endregion: what-fits

// region: pick-repair
// The first problem, and the option the picker picks from those that
// fit. null when the kit is ready or nothing that fits is left.
async function pickRepair(at) {
  const { meter, level, kit, env, left, tried } = at;
  let problem;
  try {
    problem = await checkKit(meter.host, kit, level, env);
  } catch (error) {
    if (!(error instanceof OutOfBudget)) throw error;
    say(env, 'code', 'check the kit', error.message);
    return null;
  }
  if (!problem) return null; // the kit is ready
  const spent = meter.spent();
  const { options, room } = whatFits(problem, left, spent, tried);
  const { part, why } = problem;
  if (!options.length) {
    const none = 'nothing left to try that fits the budget';
    const line = `${none} (${room} left) for the ${part}: ${why}`;
    say(env, 'code', 'repair', line);
    return null;
  }
  const text =
    `Level ${level.n}, ${level.name}: ${level.about}` +
    ` Problem: ${why}. Left for learning: ${room}.`;
  const menu = options.map((o) => ({ ...o, problem }));
  try {
    const pick = await choose(env, 'what to try next', text, menu);
    return { why, option: options[pick] };
  } catch (error) {
    if (error instanceof OutOfBudget) return null;
    throw error;
  }
}
// endregion: pick-repair

// region: repair-once
// One pass of the loop: pick a repair and run it on the metered host.
// false once the repairs are over.
async function repairOnce(at) {
  const { meter, kit, env, tried } = at;
  const picked = await pickRepair(at);
  if (!picked) return false;
  const { why, option } = picked;
  tried.add(option.key);
  say(env, 'code', 'repair', `${why}: ${option.label}`);
  const before = meter.spent();
  try {
    await option.run(meter.host, kit, env);
  } catch (error) {
    if (!(error instanceof OutOfBudget)) throw error;
    say(env, 'code', 'repair', `stopped: ${error.message}`);
    return false;
  }
  const after = meter.spent();
  const rounds = count(after.rounds - before.rounds, 'round');
  const shots = count(after.shots - before.shots, 'shot');
  say(env, 'code', 'spent', `${option.kind}: ${rounds} and ${shots}`);
  return true;
}
// endregion: repair-once

// region: play-level
// Who decides when to fire: code, unless the kit can lead a moving flag
// and the decision model's answers are steady enough.
async function deciderFor(host, kit, env) {
  const code = { who: 'code', frames: 1 };
  if (!kit.reader || !kit.physics || !kit.mover) return code;
  const path = pathFor(analyse(host), kit, host.memory(), 120);
  if (!path.some((x) => x !== path[0])) return code; // it stands still
  return pickDecider(env);
}

export async function playLevel(host, level, kit, env) {
  const left = allowance(level);
  const meter = metered(host, kit, left);
  const tried = new Set(); // keys of the options run on this level
  const at = { meter, level, kit, env, left, tried };
  for (let n = 0; n < 10; n++) {
    if (!(await repairOnce(at))) break;
  }
  kit.decider = await deciderFor(host, kit, env);
  // The scored rounds, on the plain host: the allowance left room.
  return playRounds(host, level, kit, env);
}
// endregion: play-level
