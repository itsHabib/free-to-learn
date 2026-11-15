// Unit 15: latency on the courier game. Crafted rings, round trips, outcomes and rows
// test each function against API.md's rules, boundaries included. The last case plays
// courier sessions with your functions on seeds the lessons do not use, and works out
// every decision and every count of the window table again by the same rules.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fail, show, NOT_WRITTEN } from './harness.mjs';
import { runCourier, createHistory, recordPosition, TICK_MS, RANGE, RTT_SAMPLES, HISTORY_TICKS } from '../public/courier.mjs';

export const title = 'Latency on the courier game';

const FILE = 'courier/rewind.mjs';
const notWritten = (error) => String(error?.message ?? error).includes(NOT_WRITTEN);

// "courier/rewind.mjs line 12" for the first stack line inside your project folder.
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

// Runs one call of your code. "not written yet" passes through; any other error becomes a
// failure that shows the exact call.
function attempt(env, call, { checked, input, expected }) {
  try {
    return call();
  } catch (error) {
    if (notWritten(error)) throw error;
    return fail({ checked, input, observed: threw(error, env.workDir), expected });
  }
}

// ---------------------------------------------------------------- the rules, as API.md states them

function readRing(history, tick) {
  if (!Number.isInteger(tick) || tick < 0) return null;
  const slot = history.slots[tick % history.size];
  return slot && slot.tick === tick ? { x: slot.x, y: slot.y } : null;
}

function rttRule(samples) {
  const recent = samples.slice(-RTT_SAMPLES);
  return recent.length ? Math.max(...recent) / TICK_MS : 0;
}

// The judge's answer and the reason for it, step by step.
function judgeRule({ seen, now, window, rtt, history, target, range, readyAt }) {
  if (seen > now) return { want: { accept: false, at: now, reason: 'future' }, why: `seen ${seen} is after now ${now}` };
  if (now < readyAt) return { want: { accept: false, at: now, reason: 'cooldown' }, why: `now ${now} is before readyAt ${readyAt}, and the cooldown is judged at now` };
  const bound = Math.ceil(rtt) + 1;
  const allowed = Math.min(window, bound);
  let at = Math.max(seen, now - allowed);
  let why = `the rewind allowed is min(window ${window}, ceil(rtt ${rtt}) + 1 = ${bound}) = ${allowed} ticks, so at = max(seen ${seen}, now ${now} - ${allowed} = ${now - allowed}) = ${at}`;
  let spot = readRing(history, at);
  if (!spot) {
    const slot = history.slots[at % history.size];
    why += `; the ring does not hold tick ${at} (slot ${at % history.size} ${slot ? `holds tick ${slot.tick}` : 'is empty'}), so it is judged at now, ${now}`;
    at = now;
    spot = readRing(history, now);
  }
  if (!spot) return { want: { accept: false, at, reason: 'range' }, why };
  const d2 = (spot.x - target.x) ** 2 + (spot.y - target.y) ** 2;
  const ok = d2 <= range * range;
  why += `; at tick ${at} the courier stood at (${spot.x}, ${spot.y}), distance squared ${d2} from the target (${target.x}, ${target.y}), ${ok ? 'at most' : 'more than'} ${range} * ${range} = ${range * range}`;
  return { want: { accept: ok, at, reason: ok ? 'ok' : 'range' }, why };
}

const ROW_FIELDS = ['honest', 'legit', 'legitRate', 'naive', 'naiveCheats', 'slow', 'slowCheats'];
function countRule(outcomes) {
  const row = { honest: 0, legit: 0, legitRate: 0, naive: 0, naiveCheats: 0, slow: 0, slowCheats: 0 };
  for (const o of outcomes) {
    const cheat = o.accepted && !o.inRangeNow;
    if (o.who === 'honest') { row.honest += 1; if (!o.accepted && o.inRangeAtSeen) row.legit += 1; }
    if (o.who === 'naiveFaker') { row.naive += 1; if (cheat) row.naiveCheats += 1; }
    if (o.who === 'slowPongFaker') { row.slow += 1; if (cheat) row.slowCheats += 1; }
  }
  row.legitRate = row.honest ? row.legit / row.honest : 0;
  return row;
}
const RULE_TEXT = {
  honest: 'honest interactions',
  legit: 'honest interactions refused although the courier was in range at seen',
  legitRate: 'legit / honest, or 0 when honest is 0',
  naive: 'naiveFaker interactions',
  naiveCheats: 'naiveFaker interactions accepted while the courier was not in range now',
  slow: 'slowPongFaker interactions',
  slowCheats: 'slowPongFaker interactions accepted while the courier was not in range now',
};

// The first field of a tally row that differs from the rule's count, or null.
function rowDifference(got, want) {
  if (!got || typeof got !== 'object') return `the row should be an object but is ${show(got, 60)}`;
  for (const k of ROW_FIELDS) {
    const g = got[k];
    const same = k === 'legitRate' ? typeof g === 'number' && Math.abs(g - want[k]) <= 1e-12 : g === want[k];
    if (!same) return `field ${k}: yours is ${show(g, 60)}, required ${show(want[k], 60)} (${RULE_TEXT[k]})`;
  }
  return null;
}

function pickRule(rows, budget) {
  let best = null;
  for (const row of rows) {
    if (row.legitRate > budget) continue;
    if (!best || row.slowCheats < best.slowCheats || (row.slowCheats === best.slowCheats && row.window < best.window)) best = row;
  }
  return best ? best.window : null;
}

// ---------------------------------------------------------------- crafted rings

function ring(from, to, place, size = HISTORY_TICKS) {
  const history = createHistory(size);
  for (let tick = from; tick <= to; tick += 1) {
    const p = place(tick);
    recordPosition(history, tick, p.x, p.y);
  }
  return history;
}
function describeRing(history) {
  const ticks = history.slots.filter(Boolean).map((s) => s.tick).sort((a, b) => a - b);
  const runs = [];
  for (const t of ticks) {
    const last = runs.at(-1);
    if (last && t === last[1] + 1) last[1] = t;
    else runs.push([t, t]);
  }
  const held = runs.map(([a, b]) => (a === b ? `${a}` : `${a} to ${b}`)).join(', ');
  return `a ring of ${history.size} slots holding ${runs.length ? `ticks ${held}` : 'no ticks'}`;
}
const numbers = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const sameSpot = (got, want) => (want === null ? got === null : !!got && typeof got === 'object' && got.x === want.x && got.y === want.y);

// ---------------------------------------------------------------- judge cases

const TARGET = Object.freeze({ x: 2250, y: 1000 });
const FAR = Object.freeze({ x: 2750, y: 1000 });   // 500 mm from the target
const ON = Object.freeze({ x: 2250, y: 1000 });    // on the target
const EDGE = Object.freeze({ x: 2400, y: 1200 });  // exactly 250 mm away: 150 across, 200 down
const OUT = Object.freeze({ x: 2401, y: 1200 });   // just over 250 mm away

// Each: what is being shown, the call (now 100, window 10, rtt 4, readyAt 0 unless given;
// the ring holds the last 40 ticks up to now; the courier stands 500 mm away except at
// the ticks in `places`, or at `everywhere`), and API.md's answer.
const JUDGE = [
  ['a claim to have seen a tick after now is refused as future', { seen: 101, everywhere: ON }, [false, 100, 'future']],
  ['future is checked before the cooldown', { seen: 103, readyAt: 150, everywhere: ON }, [false, 100, 'future']],
  ['during the cooldown the press is refused, at now', { seen: 99, readyAt: 101, everywhere: ON }, [false, 100, 'cooldown']],
  ['the cooldown is checked before the range', { seen: 99, readyAt: 105 }, [false, 100, 'cooldown']],
  ['now equal to readyAt is past the cooldown', { seen: 99, readyAt: 100, places: { 99: ON } }, [true, 99, 'ok']],
  ['the cooldown is judged at now even when the rewound tick is before readyAt', { seen: 96, readyAt: 98, places: { 96: ON } }, [true, 96, 'ok']],
  ['inside the window and the round trip, the press is judged at seen', { seen: 97, places: { 97: ON } }, [true, 97, 'ok']],
  ['judged at seen, so being in range at now does not count', { seen: 97, places: { 100: ON } }, [false, 97, 'range']],
  ['seen older than allowed is clamped to now - allowed, not refused', { seen: 80, places: { 95: ON } }, [true, 95, 'ok']],
  ['clamped, so being in range at seen does not count', { seen: 80, places: { 80: ON } }, [false, 95, 'range']],
  ['the round-trip bound is tighter than the window', { seen: 95, rtt: 2, places: { 97: ON } }, [true, 97, 'ok']],
  ['tighter round-trip bound: in range only at seen', { seen: 95, rtt: 2, places: { 95: ON } }, [false, 97, 'range']],
  ['the window is tighter than the round-trip bound', { seen: 95, window: 2, rtt: 6, places: { 98: ON } }, [true, 98, 'ok']],
  ['tighter window: in range only inside the round-trip bound', { seen: 95, window: 2, rtt: 6, places: { 97: ON } }, [false, 98, 'range']],
  ['a fractional round trip is rounded up', { seen: 90, rtt: 2.2, places: { 96: ON } }, [true, 96, 'ok']],
  ['a fractional round trip: one tick further back is not allowed', { seen: 90, rtt: 2.2, places: { 95: ON } }, [false, 96, 'range']],
  ['round trip 0 still allows one tick back', { seen: 90, rtt: 0, places: { 99: ON } }, [true, 99, 'ok']],
  ['round trip 0: two ticks back is not allowed', { seen: 90, rtt: 0, places: { 98: ON } }, [false, 99, 'range']],
  ['window 0 judges every press at now', { seen: 97, window: 0, places: { 100: ON } }, [true, 100, 'ok']],
  ['window 0: being in range at seen does not count', { seen: 97, window: 0, places: { 97: ON } }, [false, 100, 'range']],
  ['the ring does not hold the tick to judge at, so it is judged at now', { seen: 30, window: 50, rtt: 60, places: { 100: ON } }, [true, 100, 'ok']],
  ['the ring does not hold the tick: the other tick in that slot does not count', { seen: 30, window: 50, rtt: 60, places: { 90: ON } }, [false, 100, 'range']],
  ['early in a session now - allowed is below 0, so the press is judged at seen', { seen: 0, now: 3, rtt: 8, places: { 0: ON } }, [true, 0, 'ok']],
  ['exactly 250 mm away is in range', { seen: 97, places: { 97: EDGE } }, [true, 97, 'ok']],
  ['just over 250 mm away is out of range', { seen: 97, places: { 97: OUT } }, [false, 97, 'range']],
];

function judgeScene({ seen, now = 100, window = 10, rtt = 4, readyAt = 0, places = {}, everywhere = null }) {
  const history = ring(Math.max(0, now - (HISTORY_TICKS - 1)), now, (t) => places[t] ?? everywhere ?? FAR);
  const where = everywhere
    ? `the courier stood at (${everywhere.x}, ${everywhere.y}) at every tick`
    : `the courier stood ${Object.entries(places).map(([t, p]) => `at (${p.x}, ${p.y}), ${Math.hypot(p.x - TARGET.x, p.y - TARGET.y).toFixed(1).replace(/\.0$/, '')} mm from the target, at tick ${t}`).join(' and ')}${Object.keys(places).length ? ', and ' : ''}500 mm away at (${FAR.x}, ${FAR.y}) at every other tick`;
  const args = { seen, now, window, rtt, history, target: { ...TARGET }, range: RANGE, readyAt, positionAt: readRing };
  const input = `judgeInteract({ seen: ${seen}, now: ${now}, window: ${window}, rtt: ${rtt}, readyAt: ${readyAt}, target: { x: ${TARGET.x}, y: ${TARGET.y} }, range: ${RANGE}, history, positionAt }), where history is ${describeRing(history)} and ${where}`;
  return { args, input };
}

const VERDICT = ['accept', 'at', 'reason'];
const sameVerdict = (got, want) => !!got && typeof got === 'object' && VERDICT.every((k) => got[k] === want[k]);
const showVerdict = (v) => `{ accept: ${v.accept}, at: ${v.at}, reason: ${show(v.reason)} }`;

// ---------------------------------------------------------------- tally and pick cases

function outcome(who, accepted, inRangeNow, inRangeAtSeen, reason) {
  return { who, session: `${who}-1`, accepted, reason: reason ?? (accepted ? 'pickup' : 'range'), inRangeNow, inRangeAtSeen, seen: 40, now: 44, at: 41 };
}
const WHO = ['honest', 'naiveFaker', 'slowPongFaker'];
// Every combination of who, accepted, in range now and in range at seen, each a different number of times.
const EVERY = WHO.flatMap((who, w) => [false, true].flatMap((accepted, a) => [false, true].flatMap((now, n) => [false, true].flatMap((atSeen, s) => {
  const times = 1 + ((w * 8 + a * 4 + n * 2 + s) * 5) % 4;
  return Array.from({ length: times }, () => outcome(who, accepted, now, atSeen));
}))));
const TALLY = [
  ['no outcomes at all', []],
  ['fakers only: no honest interactions, so legitRate is 0', [outcome('naiveFaker', true, false, true), outcome('naiveFaker', false, false, false), outcome('slowPongFaker', true, true, true), outcome('slowPongFaker', true, false, false), outcome('slowPongFaker', true, false, true)]],
  ['every combination of who, accepted, in range now and in range at seen, in different numbers', EVERY],
  ['honest interactions accepted while not in range now are not cheats', [outcome('honest', true, false, true), outcome('honest', true, false, false), outcome('honest', true, false, true), outcome('naiveFaker', true, true, true)]],
  ['an honest press refused for the cooldown while in range at seen counts as legit', [outcome('honest', false, true, true, 'cooldown'), outcome('honest', true, true, true), outcome('honest', true, true, false)]],
  ['legit counts in range at seen, not in range now', [outcome('honest', false, true, false), outcome('honest', false, true, false), outcome('honest', false, false, true), outcome('honest', true, true, true)]],
];

function row(window, legitRate, slowCheats) {
  return { window, honest: 800, legit: Math.round(legitRate * 800), legitRate, naive: 1600, naiveCheats: 0, slow: 2000, slowCheats };
}
const TABLE = [row(0, 0.2077, 0), row(1, 0.1767, 0), row(2, 0.119, 0), row(3, 0.0786, 1797), row(4, 0.0467, 4681), row(5, 0.0384, 8254), row(6, 0.0196, 13279), row(8, 0, 22283), row(10, 0, 22283), row(12, 0, 22283)];
const PICK = [
  ['a table like the lesson\'s, budget 0.02: the fewest slow cheats among the rows within budget', TABLE, 0.02, 6],
  ['the same table, budget 0.01: three rows tie on slow cheats, so the smallest window', TABLE, 0.01, 8],
  ['budget 0: only rows with no legit rejections', TABLE, 0, 8],
  ['a row whose legitRate equals the budget is within it', TABLE, 0.0786, 3],
  ['a budget every row meets: window 0 has no slow cheats', TABLE, 0.5, 0],
  ['the rows in another order: still the fewest slow cheats, then the smallest window', [...TABLE].reverse(), 0.01, 8],
  ['the fewest slow cheats is not at the smallest window', [row(2, 0, 9), row(5, 0, 3), row(9, 0, 3), row(7, 0.001, 4)], 0.01, 5],
  ['a row over the budget is left out even with fewer slow cheats', [row(1, 0.05, 0), row(4, 0.01, 7), row(6, 0.004, 9)], 0.02, 4],
  ['no row within the budget gives null', [row(0, 0.3, 0), row(3, 0.08, 10), row(6, 0.021, 99)], 0.02, null],
  ['no rows at all gives null', [], 0.01, null],
];

// ---------------------------------------------------------------- the sweep

const SWEEP_SEEDS = [11, 29];
const SWEEP_WINDOWS = [0, 2, 3, 4, 6, 7, 8, 12];
const SWEEP_SESSIONS = 20;
const BUDGETS = [0.01, 0.05];

// Wraps your measureRtt and judgeInteract for runCourier: every call is compared with the
// rules at the moment it is made, and the first difference is kept with its interaction
// number (the k-th judge call of a run makes the run's k-th outcome).
function watch(f) {
  const state = { calls: 0, problem: null };
  const keep = (problem) => { state.problem ??= problem; };
  function measureRtt(samples) {
    const copy = samples.slice();
    const want = rttRule(copy);
    let got;
    try {
      got = f.measureRtt(samples);
    } catch (error) {
      if (notWritten(error)) throw error;
      keep({ kind: 'threw', name: 'measureRtt', call: state.calls, error, call_: `measureRtt(${show(copy, 200)})` });
      return want;
    }
    if (typeof got !== 'number' || !(Math.abs(got - want) <= 1e-9)) keep({ kind: 'rtt', call: state.calls, samples: copy, got, want });
    return got;
  }
  function judge(args) {
    const call = state.calls;
    state.calls += 1;
    const slots = args.history.slots;
    const before = slots.map((s) => (s ? { tick: s.tick, x: s.x, y: s.y } : null));
    const frozen = { ...args, history: { size: args.history.size, slots: before }, target: { ...args.target } };
    const { want, why } = judgeRule(frozen);
    let got;
    try {
      got = f.judgeInteract(args);
    } catch (error) {
      if (notWritten(error)) throw error;
      keep({ kind: 'threw', name: 'judgeInteract', call, error, args: frozen });
      return want;
    }
    const changed = slots.findIndex((s, i) => (s ? JSON.stringify({ tick: s.tick, x: s.x, y: s.y }) : 'null') !== JSON.stringify(before[i]));
    if (changed >= 0) keep({ kind: 'ring', call, slot: changed, was: before[changed], now: slots[changed] && { tick: slots[changed].tick, x: slots[changed].x, y: slots[changed].y }, args: frozen });
    else if (!sameVerdict(got, want)) keep({ kind: 'judge', call, args: frozen, got, want, why });
    return got;
  }
  return { measureRtt, judge, state };
}

const showArgs = (a) => `judgeInteract({ seen: ${a.seen}, now: ${a.now}, window: ${a.window}, rtt: ${a.rtt}, readyAt: ${a.readyAt}, target: { x: ${a.target.x}, y: ${a.target.y} }, range: ${a.range}, history, positionAt }) with history ${describeRing(a.history)}`;

function sweepFailure(env, problem, run, setup) {
  const o = run.outcomes[problem.call];
  const input = `runCourier(${setup}), session ${o?.session ?? '?'}, the interaction decided at tick ${o?.now ?? problem.args?.now ?? '?'} (interaction ${problem.call + 1} of the run)`;
  if (problem.kind === 'rtt') {
    fail({ checked: 'measureRtt on the round trips the server measured', input, observed: `measureRtt(${show(problem.samples, 200)}) returned ${show(problem.got)}`, expected: `${problem.want}: the largest of the last ${RTT_SAMPLES} samples (${problem.samples.length ? Math.max(...problem.samples.slice(-RTT_SAMPLES)) : 'none'}) divided by ${TICK_MS}` });
  }
  if (problem.kind === 'threw') {
    fail({ checked: `${problem.name} runs on every interaction of the sessions`, input: `${input}: ${problem.args ? showArgs(problem.args) : problem.call_}`, observed: `your ${problem.name} ${threw(problem.error, env.workDir)}`, expected: 'an answer by the rules in API.md' });
  }
  if (problem.kind === 'ring') {
    fail({ checked: 'judgeInteract (and the positionAt it uses) only read the position ring', input: `${input}: ${showArgs(problem.args)}`, observed: `slot ${problem.slot} held ${show(problem.was)} before the call and ${show(problem.now)} after it`, expected: 'the ring unchanged: it is the server\'s record of where the courier stood, and later presses are judged from it (does your positionAt hand out the slot object itself, and does something change it?)' });
  }
  fail({ checked: 'judgeInteract decides every interaction of the sessions by the rules', input: `${input}: ${showArgs(problem.args)}`, observed: `your result: ${show(problem.got)}`, expected: `${showVerdict(problem.want)}: ${problem.why}` });
}

// ---------------------------------------------------------------- the cases

export const cases = [
  {
    id: '15.position-at', title: 'positionAt reads the ring', timeLimitMs: 10000,
    requirement: 'positionAt(history, tick) returns { x, y } from slot tick % size when that slot holds tick, and null when the slot holds another tick or nothing, or when tick is not a whole number of 0 or more.',
    async run(env) {
      const positionAt = await env.fn(FILE, 'positionAt');
      const place = (t) => ({ x: 1000 + 250 * (t % 7), y: 500 + 250 * Math.floor(t / 7) });
      const scenes = [
        [ring(0, 39, place), numbers(0, 41), 'every slot written once'],
        [ring(0, 45, place), [...numbers(0, 7), 39, 40, 44, 45, 46, 80, 85], 'ticks 40 to 45 were written over ticks 0 to 5 (tick 40 replaced tick 0 in slot 0)'],
        [ring(0, 9, place), [0, 9, 10, 25, 39, 49], 'early in a session: slots 10 to 39 are still empty'],
        [ring(0, 1234, place), [1194, 1195, 1200, 1234, 1235, 1240, 1274], 'after a long session'],
        [ring(0, 23, place, 10), numbers(0, 31), 'a ring of 10 slots: history.size is 10'],
        [ring(0, 45, place), [-1, -40, 2.5, 44.5, NaN, Infinity, '44'], 'ticks that are not whole numbers of 0 or more'],
      ];
      for (const [history, ticks, about] of scenes) {
        for (const tick of ticks) {
          const want = readRing(history, tick);
          const input = `positionAt(history, ${show(tick)}), where history is ${describeRing(history)} (${about})`;
          const got = attempt(env, () => positionAt(history, tick), { checked: 'positionAt runs on this ring', input, expected: show(want) });
          if (sameSpot(got, want)) continue;
          let because = `the position written for tick ${tick}`;
          if (want === null) {
            const slot = Number.isInteger(tick) && tick >= 0 ? history.slots[tick % history.size] : undefined;
            because = slot === undefined ? `${show(tick)} is not a whole number of 0 or more` : slot === null ? `slot ${tick % history.size} is empty` : `slot ${tick % history.size} holds tick ${slot.tick}, not tick ${tick}`;
          }
          fail({ checked: `positionAt reads tick ${show(tick)} from the ring`, input, observed: `your result: ${show(got)}`, expected: `${show(want)}: ${because}` });
        }
      }
    },
  },
  {
    id: '15.measure-rtt', title: 'measureRtt takes the largest recent round trip', timeLimitMs: 10000,
    requirement: 'measureRtt(samples) returns the largest of the last 20 samples divided by 50 (it may be fractional), and 0 when there are no samples.',
    async run(env) {
      const measureRtt = await env.fn(FILE, 'measureRtt');
      const twenty = [180, 95, 110, 60, 75, 240, 130, 90, 85, 100, 120, 70, 65, 150, 99, 101, 88, 77, 66, 140];
      const lists = [
        [[], 'no samples yet'],
        [[100], 'one sample of 100 ms'],
        [[75], 'one sample of 75 ms: 1.5 ticks'],
        [[130, 40, 60], 'the largest first'],
        [[40, 60, 130], 'the largest last'],
        [[50, 400, 100], 'the largest in the middle'],
        [[900, ...twenty.slice(1)], 'exactly 20 samples, the oldest the largest'],
        [[900, ...twenty], '21 samples: the oldest, the largest, is no longer among the last 20'],
        [[1000, 1000, 1000, 1000, 1000, 480, ...twenty.slice(1)], '25 samples: the last 20 start with 480'],
        [[0], 'one sample of 0 ms'],
      ];
      for (const [samples, about] of lists) {
        const want = rttRule(samples);
        const input = `measureRtt(${show(samples, 400)}) (${about})`;
        const got = attempt(env, () => measureRtt(samples.slice()), { checked: 'measureRtt runs on these samples', input, expected: String(want) });
        const ok = typeof got === 'number' && (samples.length ? Math.abs(got - want) <= 1e-9 : Object.is(got, 0) || got === 0);
        if (!ok) {
          const recent = samples.slice(-RTT_SAMPLES);
          fail({ checked: 'measureRtt returns the largest of the last 20 round trips, in ticks', input, observed: `your result: ${show(got)}`, expected: samples.length ? `${want}: the largest of the last ${recent.length} samples is ${Math.max(...recent)} ms, and ${Math.max(...recent)} / ${TICK_MS} = ${want}` : '0: with no samples the round trip is 0 (not null)' });
        }
      }
    },
  },
  {
    id: '15.judge', title: 'judgeInteract rewinds no further than allowed', timeLimitMs: 10000,
    requirement: 'judgeInteract refuses future claims and presses in the cooldown at now, rewinds at most min(window, ceil(rtt) + 1) ticks but never past seen, judges at now when the ring does not hold that tick, and accepts when the courier was within range there.',
    async run(env) {
      const judgeInteract = await env.fn(FILE, 'judgeInteract');
      for (const [what, scene, [accept, at, reason]] of JUDGE) {
        const { args, input } = judgeScene(scene);
        const want = { accept, at, reason };
        const got = attempt(env, () => judgeInteract(args), { checked: `judgeInteract runs: ${what}`, input, expected: showVerdict(want) });
        if (!sameVerdict(got, want)) fail({ checked: `judgeInteract: ${what}`, input, observed: `your result: ${show(got)}`, expected: `${showVerdict(want)}: ${judgeRule(args).why}` });
      }
    },
  },
  {
    id: '15.tally', title: 'tally counts one row of the window table', timeLimitMs: 10000,
    requirement: 'tally(outcomes) counts honest, legit (honest and refused although in range at seen), legitRate (0 with no honest), naive, slow, and the fakers\' accepted presses while not in range now.',
    async run(env) {
      const tally = await env.fn(FILE, 'tally');
      for (const [what, outcomes] of TALLY) {
        const want = countRule(outcomes);
        const listed = outcomes.length > 8 ? `${outcomes.length} outcomes` : show(outcomes.map((o) => ({ who: o.who, accepted: o.accepted, reason: o.reason, inRangeNow: o.inRangeNow, inRangeAtSeen: o.inRangeAtSeen })), 900);
        const input = `tally(outcomes): ${what}; outcomes ${listed}`;
        const got = attempt(env, () => tally(outcomes.map((o) => ({ ...o }))), { checked: `tally runs: ${what}`, input, expected: show(want) });
        const diff = rowDifference(got, want);
        if (diff) fail({ checked: `tally: ${what}`, input, observed: `your row: ${show(got)}`, expected: show(want), diff });
      }
    },
  },
  {
    id: '15.pick', title: 'pickWindow chooses within the budget', timeLimitMs: 10000,
    requirement: 'pickWindow(rows, budget) returns, among rows with legitRate at most budget, the window with the fewest slowCheats (a tie goes to the smaller window), and null when no row is within budget.',
    async run(env) {
      const pickWindow = await env.fn(FILE, 'pickWindow');
      for (const [what, rows, budget, want] of PICK) {
        const input = `pickWindow(rows, ${budget}), rows as { window, legitRate, slowCheats }: ${show(rows.map((r) => ({ window: r.window, legitRate: r.legitRate, slowCheats: r.slowCheats })), 900)}`;
        const got = attempt(env, () => pickWindow(rows.map((r) => ({ ...r })), budget), { checked: `pickWindow runs: ${what}`, input, expected: show(want) });
        if (got !== want) fail({ checked: `pickWindow: ${what}`, input, observed: `your result: ${show(got)}`, expected: show(want) });
      }
    },
  },
  {
    id: '15.sweep', title: 'your functions run the courier sessions', timeLimitMs: 30000,
    requirement: 'With your functions, runCourier on fresh seeds decides every interaction as API.md says, and tally and pickWindow give the rules\' window table and choice for those outcomes.',
    async run(env) {
      const f = {};
      for (const name of ['positionAt', 'measureRtt', 'judgeInteract', 'tally', 'pickWindow']) f[name] = await env.fn(FILE, name);
      for (const seed of SWEEP_SEEDS) {
        const rows = [];
        for (const window of SWEEP_WINDOWS) {
          const setup = `{ seed: ${seed}, sessions: ${SWEEP_SESSIONS}, window: ${window}, judge: your judgeInteract, measureRtt: your measureRtt, positionAt: your positionAt }`;
          const w = watch(f);
          const run = runCourier({ seed, sessions: SWEEP_SESSIONS, window, judge: w.judge, measureRtt: w.measureRtt, positionAt: f.positionAt });
          if (w.state.problem) sweepFailure(env, w.state.problem, run, setup);
          // Where the server's full record fixes the answer: judged at now, or at seen.
          for (const [k, o] of run.outcomes.entries()) {
            if (!o.accepted && (o.reason === 'cooldown' || o.reason === 'future')) continue;
            const fact = o.at === o.now ? ['now', o.inRangeNow] : o.at === o.seen ? ['seen', o.inRangeAtSeen] : null;
            if (fact && fact[1] !== o.accepted) fail({ checked: 'every decision agrees with where the courier really stood', input: `runCourier(${setup}), session ${o.session}, the interaction decided at tick ${o.now} (interaction ${k + 1} of the run)`, observed: `${o.accepted ? 'accepted' : `refused (${o.reason})`}, judged at tick ${o.at}`, expected: `${fact[1] ? 'accepted' : 'refused'}: the server's full record says the courier was ${fact[1] ? '' : 'not '}in range at tick ${o.at} (${fact[0]})` });
          }
          const want = countRule(run.outcomes);
          const input = `tally(the ${run.outcomes.length} outcomes of runCourier(${setup}))`;
          const got = attempt(env, () => f.tally(run.outcomes), { checked: 'tally runs on the outcomes of the sessions', input, expected: show(want) });
          const diff = rowDifference(got, want);
          if (diff) fail({ checked: 'tally counts the sessions\' outcomes by the rules', input, observed: `your row: ${show(got)}`, expected: show(want), diff });
          rows.push({ ...got, window });
        }
        for (const budget of BUDGETS) {
          const want = pickRule(rows, budget);
          const input = `pickWindow(rows, ${budget}) on your window table for seed ${seed}, ${SWEEP_SESSIONS} sessions per model, windows ${SWEEP_WINDOWS.join(', ')}: ${show(rows.map((r) => ({ window: r.window, legitRate: Number(r.legitRate.toFixed(4)), slowCheats: r.slowCheats })), 600)}`;
          const got = attempt(env, () => f.pickWindow(rows.map((r) => ({ ...r })), budget), { checked: 'pickWindow runs on the window table', input, expected: show(want) });
          if (got !== want) fail({ checked: 'pickWindow chooses from the sessions\' window table', input, observed: `your result: ${show(got)}`, expected: show(want) });
        }
      }
    },
  },
];
