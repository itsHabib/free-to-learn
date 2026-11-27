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
export function allowance(level) {
  return {
    rounds: level.budget.rounds - level.rounds,
    shots: level.budget.shots - level.rounds,
  };
}

// The host the engine learns with. It counts every key press, and once the kit
// knows which keys start a round and fire, it refuses (throws OutOfBudget) a press
// that would spend more than the allowance `left`.
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

// ---------- module 01: the controls ----------
// Lesson 01 fills the four regions below. A listing replaces everything
// between one pair of region markers; keep the markers.

// Press each key but Space and watch what changes on the status line.
// region: probe-controls
function probeControls(host, kit) {
  throw new Error('not written yet: probeControls in engine.mjs');
}
// endregion: probe-controls

// The message is the string, in the game's own capitals, that changes when
// a new round starts.
// region: find-message
function findMessage(host, kit) {
  throw new Error('not written yet: findMessage in engine.mjs');
}
// endregion: find-message

// Do the keys in the kit still do what they did? Step the angle and the power one
// way and back, watching the status line. Costs no round.
// region: controls-hold
export function controlsHold(host, kit) {
  throw new Error('not written yet: controlsHold in engine.mjs');
}
// endregion: controls-hold

// region: learn-controls
export async function learnControls(host, kit, env) {
  throw new Error('not written yet: learnControls in engine.mjs');
}
// endregion: learn-controls
// ---------- module 02: picks ----------

// Ask the decision model to pick one option. With one option there is nothing to
// decide and no call is made. Any answer that is not a usable index, and a model
// that is not there, is option 0. The options go to the model as labels; the
// stand-ins that are not models get the options themselves as well.
export async function choose(env, what, text, options) {
  throw new Error('not written yet: choose in engine.mjs');
}
// ---------- module 03: an aim from practice shots ----------

export async function learnFit(host, kit, env) {
  throw new Error('not written yet: learnFit in engine.mjs');
}
// What the passes find in the game's code, worked out once per game. Every
// finding is a hypothesis until a test against the game confirms it.
export function analyse(host) {
  throw new Error('not written yet: analyse in engine.mjs');
}
export function sayReader(code, cand) {
  throw new Error('not written yet: sayReader in engine.mjs');
}
export function sayPhysics(code, host = null) {
  throw new Error('not written yet: sayPhysics in engine.mjs');
}
export function sayMover(cand) {
  throw new Error('not written yet: sayMover in engine.mjs');
}
export function fire(host, kit, env, plan) {
  throw new Error('not written yet: fire in engine.mjs');
}
// Check shots for the physics: each is simulated from memory just before it is
// fired, then fired. The landing comes from the message (SHORT BY 37 is 37 paces
// before the flag, to the nearest pace), with the flag read when it lands. A shot
// that hits says only "within 12 paces", so it is fired again with other power.
export async function learnPhysics(host, kit, env) {
  throw new Error('not written yet: learnPhysics in engine.mjs');
}
// The game's state right now, through the reader if the kit has one, otherwise
// from the addresses a search found.
export function look(host, kit, env) {
  throw new Error('not written yet: look in engine.mjs');
}
export async function learnReader(host, kit, env, which) {
  throw new Error('not written yet: learnReader in engine.mjs');
}
// ---------- module 07: the flag's motion ----------

export async function learnMotion(host, kit, env, which) {
  throw new Error('not written yet: learnMotion in engine.mjs');
}
// What is missing or broken for this level, most basic first:
// { part, why, evidence, options }, or null when the kit is ready.
export async function checkKit(host, kit, level, env) {
  throw new Error('not written yet: checkKit in engine.mjs');
}
// The rule the decision model is measured against: the cheapest option that no
// evidence rules out, in rounds and then shots; the first of equals.
export function heuristic(problem, options) {
  throw new Error('not written yet: heuristic in engine.mjs');
}
// ---------- module 07: aiming, and a decision in time ----------

// The shot to fire for this state, with the best part the kit has: the code's
// physics (leading the flag if it moves), else the fit, else the nearest practice
// shot. delay: frames that pass before the shot leaves.
export function aimFor(host, kit, state, env, delay = 1) {
  throw new Error('not written yet: aimFor in engine.mjs');
}
export async function playRounds(host, level, kit, env) {
  throw new Error('not written yet: playRounds in engine.mjs');
}
// Time the decision model three times. Its middle time, in frames, is the
// delay the engine plans for. What cannot be planned for is the spread between
// its fastest and slowest answer: the model may decide during a round only if
// that spread, in frames, is within the budget.
export async function pickDecider(env, budget = FRAME_BUDGET) {
  throw new Error('not written yet: pickDecider in engine.mjs');
}
// Hit rate against decision latency, two ways. planned: the engine knows the
// shot leaves `latency` frames after the plan and aims for that. unplanned: it
// aims as if the shot left at once, and the shot leaves `latency` frames late.
export async function sweep(newHost, level, kit, env, latencies) {
  throw new Error('not written yet: sweep in engine.mjs');
}
// ---------- module 08: one level, start to finish ----------

export async function playLevel(host, level, kit, env) {
  throw new Error('not written yet: playLevel in engine.mjs');
}
