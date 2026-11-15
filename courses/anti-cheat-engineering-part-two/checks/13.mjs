// Unit 13: hide what the client doesn't draw.
//
// 13.view-fields          your drawnView at every tick of two scripted sessions (the check
//                          presses the keys), field by field against the game's getters
// 13.view-noninterference changing one hidden thing on a copy of the game leaves your
//                          message byte for byte the same, at moments of legal players'
//                          sessions, every hidden name, three changes each
// 13.view-encodings       legal players and the searching client play live against your
//                          view; every message is searched for the hidden values present
//                          when it was built (checks/encodings.mjs)
// 13.leaks-finds          your findLeaks on the planted views in checks/fixtures/13/views.mjs,
//                          each handed over as a new function that calls the planted one
//
// Each check looks at more of the game than the one before it: the scripted sessions have
// one hit, the players' sessions a few, and the searching client hits most of its shots.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fail, show, NOT_WRITTEN } from './harness.mjs';
import { createLobSession } from '../public/session.mjs';
import { fullView } from '../public/full-view.mjs';
import { KEYS } from '../public/rules.mjs';
import {
  firstInterference, describeDifference, huntSession, playOne, describeSession, CHECK_SESSIONS,
} from './encodings.mjs';
import { PLANTED } from './fixtures/13/views.mjs';

export const title = "Hide what the client doesn't draw";

const VIEW = 'server/view.mjs';
const LEAKS = 'server/leaks.mjs';
const notWritten = (error) => String(error?.message ?? error).includes(NOT_WRITTEN);

// "server/view.mjs line 12" for the first stack line inside your project folder.
function whereIn(error, workDir) {
  const roots = new Set([workDir, pathToFileURL(workDir).href]);
  try { const real = realpathSync(workDir); roots.add(real); roots.add(pathToFileURL(real).href); } catch { /* keep the given path */ }
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
const threw = (error, workDir) => {
  const where = whereIn(error, workDir);
  return `it threw ${error?.name ?? 'Error'}: ${String(error?.message ?? error).split('\n')[0]}${where ? ` (${where})` : ''}`;
};

// Your drawnView, wrapped: "not written yet" passes through; a throw, or a result that is
// not a plain object, becomes a failure naming the moment. `moment()` describes where.
function guardedView(env, drawnView, moment) {
  return (game, info) => {
    let out;
    try {
      out = drawnView(game, info);
    } catch (error) {
      if (notWritten(error)) throw error;
      fail({ checked: 'your drawnView runs', input: moment(info), observed: threw(error, env.workDir), expected: 'a plain object holding the drawn fields' });
    }
    if (!out || typeof out !== 'object' || Array.isArray(out)) {
      fail({ checked: 'your drawnView returns a plain object', input: moment(info), observed: `it returned ${show(out, 80)}`, expected: 'a plain object holding the drawn fields (the server sends JSON.stringify of it)' });
    }
    return out;
  };
}

// ---------------------------------------------------------------- scripted sessions

// Where a shot lands if it is fired now: on a copy of the game, turn to angle and power
// the way the server does (one key press per step), fire, and run frames until it lands.
// 1 hit, 2 short, 3 long.
function outcome(game, angle, power) {
  const copy = game.clone();
  for (let a = Math.round(copy.angle()); a < angle; a++) copy.key(KEYS.RIGHT);
  for (let a = Math.round(copy.angle()); a > angle; a--) copy.key(KEYS.LEFT);
  for (let p = copy.power(); p < power; p++) copy.key(KEYS.UP);
  for (let p = copy.power(); p > power; p--) copy.key(KEYS.DOWN);
  copy.key(KEYS.SPACE);
  for (let f = 0; f < 5000 && copy.flying(); f++) copy.tick(1);
  return copy.exports.r_result();
}

const RESULT = { short: 2, long: 3, hit: 1 };
const between = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

// The angle and power of a shot that ends as `want` ('short', 'long' or 'hit'), tried on
// copies of the game, nearest the planned power first. Null when none does.
function aim(game, angle, power, want) {
  const order = want === 'long' ? [...between(power, 100), ...between(10, power - 1).reverse()]
    : want === 'short' ? [...between(10, power).reverse(), ...between(power + 1, 100)]
      : between(10, 100);
  const angles = want === 'hit' ? [angle, ...[5, 10, 15, 20, 25, 30].flatMap((d) => [angle - d, angle + d]).filter((a) => a >= 5 && a <= 85)] : [angle];
  for (const a of angles) for (const p of order) if (outcome(game, a, p) === RESULT[want]) return { angle: a, power: p };
  return null;
}

// Play one session from a plan instead of a client. Each round: wait a few ticks, turn the
// angle and power (one input), wait, then fire the planned shot ('short', 'long', 'hit'),
// or not at all ('none': the round ends unshot after 200 ticks). visit(game, info, round)
// runs at tick 0 and after every tick, the way the server builds a message.
export function playScripted(seed, shots, visit) {
  const s = createLobSession({ seed });
  let seq = 0;
  const send = (angle, power, fire) => { seq += 1; s.apply({ v: 1, seq, angle, power, fire }); };
  const step = () => { s.step(); visit(s.game, { tick: s.tick, ack: seq }, s.round); };
  visit(s.game, { tick: s.tick, ack: seq }, s.round);
  while (!s.over()) {
    const round = s.round;
    const plan = shots[(round - 1) % shots.length];
    const angle = 20 + ((round * 7) % 50), power = 25 + ((round * 13) % 70);
    for (let i = 0; i < 4 + (round % 3); i++) step();
    send(angle, power, false);
    for (let i = 0; i < 3; i++) step();
    if (plan !== 'none') {
      const shot = aim(s.game, angle, power, plan) ?? { angle, power };
      send(shot.angle, shot.power, true);
    }
    while (!s.over() && s.round === round) step();
  }
}

const phase = (game) => (game.flying() ? 'the shell in flight' : game.impact() ? 'after the landing' : 'before a shot');
const after = (tick) => (tick === 0 ? 'before the first tick' : `after tick ${tick}`);

// ---------------------------------------------------------------- 13.view-fields

// One hit in all, so the score is 0 and then 1; round 3 of the first session and round 6
// of the second end unshot. The seeds give every wind level, -3 to 3, between them.
const FIELD_SESSIONS = [
  { seed: 13_100_011, shots: ['short', 'long', 'none', 'short', 'hit', 'long', 'short', 'long', 'short', 'long', 'short', 'long'] },
  { seed: 13_100_014, shots: ['long', 'short', 'long', 'short', 'long', 'none', 'short', 'long', 'short', 'long', 'short', 'long'] },
];
const ORDER = ['v', 'tick', 'ack', 'round', 'score', 'shots', 'angle', 'power', 'wind', 'flag', 'shell', 'trail', 'impact', 'message', 'cloud'];
const ARROWS = ['<<<', '<<', '<', '~', '>', '>>', '>>>'];

function checkFields(view, game, info, input) {
  const out = view(game.clone(), info);
  let text;
  try { text = JSON.stringify(out); } catch (error) {
    fail({ checked: 'your message is JSON', input, observed: `JSON.stringify of your view threw ${error.name}: ${error.message}`, expected: 'a plain object of numbers, strings, arrays and null' });
  }
  const sent = JSON.parse(text);
  const keys = Object.keys(sent);
  if (keys.join() !== ORDER.join()) {
    const missing = ORDER.filter((k) => !keys.includes(k)), extra = keys.filter((k) => !ORDER.includes(k));
    fail({
      checked: 'your message has exactly the drawn fields, in API.md\'s order',
      input,
      observed: `your fields: ${keys.join(', ')}`,
      expected: ORDER.join(', '),
      diff: missing.length ? `missing: ${missing.join(', ')}${extra.length ? `; not drawn: ${extra.join(', ')}` : ''}`
        : extra.length ? `fields the screen does not draw: ${extra.join(', ')}`
          : 'the same fields in another order; key order is part of the bytes the server sends',
    });
  }
  const field = (name, expected, rule) => {
    if (JSON.stringify(sent[name]) === JSON.stringify(expected)) return;
    const sameValues = JSON.stringify(sortKeys(sent[name])) === JSON.stringify(sortKeys(expected));
    fail({
      checked: `the field ${name}: ${rule}`,
      input,
      observed: `${name}: ${show(sent[name])}`,
      expected: `${name}: ${show(expected)}`,
      diff: sameValues ? 'the same values with the keys in another order; key order is part of the bytes'
        : Array.isArray(expected) ? firstDiff(sent[name], expected) : undefined,
    });
  };
  // Each expected value straight from the game's getters, at the precision the screen draws.
  field('v', 1, 'always 1');
  field('tick', info.tick, 'info.tick');
  field('ack', info.ack, 'info.ack');
  field('round', game.round(), 'game.round()');
  field('score', game.score(), 'game.score()');
  field('shots', game.shots(), 'game.shots()');
  field('angle', Math.round(game.angle()), 'game.angle() rounded with Math.round');
  field('power', game.power(), 'game.power()');
  field('wind', ARROWS[game.windLevel() + 3], `the arrows for wind level ${game.windLevel()}: '~' for 0, '>' n times for +n, '<' n times for -n`);
  field('flag', Math.round(game.targetX()), `game.targetX() (${game.targetX()}) rounded with Math.round`);
  const shell = game.shell();
  field('shell', shell ? [Math.round(shell.x), Math.round(shell.y)] : null, shell ? `[x, y] of game.shell() (${shell.x}, ${shell.y}), each rounded` : 'null: no shell in the air');
  field('trail', game.trail().map(([x, y]) => [Math.round(x), Math.round(y)]), `game.trail(), ${game.trail().length} points oldest first, each [x, y] rounded`);
  const impact = game.impact();
  field('impact', impact ? { x: Math.round(impact.x), age: impact.age } : null, impact ? `{ x, age } of game.impact() (x ${impact.x}), x rounded` : 'null: no landing this round (game.impact() is null)');
  field('message', game.message(), 'game.message(), exactly');
  field('cloud', Math.round(game.cloud()), `game.cloud() (${game.cloud()}) rounded with Math.round`);
}

function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys(x[k])]));
  return x;
}
function firstDiff(a, b, path = '') {
  if (Array.isArray(b)) {
    if (!Array.isArray(a)) return `${path || 'the value'} should be a list`;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return firstDiff(a[i], b[i], `${path}[${i}]`);
    }
    return a.length === b.length ? null : `yours has ${a.length} entries, the required value ${b.length}`;
  }
  return `at ${path || 'the value'}: yours ${show(a, 60)}, required ${show(b, 60)}`;
}

// ---------------------------------------------------------------- 13.view-noninterference

// Legal players' sessions; the server sends them the full view, which their official
// client draws in its drawn mode, so the sessions are the same whatever your view does.
// Your view is tested on copies of the game at every SAMPLE-th tick.
const QUIET_SESSIONS = [
  { kind: 'expert', seed: 13_200_002 },
  { kind: 'expert', seed: 13_200_005 },
  { kind: 'reconnects', seed: 13_200_201 },
];
const SAMPLE = 5;

const fmt = (x) => (typeof x === 'number' ? String(x) : show(x, 60));
function describeChange(name, k, game) {
  const copy = game.clone();
  copy.setHidden(name, k);
  const call = `setHidden('${name}', ${k})`;
  switch (name) {
    case 'wind': return `${call}: the exact wind moved inside its arrows' band, ${fmt(game.serverWind())} to ${fmt(copy.serverWind())}`;
    case 'flagSpeed': return `${call}: the flag's speed, ${fmt(game.flagSpeed())} to ${fmt(copy.flagSpeed())} paces a second`;
    case 'flagTimer': return `${call}: the frames until the flag picks a new speed, ${game.flagTimer()} to ${copy.flagTimer()}`;
    case 'rng': return `${call}: the random state, ${game.rng()} to ${copy.rng()}`;
    case 'flagFraction': return `${call}: the flag moved inside its pace, x ${fmt(game.targetX())} to ${fmt(copy.targetX())}`;
    case 'shellFraction': return `${call}: the shell moved inside its pace, ${fmt([game.shell().x, game.shell().y])} to ${fmt([copy.shell().x, copy.shell().y])}`;
    case 'trailFraction': return `${call}: every trail point moved inside its pace`;
    case 'impactFraction': return `${call}: the impact mark moved inside its pace, x ${fmt(game.impact().x)} to ${fmt(copy.impact().x)}`;
    case 'cloudFraction': return `${call}: the cloud moved inside its pace, x ${fmt(game.cloud())} to ${fmt(copy.cloud())}`;
    case 'shellVelocity': { const a = game.velocity(), b = copy.velocity(); return `${call}: the shell's velocity, (${a.vx}, ${a.vy}) to (${b.vx}, ${b.vy})`; }
    default: return call;
  }
}

// ---------------------------------------------------------------- 13.leaks-finds

// The moments the planted views are tried at, from one scripted session:
//   flight  the shell in the air with a trail; the flag moving left, 106 to 135 frames from
//           picking a new speed; the exact wind below the middle of its arrows' band. At
//           this moment a planted view that shows the flag's direction, whether the timer is
//           under half a second, or which side of the middle the wind is on leaks for some
//           of the three changes and not for others, so a finder must try all three.
//   landed  after a landing: the impact mark and the trail, no shell
//   empty   before the first shot: no shell, no impact mark, no trail
//   timer   the flag 203 to 231 frames from picking a new speed: of setHidden's three changes
//           of the timer (public/lob.mjs), only one brings it under 30 frames, so a planted
//           view that shows whether the timer is under 30 leaks for that change alone
const MOMENT_SEED = 13_400_002;
const MOMENT_SHOTS = ['long', 'short', 'long', 'short'];
function windBelowMiddle(game) {
  const level = game.windLevel();
  const middle = level >= 3 ? 4.375 : level <= -3 ? -4.375 : 1.5 * level;
  return game.serverWind() < middle;
}
const MOMENTS = {
  flight: (g) => g.flying() && g.trail().length >= 3 && g.flagSpeed() < 0 && g.flagTimer() >= 106 && g.flagTimer() <= 135 && windBelowMiddle(g),
  landed: (g) => !g.flying() && g.impact() !== null && g.trail().length > 0,
  empty: (g) => !g.flying() && g.impact() === null && g.trail().length === 0 && g.round() >= 1,
  timer: (g) => g.flagTimer() >= 203 && g.flagTimer() <= 231,
};
function findMoments() {
  const found = {};
  playScripted(MOMENT_SEED, MOMENT_SHOTS, (game, info) => {
    for (const [name, test] of Object.entries(MOMENTS)) {
      if (!found[name] && info.tick > 0 && test(game)) found[name] = { name, game: game.clone(), info: { ...info } };
    }
  });
  for (const name of Object.keys(MOMENTS)) if (!found[name]) throw new Error(`checks/13.mjs: the scripted session on game seed ${MOMENT_SEED} has no "${name}" moment (a course problem, not yours)`);
  return found;
}
const describeMoment = (m) => `the scripted session on game seed ${MOMENT_SEED}, after tick ${m.info.tick} (info ${show(m.info)}): ${{
  flight: `the shell in flight with ${m.game.trail().length} trail points; flag speed ${m.game.flagSpeed()}, flag timer ${m.game.flagTimer()}, exact wind ${m.game.serverWind()} (arrows ${m.game.windLevel()})`,
  landed: `after a landing: impact x ${m.game.impact()?.x}, ${m.game.trail().length} trail points, no shell`,
  empty: 'before the first shot: no shell, no impact mark, no trail',
  timer: `the flag ${m.game.flagTimer()} frames from picking a new speed (flag speed ${m.game.flagSpeed()}), ${m.game.flying() ? 'the shell in flight' : 'no shell in the air'}`,
}[m.name]}`;

// Which planted view at which moment. A view whose hidden thing is absent at a moment
// leaks nothing there.
const LEAK_PLAN = [
  ['windTwoDecimals', 'flight'], ['windFloatBase64', 'flight'], ['flagUnrounded', 'flight'],
  ['trailUnrounded', 'flight'], ['flagDirection', 'flight'], ['flagTurnsSoon', 'flight'], ['flagTimerUnder30', 'timer'],
  ['rngBase36', 'landed'], ['shellVelocity', 'flight'], ['shellUnrounded', 'flight'],
  ['impactUnrounded', 'landed'], ['windKeyOrder', 'flight'], ['cloudAndWind', 'landed'],
  ['correct', 'flight'], ['correct', 'landed'], ['correct', 'empty'],
  ['trailUnrounded', 'empty'], ['shellVelocity', 'landed'], ['impactUnrounded', 'empty'], ['windTwoDecimals', 'empty'],
];

const present = (game, name) => [1, 2, 3].some((k) => game.clone().setHidden(name, k));

function snapshot(game) {
  return { memory: game.memory().slice(), wind: game.serverWind(), fields: game.fields() };
}
function changedSince(before, game) {
  if (game.serverWind() !== before.wind) return `the exact wind (serverWind()) changed from ${before.wind} to ${game.serverWind()}`;
  const fields = game.fields();
  for (const [k, v] of Object.entries(before.fields)) if (!Object.is(fields[k], v)) return `the game's ${k} changed from ${v} to ${fields[k]}`;
  const now = game.memory();
  for (let i = 0; i < before.memory.length; i++) if (now[i] !== before.memory[i]) return `the game's memory changed at byte ${i}`;
  return null;
}

// ---------------------------------------------------------------- the cases

export const cases = [
  {
    id: '13.view-fields', title: 'the drawn view holds exactly the drawn fields', timeLimitMs: 20000,
    requirement: 'At every tick of two scripted sessions (before a shot, in flight, after a landing, at a round change, an unshot round, a hit), your drawnView returns exactly the fields of API.md in its order, each equal to the game\'s getter at the precision the screen draws.',
    async run(env) {
      const drawnView = await env.fn(VIEW, 'drawnView');
      for (const { seed, shots } of FIELD_SESSIONS) {
        let round = 1;
        const moment = (info) => `the scripted session on game seed ${seed} (the check presses the keys), round ${round}, ${after(info.tick)}, info ${show(info)}`;
        const view = guardedView(env, drawnView, moment);
        playScripted(seed, shots, (game, info, r) => {
          round = r;
          checkFields(view, game, info, `${moment(info)}: ${phase(game)}`);
        });
      }
    },
  },
  {
    id: '13.view-noninterference', title: 'no hidden change reaches the message', timeLimitMs: 30000,
    requirement: 'At every 5th tick of three legal players\' sessions, for every name in game.hidden and k = 1, 2, 3, setHidden(name, k) on a copy of the game leaves JSON.stringify of your view byte for byte the same.',
    async run(env) {
      const drawnView = await env.fn(VIEW, 'drawnView');
      for (const s of QUIET_SESSIONS) {
        const moment = (info) => `${describeSession(s)}, ${after(info.tick)}, info ${show(info)}`;
        const view = guardedView(env, drawnView, moment);
        playOne({
          ...s,
          view: fullView,
          onView(game, info) {
            if (info.tick % SAMPLE !== 0) return;
            const found = firstInterference(view, game, info);
            if (!found) return;
            if (found.name === null) {
              fail({ checked: 'your view depends only on the game\'s state and info', input: `${moment(info)}: two identical copies of the game`, observed: `two different messages: ${describeDifference(found.before, found.after)}`, expected: 'the same bytes for the same state (no randomness, no clock, nothing kept from an earlier call)' });
            }
            fail({
              checked: `changing ${found.name} alone leaves your message the same`,
              input: `${moment(info)} (${phase(game)}); on a copy of the game, ${describeChange(found.name, found.k, game)}`,
              observed: `your message changed: ${describeDifference(found.before, found.after)}`,
              expected: `the same bytes: the screen does not draw ${found.name}, so the message must not depend on it`,
            });
          },
        });
      }
    },
  },
  {
    id: '13.view-encodings', title: 'no message holds a hidden value', timeLimitMs: 30000,
    requirement: 'Legal players and the searching client play live against your view; no message holds the exact wind, the flag\'s speed, the random state, the flag\'s exact x or the shell\'s velocity under any encoding checks/encodings.mjs searches.',
    async run(env) {
      const drawnView = await env.fn(VIEW, 'drawnView');
      for (const s of CHECK_SESSIONS) {
        let last = 0;
        const moment = (info) => `${describeSession(s)}, the message of tick ${info.tick}`;
        const guarded = guardedView(env, drawnView, moment);
        let hunt;
        try {
          hunt = huntSession(s, (game, info) => { last = info.tick; return guarded(game, info); });
        } catch (error) {
          if (notWritten(error) || error?.fields) throw error;
          fail({ checked: 'a session plays to its end against your view', input: `${describeSession(s)}, at tick ${last}`, observed: `the session stopped: ${threw(error, env.workDir)}`, expected: 'the session runs to its end (a client could not use your messages; 13.view-fields says which field is wrong)' });
        }
        const hit = hunt.hits[0];
        if (hit) {
          const more = hunt.hits.length - 1;
          fail({
            checked: 'no message holds a hidden value, in any encoding searched',
            input: `${describeSession(s)}, the message of tick ${hit.tick}`,
            observed: `${hit.label}, ${hit.value}, is in it as ${hit.encoding} ("${hit.form}") at ${hit.path}${more ? `; ${more} more finds in this session` : ''}`,
            expected: 'no hidden value in any message: the wind only as arrows, the flag and every position to the nearest pace, and no flag speed, random state or shell velocity at all',
          });
        }
      }
    },
  },
  {
    id: '13.leaks-finds', title: 'findLeaks names exactly what a view leaks', timeLimitMs: 20000,
    requirement: 'On each planted view of checks/fixtures/13/views.mjs, handed to it as a new function every time, findLeaks returns exactly the hidden names it leaks at that moment, sorted, each once (none at a moment where its hidden thing is absent), and leaves the game it was given unchanged. Some leaks show for only one of the three changes k = 1, 2, 3, a different one for different views.',
    async run(env) {
      const findLeaks = await env.fn(LEAKS, 'findLeaks');
      const moments = findMoments();
      for (const [id, at] of LEAK_PLAN) {
        const planted = PLANTED[id];
        const m = moments[at];
        const expected = planted.leaks.filter((name) => present(m.game, name)).sort();
        const game = m.game.clone();
        const before = snapshot(game);
        // A new function for every call: your findLeaks can know the view only by its messages.
        const view = (g, i) => planted.view(g, i);
        const call = `findLeaks(view, game, ${show(m.info)}), view being a new function that returns ${id}.view(game, info) from checks/fixtures/13/views.mjs (${planted.about}), at ${describeMoment(m)}`;
        let got;
        try {
          got = findLeaks(view, game, { ...m.info });
        } catch (error) {
          if (notWritten(error)) throw error;
          fail({ checked: 'your findLeaks runs', input: call, observed: threw(error, env.workDir), expected: `the sorted list ${show(expected)}` });
        }
        const changed = changedSince(before, game);
        if (changed) fail({ checked: 'findLeaks leaves the game it was given unchanged', input: call, observed: changed, expected: 'the game exactly as it was: change copies of it (game.clone()), never game itself' });
        if (!Array.isArray(got) || got.length !== expected.length || got.some((x, i) => x !== expected[i])) {
          const list = Array.isArray(got) ? got : [];
          const missing = expected.filter((x) => !list.includes(x)), extra = list.filter((x) => !expected.includes(x));
          const twice = list.filter((x, i) => list.indexOf(x) !== i);
          fail({
            checked: `findLeaks names exactly the hidden things ${id} leaks here`,
            input: call,
            observed: `your findLeaks returned ${got instanceof Set ? `a Set holding ${show([...got])}` : show(got)}`,
            expected: show(expected),
            diff: !Array.isArray(got) ? 'it must return an array of names (a Set, or anything else, is not one)'
              : missing.length ? `missing ${missing.join(', ')}${planted.note ? ` (${planted.note})` : ''}`
                : extra.length ? `${extra.join(', ')} ${extra.length > 1 ? 'do' : 'does'} not reach this view's message here${extra.some((x) => !present(m.game, x)) ? ': setHidden returns false for a thing that is absent, and an absent thing changes nothing' : ''}`
                  : twice.length ? `${twice[0]} appears more than once` : 'the right names in the wrong order: sort them',
          });
        }
      }
    },
  },
];
