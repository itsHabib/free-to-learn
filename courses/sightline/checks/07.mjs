import { fail, expectSame, show, CONTROLS, observed, envWith, gameIdOf, playOn, sayScore, ruleFor, kitBy, scripted, levelNo } from './harness.mjs';
import { makeGame } from '../host.mjs';
import { referee } from '../levels.mjs';

export const title = 'Race the clock';
const L = 'lesson 07';

function liveEnv(host) {
  const bytes = host.memory();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const load = (type, a) => (a < 0 || a + 4 > bytes.byteLength ? null : type === 'i32.load' ? view.getInt32(a, true) : type === 'f32.load' ? view.getFloat32(a, true) : type === 'i32.load8_u' ? bytes[a] : null);
  return { load, call: (name, args) => (name.endsWith('.sin') ? Math.sin(args[0]) : name.endsWith('.cos') ? Math.cos(args[0]) : null), memo: new Map() };
}

async function passes(fn, game, mode, seed) {
  const parseModule = await fn('wasm.mjs', 'parseModule'), liftAll = await fn('lift.mjs', 'liftAll'), placeKey = await fn('lift.mjs', 'placeKey');
  const launchOf = await fn('flight.mjs', 'launchOf'), aimValues = await fn('flight.mjs', 'aimValues'), flightOf = await fn('flight.mjs', 'flightOf'), decoding = await fn('flight.mjs', 'decoding'), decoder = await fn('flight.mjs', 'decoder');
  const flagOf = await fn('reader.mjs', 'flagOf');
  const g = makeGame({ game, mode, seed });
  const all = liftAll(parseModule(g.host.binary()));
  const key = all.get('game_key'), tick = all.get('game_tick');
  const launch = launchOf(key), aim = aimValues(key, launch), flight = flightOf(tick, launch);
  const d = decoding(aim.angle.value, placeKey(aim.angle.raw.addr, aim.angle.raw.offset));
  const raw = flagOf(tick, flight, d.key).raws[0];
  return { ...g, tick, raw, flag: decoder({ ...d, float: true }, raw) };
}

// A game and its twin: the twin replays every press and tick of the first, so a
// path for the next frames can be read off a copy run ahead. Course code only.
function twinned(game, mode, seed) {
  const g = makeGame({ game, mode, seed });
  const log = [];
  const host = { ...g.host, press: (k) => { log.push(['p', k]); g.host.press(k); }, tick: (n = 1) => { log.push(['t', n]); g.host.tick(n); } };
  const ahead = (frames) => {
    const t = makeGame({ game, mode, seed });
    for (const [kind, v] of log) (kind === 'p' ? t.host.press(v) : t.host.tick(v));
    const path = [t.truth.targetX()];
    for (let k = 0; k < frames; k++) { t.host.tick(1); path.push(t.truth.targetX()); }
    return path;
  };
  return { host, truth: g.truth, ahead };
}

export const cases = [
  {
    id: '07-mover', title: 'the flag\'s motion is the slice of game_tick that decides the flag\'s word',
    requirement: 'moverOf(tickFn, flagRaw) is slice(tickFn.stores, [the flag\'s place]): 6 stores on Lob (the flag, its speed twice, its timer twice, the random generator).',
    reread: `${L}, the flag's motion is a slice`,
    async run({ fn }) {
      const moverOf = await fn('race.mjs', 'moverOf');
      for (const [game, want] of [['lob', 6]]) {
        const p = await passes(fn, game, 0, 3);
        const m = moverOf(p.tick, p.raw);
        if (!Array.isArray(m) || m.length !== want) fail({ checked: `moverOf on ${game}`, observed: show(Array.isArray(m) ? `${m.length} stores` : m, 80), expected: `${want} stores` });
      }
    },
  },
  {
    id: '07-path', title: 'flagPath predicts the flag frame by frame',
    requirement: 'flagPath(bytes, mover, flag, frames) runs the motion slice on a copy of memory a frame at a time and decodes the flag after each: frames + 1 entries, path[0] now. On Lob builds 14 and 15 (bounces and random speed changes) it matches the game to 0.05 paces for 300 frames.',
    reread: `${L}, running the slice on a copy of memory`,
    timeLimitMs: 20000,
    async run({ fn }) {
      const moverOf = await fn('race.mjs', 'moverOf');
      const flagPath = await fn('race.mjs', 'flagPath');
      for (const [game, mode] of [['lob', 14], ['lob', 15]]) {
        const p = await passes(fn, game, mode, 13);
        const mover = moverOf(p.tick, p.raw);
        for (let r = 0; r < 4; r++) {
          p.host.press('KeyN'); p.host.tick(2 + 17 * r);
          const before = p.host.memory().slice();
          const path = flagPath(p.host.memory(), mover, p.flag, 300);
          if (!before.every((b, i) => b === p.host.memory()[i])) fail({ checked: 'what flagPath wrote to the game', observed: 'the game\'s memory changed', expected: 'nothing' });
          if (!Array.isArray(path) || path.length !== 301) fail({ checked: `flagPath for 300 frames (${game}, build ${mode})`, observed: show(Array.isArray(path) ? `${path.length} entries` : path, 80), expected: '301 entries' });
          for (let k = 0; k <= 300; k++) {
            if (k) p.host.tick(1);
            if (!(Math.abs(path[k] - p.truth.targetX()) <= 0.05)) fail({ checked: `flagPath on ${game}, build ${mode}, round ${r + 2}`, observed: `after ${k} frames it says ${show(path[k])}`, expected: `${p.truth.targetX().toFixed(3)}, where the flag was` });
          }
        }
      }
    },
  },
  {
    id: '07-judge-motion', title: 'judgeMotion accepts a right path and refutes wrong ones',
    requirement: 'judgeMotion(host, look, pathNow, { newRound, rounds, frames }) predicts, lets the game run and compares frame by frame within 0.05: { ok, problems, predicted }. A path that ignores the bounce is refuted, and so is one that gives null so early that fewer than 20 frames are predicted.',
    reread: `${L}, the motion judge`,
    timeLimitMs: 30000,
    async run({ fn }) {
      const judgeMotion = await fn('race.mjs', 'judgeMotion');
      const run = (pathOf) => { const t = twinned('lob', 14, 21); return judgeMotion(t.host, () => ({ target_x: t.truth.targetX() }), (frames) => pathOf(t, frames), { newRound: 'KeyN', rounds: 3, frames: 300 }); };
      const ok = run((t, frames) => t.ahead(frames));
      if (!ok?.ok || !(ok.predicted >= 20)) fail({ checked: 'judgeMotion with the path a twin of the game shows', observed: show(ok), expected: 'ok true' });
      const straight = run((t, frames) => { const p = t.ahead(1); return Array.from({ length: frames + 1 }, (_, k) => p[0] + k * (p[1] - p[0])); });
      if (straight?.ok !== false) fail({ checked: 'judgeMotion with a path that keeps the flag\'s speed for ever', observed: show(straight), expected: 'ok false: the flag bounces and changes speed' });
      const early = run((t, frames) => t.ahead(frames).map((x, k) => (k > 3 ? null : x)));
      if (early?.ok !== false) fail({ checked: 'judgeMotion with a path that gives null after 3 frames', observed: show(early), expected: 'ok false: too few frames predicted to plan a shot' });
    },
  },
  {
    id: '07-lead', title: 'lead fires so the shell lands where the flag will be',
    requirement: 'lead(state, predict, path, delay) searches for a setting whose landing, delay + frames from now, is within 0.5 paces of path[delay + frames] with the exact wind, or, with only arrows, takes the lowest angle that lands within 2 paces at the middle of the band.',
    reread: `${L}, leading the flag`,
    async run({ fn }) {
      const lead = await fn('race.mjs', 'lead');
      const predict = (angle, power, wind) => ({ x: 90 + (power * power * Math.sin((2 * angle * Math.PI) / 180)) / 8 + 20 * wind, frames: Math.round(power * Math.sin((angle * Math.PI) / 180)) });
      const path = Array.from({ length: 701 }, (_, k) => 600 + 1.5 * k);
      const plan = lead({ wind: 1, wind_arrows: null, target_x: 600 }, predict, path, 6);
      if (!plan || !(Math.abs(predict(plan.angle, plan.power, 1).x - path[6 + plan.frames]) <= 0.5)) fail({ checked: 'lead with the exact wind, a flag moving 1.5 paces a frame and 6 frames of delay', observed: show(plan), expected: 'a setting whose landing is within 0.5 of path[6 + its frames]' });
      const winds = new Set();
      const banded = lead({ wind: null, wind_arrows: -1, target_x: 600 }, (a, p, w) => { winds.add(w); return predict(a, p, w); }, path, 1);
      if (!banded || winds.size !== 1 || [...winds][0] !== -1.5 || !(Math.abs(predict(banded.angle, banded.power, -1.5).x - path[1 + banded.frames]) <= 2)) fail({ checked: 'lead with one arrow against the wind', observed: `${show(banded)}, planned with wind ${show([...winds])}`, expected: 'planned with wind -1.5, the middle of the band, landing within 2 paces of where the flag will be' });
      for (let a = 5; a < banded.angle; a++) for (let p = 10; p <= 100; p++) { const r = predict(a, p, -1.5); if (Math.abs(r.x - path[1 + r.frames]) <= 2) fail({ checked: 'whether a lower angle would also do with only arrows', observed: `angle ${a}, power ${p}`, expected: 'the lowest angle that lands within 2 paces' }); }
    },
  },
  {
    id: '07-ready', title: 'ready fires only a plan within 2 paces',
    requirement: 'ready(plan) is true for a plan whose miss is at most 2, false for a worse one and for no plan.',
    reread: `${L}, leading the flag`,
    async run({ fn }) {
      const ready = await fn('race.mjs', 'ready');
      expectSame([ready(null), ready(undefined), ready({ miss: 2 }), ready({ miss: 2.01 }), ready({ miss: 0 })], [false, false, true, false, true], { checked: 'ready on no plan, misses of 2, 2.01 and 0', what: 'results' });
    },
  },
  {
    id: '07-learn-motion', title: 'learnMotion watches the flag for 2 rounds before installing its motion',
    requirement: 'learnMotion(host, kit, env, which) judges the path from analyse(host).readers[which] over 2 rounds and only then sets kit.mover = { game, which, says }.',
    reread: `${L}, the motion judge`,
    timeLimitMs: 60000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const kit = await kitBy(engine, 5);
      const ref = referee(levelNo(6));
      const { host, seen } = observed({ host: ref.host, truth: ref.truth });
      await engine.learnMotion(host, kit, envWith(ruleFor(engine)), 0);
      if (!kit.mover || kit.mover.game !== gameIdOf('lob') || kit.mover.which !== 0 || typeof kit.mover.says !== 'string') fail({ checked: 'kit.mover after learnMotion on level 6', observed: show(kit.mover), expected: '{ game: the gameId, which: 0, says: what the code says about the flag, in words }' });
      if ((seen.presses.KeyN ?? 0) !== 2) fail({ checked: 'rounds learnMotion spent', observed: `${seen.presses.KeyN ?? 0}`, expected: '2' });
    },
  },
  {
    id: '07-decider', title: 'the model may decide in time only if its answers are steady enough',
    requirement: 'pickDecider(env, budget) times three answers: the middle one, in frames, is the delay to plan for; the spread between fastest and slowest must be within the budget for the model to decide; otherwise, or if the model is not there, code decides with { who: "code", frames: 1 }.',
    reread: `${L}, when the decision model may decide`,
    async run({ fn }) {
      const pickDecider = await fn('engine.mjs', 'pickDecider');
      expectSame(await pickDecider(envWith(scripted({ decide: () => 0, decideMs: [100, 110, 105] })), 5), { who: 'model', frames: 6 }, { checked: 'answers of 100, 110 and 105 ms with a budget of 5 frames', what: 'the decider' });
      expectSame(await pickDecider(envWith(scripted({ decide: () => 0, decideMs: [100, 400, 250] })), 5), { who: 'code', frames: 1 }, { checked: 'answers of 100, 400 and 250 ms with a budget of 5 frames', what: 'the decider' });
      expectSame(await pickDecider(envWith(scripted({ decide: ['unavailable'] })), 5), { who: 'code', frames: 1 }, { checked: 'a decision model that is not there', what: 'the decider' });
    },
  },
  {
    id: '07-wait', title: 'after "wait", the model\'s time passes and the engine looks again',
    requirement: 'When the model decides and answers "Wait and look again", playRounds lets the decider\'s frames pass, then looks and plans again before it asks again or fires. A model that always waits still gets one shot fired in each round once 600 frames have passed, from a plan made after its last wait, so those shots hit as level 6 asks.',
    reread: `${L}, fire or wait`,
    timeLimitMs: 240000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const kit = await kitBy(engine, 6);
      kit.decider = { who: 'model', frames: 9 };
      const ref = referee({ ...levelNo(6), seed: 66 });
      let frames = 0;
      const host = { ...ref.host, tick: (n = 1) => { frames += n; ref.host.tick(n); } };
      const asked = [];
      const picker = { calls: [], async decide(text, labels) { asked.push(frames); return { choice: labels[1]?.startsWith('Wait') && asked.length % 2 === 1 ? 1 : 0, ms: 150 }; } };
      await engine.playRounds(host, { ...levelNo(6), rounds: 3 }, kit, envWith(picker));
      const gaps = [];
      for (let i = 0; i + 1 < asked.length; i += 2) gaps.push(asked[i + 1] - asked[i]);
      if (!gaps.length || gaps.some((g) => g < 9)) fail({ checked: 'frames between a "wait" and the next question', observed: show(gaps), expected: 'at least 9 each time, the decider\'s frames' });

      // A model that answers "wait" every time, for ten rounds: each round's 600
      // frames run out right after a wait. The engine must read the game again after
      // that wait and fire the plan it makes then; a plan made before the wait aims
      // for a moment that has passed, and on a moving flag it misses.
      const ref2 = referee({ ...levelNo(6), seed: 67 });
      const events = [];
      const host2 = {
        ...ref2.host,
        tick: (n = 1) => { events.push(['tick', n]); ref2.host.tick(n); },
        memory: () => { events.push(['read']); return ref2.host.memory(); },
        press: (key) => { events.push(['press', key]); ref2.host.press(key); },
      };
      let streak = 0, longest = 0, shotsSeen = 0, tooLong = false;
      const waiter = {
        calls: [],
        async decide(text, labels) {
          if (ref2.seen.shots !== shotsSeen) { shotsSeen = ref2.seen.shots; streak = 0; }
          // Past 300 questions in one round the clock is missing: answer "Fire now"
          // from then on, so the check ends quickly and says so.
          const wait = !tooLong && labels[1]?.startsWith('Wait') && ++streak <= 300;
          longest = Math.max(longest, streak);
          if (streak > 300) tooLong = true;
          events.push(['answer', wait ? 1 : 0]);
          return { choice: wait ? 1 : 0, ms: 150 };
        },
      };
      // This model answers in 30 frames, half a second, so a round holds about 20 waits.
      const slow = { ...kit, decider: { who: 'model', frames: 30 } };
      await engine.playRounds(host2, { ...levelNo(6), rounds: 10 }, slow, envWith(waiter));
      const always = 'a model that answers "Wait and look again" every time, in 30 frames, for ten rounds of level 6';
      if (longest > 300) fail({ checked: always, observed: `the engine asked ${longest} times in one round and was still asking`, expected: 'it stops asking once 600 frames of the round have passed, and fires' });
      if (ref2.seen.shots !== 10) fail({ checked: always, observed: `${ref2.seen.shots} shots fired`, expected: '10, one a round: once 600 frames have passed the engine fires without asking' });
      // Until the first shot leaves, no more than the decider's 30 frames may pass
      // between two reads of the memory: a wait is followed by a look, and so is a
      // frame let pass because the plan wasn't ready.
      let since = 0, most = 0;
      for (const [kind, n] of events) {
        if (kind === 'press' && n === kit.controls.fire) break;
        if (kind === 'read') since = 0;
        if (kind === 'tick') { since += n; most = Math.max(most, since); }
      }
      if (most > 30) fail({ checked: `${always}: the most frames that passed between two reads of the game's memory before the first shot left`, observed: `${most} frames`, expected: 'at most 30, the decider\'s frames: after a wait, and after a frame let pass for a plan that wasn\'t ready, the engine looks again, also when the 600 frames have run out' });
      // And the shot must come from that look: fired from a plan made after the last
      // wait, the shots hit as they do when the model answers at once.
      const misses = ref2.shots.slice(-10).map((x) => x.miss);
      const hits = misses.filter((m) => m <= 12).length;
      if (hits < 9) fail({ checked: `${always}: the shots fired when the 600 frames ran out`, observed: `${hits} of 10 within 12 paces; misses ${misses.map((m) => m.toFixed(1)).join(', ')}`, expected: 'at least 9 of 10, as level 6 asks: each shot leaves from the plan made after the last wait, aimed for the frame it leaves, not from a plan made before the wait' });
    },
  },
  {
    id: '07-sweep', title: 'FRAME_BUDGET is what your own sweep gives',
    requirement: 'FRAME_BUDGET in race.mjs is the largest unplanned delay at which your sweep of level 6 still hit 9 of 10, less 1.',
    reread: `${L}, the frame budget`,
    timeLimitMs: 90000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const race = await load('race.mjs');
      const kit = await kitBy(engine, 6);
      const level = levelNo(6);
      const rows = await engine.sweep(() => makeGame({ game: level.game, mode: level.mode, seed: level.seed }).host, level, kit, envWith(ruleFor(engine)), [1, 2, 3, 4, 6, 9, 12]);
      const best = Math.max(...rows.filter((r) => r.unplanned >= 9).map((r) => r.latency));
      if (race.FRAME_BUDGET !== best - 1) fail({ checked: 'FRAME_BUDGET against your sweep of level 6', observed: `FRAME_BUDGET is ${race.FRAME_BUDGET}; your sweep: ${rows.map((r) => `${r.latency} frames late, ${r.unplanned} hits unplanned`).join('; ')}`, expected: `${best - 1}: the largest unplanned delay that still hit 9 of 10 (${best}), less the frame the plan already counts` });
    },
  },
  ...[6, 7].map((n) => ({
    id: `07-level-${n}`, title: `level ${n} passes within its budget`,
    requirement: `From the kit level ${n - 1} leaves, playLevel passes level ${n}, ${levelNo(n).name}, within ${levelNo(n).budget.rounds} rounds and ${levelNo(n).budget.shots} shots.`,
    reread: `${L}, levels 6 and 7`,
    timeLimitMs: 90000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const kit = await kitBy(engine, n - 1);
      const r = await playOn(engine, n, kit, ruleFor(engine));
      if (!r.pass) fail({ checked: `level ${n} from the kit level ${n - 1} left`, observed: sayScore(r), expected: `${levelNo(n).pass} of the last 10 shots within 12 paces, within the budget` });
    },
  })),
];
