import { fail, expectSame, show, fixtureJson, CONTROLS, observed, envWith, gameIdOf, playOn, sayScore, ruleFor, levelNo } from './harness.mjs';
import { makeGame } from '../host.mjs';
import { referee } from '../levels.mjs';

export const title = 'An aim from practice shots';
const L = 'lesson 03';

// The addresses a search finds on Lob, worked out here from the game itself.
const foundFor = (truth) => {
  const base = truth.stateBase();
  return { angle: { addr: base, type: 'f32' }, power: { addr: base + 4, type: 'i32' }, wind: { addr: base + 8, type: 'f32' }, flag: { addr: base + 16, type: 'f32' }, statusLine: truth.lineAddr(), message: truth.msgAddr() };
};
const shots = () => fixtureJson('shots-seed7.json').shots;
const split = (list) => ({ fitOn: list.filter((_, i) => i % 4 !== 3), heldOut: list.filter((_, i) => i % 4 === 3) });

// The best whole power for each angle by trying them all, for a predictor that
// grows with power; the first angle, in the order asked, within `enough`.
function brute(predict, at, { enough, order }) {
  const angles = [];
  for (let a = 5; a <= 85; a++) angles.push(a);
  if (order === 'middle') angles.sort((a, b) => Math.abs(a - 45) - Math.abs(b - 45) || a - b);
  let best = null;
  for (const angle of angles) {
    for (let power = 10; power <= 100; power++) {
      const r = predict(angle, power), t = r ? at(r.frames) : null;
      if (!r || typeof t !== 'number') continue;
      const miss = Math.abs(r.x - t);
      if (!best || miss < best.miss) best = { angle, power, miss };
    }
    if (best && best.miss <= enough) break;
  }
  return best;
}

export const cases = [
  {
    id: '03-test-shot', title: 'testShot reads each landing: from the message until the landing slot is known, then from the slot',
    requirement: 'testShot sets the barrel, fires and waits for the message. A miss gives the flag plus or minus the miss, and the slots in memory within 0.6 of that landing become candidates, narrowed on the next miss; once one is left it is found.landing and landings are read from it. A hit before then gives the flag\'s place.',
    reread: `${L}, test shots and the landing spot`,
    async run({ fn }) {
      const testShot = await fn('learn.mjs', 'testShot');
      const ref = referee({ game: 'lob', mode: 0, seed: 23 });
      const found = foundFor(ref.truth);
      // A decoy: a float below the state that holds the first landing (plus 0.2) and
      // then something else, the way a stale copy might. Only narrowing across misses
      // tells it from the real landing slot.
      const base = ref.truth.stateBase(), decoyAt = base - 32;
      let landings = 0, lastFlying = false;
      const view = { ...ref.host, memory: () => {
        const flying = ref.truth.flying();
        if (lastFlying && !flying) landings++;
        lastFlying = flying;
        const m = ref.host.memory().slice();
        if (landings >= 1) new DataView(m.buffer).setFloat32(decoyAt, landings === 1 ? ref.truth.impactX() + 0.2 : ref.truth.impactX() + 50, true);
        return m;
      } };
      const rows = [];
      for (const power of [70, 55, 40]) {
        ref.host.press('KeyN'); ref.host.tick(2);
        const s = testShot(view, found, CONTROLS, 5, power);
        rows.push({ s, real: ref.shots[ref.shots.length - 1] });
      }
      for (const [i, { s, real }] of rows.entries()) {
        if (!s || s.angle !== 5 || s.power !== [70, 55, 40][i] || !(Math.abs(s.impact_x - real.impact) <= 0.5)) fail({ checked: `testShot at angle 5, power ${[70, 55, 40][i]}`, input: 'seed 23; the shell lands far short of the flag', observed: show(s), expected: `angle 5, power ${[70, 55, 40][i]}, impact_x within 0.5 of where it landed (${real.impact.toFixed(2)})` });
        if (!Number.isInteger(s.frames) || s.frames < 10) fail({ checked: 'frames in testShot\'s result', observed: show(s.frames), expected: 'the number of frames the shot flew before its message appeared' });
      }
      if (!found.landing || found.landing.addr !== ref.truth.stateBase() + 56) fail({ checked: 'found.landing after three misses', input: `a decoy at ${decoyAt} held the first landing (plus 0.2) and then another number`, observed: show(found.landing ?? found.landingCandidates), expected: `{ addr: ${ref.truth.stateBase() + 56}, type: 'f32' }: the misses narrow the candidates to the one slot that keeps holding the landing` });
      ref.host.press('KeyN'); ref.host.tick(2);
      const exact = testShot(ref.host, found, CONTROLS, 40, 85);
      if (!(Math.abs(exact.impact_x - ref.shots[ref.shots.length - 1].impact) < 1e-3)) fail({ checked: 'a landing read once the slot is known', observed: show(exact), expected: `impact_x ${ref.shots[ref.shots.length - 1].impact} exactly, read from the slot` });
      // On seed 44 the first shot of a fresh game at angle 30, power 70 hits.
      const hit = referee({ game: 'lob', mode: 0, seed: 44 });
      const f2 = foundFor(hit.truth);
      const h = testShot(hit.host, f2, CONTROLS, 30, 70);
      if (!hit.truth.message().startsWith('HIT') || !(Math.abs(h.impact_x - h.target_x) < 1e-6)) fail({ checked: 'a hit before the landing slot is known', input: 'seed 44, angle 30, power 70', observed: `${hit.truth.message()}; ${show(h)}`, expected: 'HIT!, with impact_x the flag\'s place: a hit says only "within 12 paces"' });
    },
  },
  {
    id: '03-features', title: 'features gives the five numbers of the vacuum-range fit',
    requirement: 'features(angle, power, wind) = [1, cos a, p² sin 2a, wind (p sin a)², p cos a], with a in radians.',
    reread: `${L}, a fit by least squares`,
    async run({ fn }) {
      const features = await fn('learn.mjs', 'features');
      const a = Math.PI / 6, got = features(30, 70, 2);
      const want = [1, Math.cos(a), 4900 * Math.sin(2 * a), 2 * (70 * Math.sin(a)) ** 2, 70 * Math.cos(a)];
      if (!Array.isArray(got) || got.length !== 5 || got.some((x, i) => !(Math.abs(x - want[i]) < 1e-9))) fail({ checked: 'features(30, 70, 2)', observed: show(got), expected: show(want.map((x) => Number(x.toFixed(6)))) });
    },
  },
  {
    id: '03-least-squares', title: 'leastSquares solves the normal equations',
    requirement: 'leastSquares(A, b) returns the c that makes A c closest to b, or null when the columns of A do not fix it.',
    reread: `${L}, a fit by least squares`,
    async run({ fn }) {
      const leastSquares = await fn('learn.mjs', 'leastSquares');
      const near = (got, want) => Array.isArray(got) && got.length === want.length && got.every((x, i) => Math.abs(x - want[i]) < 1e-6);
      const c1 = leastSquares([[1, 0], [0, 1], [1, 1]], [1, 2, 3]);
      if (!near(c1, [1, 2])) fail({ checked: 'an exact system', input: 'A = [[1,0],[0,1],[1,1]], b = [1,2,3]', observed: show(c1), expected: '[1, 2]' });
      const c2 = leastSquares([[1, 0], [1, 1], [1, 2], [1, 3]], [0, 1, 4, 1]);
      if (!near(c2, [0.6, 0.6])) fail({ checked: 'a line through four points', input: 'points (0,0), (1,1), (2,4), (3,1)', observed: show(c2), expected: '[0.6, 0.6]' });
      const c3 = leastSquares([[1, 2], [2, 4], [3, 6]], [1, 2, 3]);
      if (c3 !== null) fail({ checked: 'a system whose second column is twice the first', observed: show(c3), expected: 'null' });
      // The 14 practice settings' powers and winds, all fired at angle 30: cos(a) is the
      // same for every shot, so its column is a multiple of the first and no single fit
      // exists, though rounding leaves a pivot of about 1e-12 instead of 0.
      const features = await fn('learn.mjs', 'features');
      const powers = [70, 60, 85, 75, 90, 50, 95, 60, 80, 65, 75, 95, 55, 90], winds = [2.39, 2.39, 2.39, 2.39, -2.83, -2.83, -2.83, -2.83, -0.96, -0.96, -0.96, -0.96, 4.29, 4.29];
      const oneAngle = powers.map((p, k) => features(30, p, winds[k]));
      const c5 = leastSquares(oneAngle, oneAngle.map((r, k) => 500 + 3 * k));
      if (c5 !== null) fail({ checked: 'leastSquares on 14 shots all at angle 30', observed: show(c5), expected: 'null: the cos(a) column is the first column times cos 30, so the coefficients are not fixed; judge a pivot against the size of the largest entry on the diagonal, not against a fixed 1e-12' });
      const c4 = leastSquares([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]], [1, 2, 3, 6]);
      if (!near(c4, [1, 2, 3])) fail({ checked: 'an exact system of three unknowns', input: 'A = [[1,0,0],[0,1,0],[0,0,1],[1,1,1]], b = [1,2,3,6]', observed: show(c4), expected: '[1, 2, 3]' });
    },
  },
  {
    id: '03-fit', title: 'fitShots on the recorded practice shots predicts every one within 12 paces',
    requirement: 'fitShots(shots) fits the five coefficients; predictFit(coef, angle, power, wind) is their sum with features().',
    reread: `${L}, a fit by least squares`,
    async run({ fn }) {
      const fitShots = await fn('learn.mjs', 'fitShots');
      const predictFit = await fn('learn.mjs', 'predictFit');
      const all = shots(), { fitOn } = split(all);
      const coef = fitShots(fitOn);
      if (!Array.isArray(coef) || coef.length !== 5) fail({ checked: 'fitShots on 11 practice shots', observed: show(coef), expected: 'five numbers' });
      const worst = Math.max(...all.map((s) => Math.abs(predictFit(coef, s.angle, s.power, s.wind) - s.impact_x)));
      if (!(worst <= 12)) fail({ checked: 'predictFit on the 14 recorded practice shots', input: 'fixtures/shots-seed7.json, fitted on the 11 that are not every 4th', observed: `the worst prediction is ${worst.toFixed(1)} paces off`, expected: 'every one within 12 paces' });
      const feat = [1, Math.cos(Math.PI / 4), 3600, -1 * (60 * Math.sin(Math.PI / 4)) ** 2, 60 * Math.cos(Math.PI / 4)];
      const want = feat.reduce((t, f, i) => t + f * coef[i], 0);
      if (!(Math.abs(predictFit(coef, 45, 60, -1) - want) < 1e-6)) fail({ checked: 'predictFit(coef, 45, 60, -1)', observed: show(predictFit(coef, 45, 60, -1)), expected: `${want.toFixed(4)}, the coefficients times features(45, 60, -1)` });
    },
  },
  {
    id: '03-judge', title: 'judgeFit accepts a fit within 12 paces on both sets, and sends back the others',
    requirement: 'judgeFit(coef, { fitOn, heldOut }) returns { verdict, fitWorst, heldWorst }; verdict is "accept" only if every shot of both sets is predicted within 12 paces. A missing fit is sent back.',
    reread: `${L}, judging the fit`,
    async run({ fn }) {
      const judgeFit = await fn('learn.mjs', 'judgeFit');
      const fitShots = await fn('learn.mjs', 'fitShots');
      const sets = split(shots());
      const coef = fitShots(sets.fitOn);
      const ok = judgeFit(coef, sets);
      if (ok?.verdict !== 'accept' || !(ok.fitWorst <= 12) || !(ok.heldWorst <= 12)) fail({ checked: 'judgeFit on the fit of the recorded shots', observed: show(ok), expected: 'verdict "accept", with both worst misses within 12' });
      const off = [coef[0] + 15, ...coef.slice(1)];
      if (judgeFit(off, sets)?.verdict !== 'send back') fail({ checked: 'judgeFit on the same fit moved 15 paces long', observed: show(judgeFit(off, sets)), expected: 'verdict "send back"' });
      const moved = { fitOn: sets.fitOn, heldOut: sets.heldOut.map((s, i) => (i === 1 ? { ...s, impact_x: s.impact_x + 20 } : s)) };
      const r = judgeFit(coef, moved);
      if (r?.verdict !== 'send back' || !(r.heldWorst > 12) || !(r.fitWorst <= 12)) fail({ checked: 'judgeFit when one held-back shot landed 20 paces further than the fit says', observed: show(r), expected: 'verdict "send back", the held-back worst over 12 and the fitted worst within it' });
      const fitMoved = { fitOn: sets.fitOn.map((s, i) => (i === 2 ? { ...s, impact_x: s.impact_x + 20 } : s)), heldOut: sets.heldOut };
      const f = judgeFit(coef, fitMoved);
      if (f?.verdict !== 'send back' || !(f.fitWorst > 12) || !(f.heldWorst <= 12)) fail({ checked: 'judgeFit when one fitted shot landed 20 paces further than the fit says, and every held-back shot is within 12', observed: show(f), expected: 'verdict "send back", the fitted worst over 12 and the held-back worst within 12: a fit that misses a shot it was made from is sent back, whatever the held-back shots say' });
      if (judgeFit(null, sets)?.verdict !== 'send back') fail({ checked: 'judgeFit with no fit', observed: show(judgeFit(null, sets)), expected: 'verdict "send back"' });
    },
  },
  {
    id: '03-nearest', title: 'nearest picks the practice shot that landed closest to the flag',
    requirement: 'nearest(shots, state) returns the { angle, power } of the shot whose impact_x is closest to state.target_x, or null with no shots.',
    reread: `${L}, aim that needs no fit`,
    async run({ fn }) {
      const nearest = await fn('learn.mjs', 'nearest');
      expectSame(nearest(shots(), { target_x: 640 }), { angle: 30, power: 70 }, { checked: 'nearest with the flag at 640', input: 'fixtures/shots-seed7.json', what: 'the shot' });
      expectSame(nearest(shots(), { target_x: 520 }), { angle: 40, power: 55 }, { checked: 'nearest with the flag at 520', input: 'fixtures/shots-seed7.json: angle 40, power 55 landed at 516.88; angle 50, power 60 at 513.77', what: 'the shot' });
      expectSame(nearest([], { target_x: 520 }), null, { checked: 'nearest with no shots', what: 'the result' });
    },
  },
  {
    id: '03-search', title: 'search finds a whole-number setting that lands where the flag will be',
    requirement: 'search(predict, at, { enough, order }) tries angles in the order asked; for each, powers every 10, then halves each gap where the landing passes the target down to neighbouring whole powers; it stops at the first setting within `enough`, and returns { angle, power, x, frames, miss } or null.',
    reread: `${L}, from a fit to a shot`,
    async run({ fn }) {
      const search = await fn('learn.mjs', 'search');
      const range = (a, p) => ({ x: 90 + (p * p * Math.sin((2 * a * Math.PI) / 180)) / 8, frames: Math.round(p * Math.sin((a * Math.PI) / 180)) });
      let calls = 0;
      const counted = (a, p) => { calls++; return range(a, p); };
      for (const [target, opts] of [[600, { enough: 0.5, order: 'middle' }], [431, { enough: 2, order: 'low' }]]) {
        calls = 0;
        const plan = search(counted, () => target, opts);
        const want = brute(range, () => target, opts);
        if (!plan || plan.angle !== want.angle || plan.power !== want.power || !(Math.abs(plan.miss - want.miss) < 1e-9) || plan.x !== range(plan.angle, plan.power).x || plan.frames !== range(plan.angle, plan.power).frames) fail({ checked: `search for a landing at ${target}, ${opts.order} order, enough ${opts.enough}`, observed: show(plan), expected: `{ angle: ${want.angle}, power: ${want.power}, miss: ${want.miss.toFixed(3)} }: the first angle in that order with a setting within ${opts.enough}, and its best whole power` });
        if (calls > 600) fail({ checked: 'how many settings search tried', observed: `${calls}`, expected: 'at most a few hundred: powers every 10, then halving, and stopping at the first good setting' });
      }
      const moving = search(range, (frames) => 500 + 2 * frames, { enough: 0.5, order: 'middle' });
      const wantMoving = brute(range, (frames) => 500 + 2 * frames, { enough: 0.5, order: 'middle' });
      if (!moving || moving.angle !== wantMoving.angle || moving.power !== wantMoving.power) fail({ checked: 'search when the target depends on the flight time', input: 'at(frames) = 500 + 2 frames', observed: show(moving), expected: `{ angle: ${wantMoving.angle}, power: ${wantMoving.power} }: each setting is compared with at(its own frames)` });
      expectSame(search(() => null, () => 500), null, { checked: 'search when nothing can be predicted', what: 'the result' });
    },
  },
  {
    id: '03-learn-fit', title: 'learnFit fires sighting shots, then 14 practice shots, and keeps a fit only if its judge accepts it',
    requirement: 'learnFit fires sighting shots at angle 5 (powers 70, 55, 40) until the landing slot is known, then the 14 practice shots with a new round before every fourth; it fits on 11 and judges on the 4th, 8th and 12th; kit.shots holds the 14, and kit.fit is { coef, game } only if the judge accepted.',
    reread: `${L}, practice shots, some held back`,
    timeLimitMs: 20000,
    async run({ fn }) {
      const learnFit = await fn('engine.mjs', 'learnFit');
      // On seeds 44 and 50 a fresh game's first shot at angle 30, power 70 would hit.
      for (const seed of [23, 44, 50]) {
        const ref = referee({ game: 'lob', mode: 0, seed });
        const kit = { game: gameIdOf('lob'), controls: { ...CONTROLS }, statusLine: ref.truth.lineAddr(), message: ref.truth.msgAddr(), found: foundFor(ref.truth) };
        const { host, seen } = observed({ host: ref.host, truth: ref.truth });
        await learnFit(host, kit, envWith({ async decide() { return { choice: 0 }; } }));
        if (kit.shots?.length !== 14) fail({ checked: `kit.shots after learnFit (seed ${seed})`, observed: `${kit.shots?.length ?? 'nothing'}`, expected: '14 practice shots (the sighting shots are not practice shots)' });
        const real = ref.shots.slice(-14);
        const off = kit.shots.findIndex((s, i) => !(Math.abs(s.impact_x - real[i]?.impact) < 1e-3));
        if (off >= 0) fail({ checked: `the practice landings in kit.shots (seed ${seed})`, input: `the practice shots' messages began ${real.slice(0, 3).map((x) => `"${x.message}"`).join(', ')}`, observed: `practice shot ${off + 1} is recorded at ${show(kit.shots[off]?.impact_x)}; it landed at ${real[off]?.impact.toFixed(3)}`, expected: 'every landing exact: fire the sighting shots first, so the landing slot is known before a practice shot can hit' });
        const sighters = ref.shots.length - 14;
        if (sighters < 1 || sighters > 3) fail({ checked: `sighting shots before the practice shots (seed ${seed})`, observed: `${sighters}`, expected: 'from 1 to 3, at angle 5, until the landing slot is known' });
        if (!((seen.presses.KeyN ?? 0) >= 4)) fail({ checked: `new rounds during learnFit (seed ${seed})`, observed: `${seen.presses.KeyN ?? 0}`, expected: 'a new round before each sighting shot and before the 1st, 5th, 9th and 13th practice shot' });
        if (!Array.isArray(kit.fit?.coef) || kit.fit.coef.length !== 5 || kit.fit.game !== gameIdOf('lob')) fail({ checked: `kit.fit after learnFit (seed ${seed})`, observed: show(kit.fit), expected: '{ coef: five numbers, game: the gameId } because the judge accepts this fit' });
      }
    },
  },
  {
    id: '03-budget', title: 'playLevel stays inside a level\'s budget, even one too small to learn anything',
    requirement: 'playLevel learns with metered(host, kit, allowance(level)), offers only options whose estimated cost fits what is left, stops repairing when OutOfBudget is thrown, and still plays the scored rounds; it never goes over the budget and never throws for it.',
    reread: `${L}, the budget`,
    timeLimitMs: 20000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      expectSame([1, 3, 8].map((n) => engine.allowance(levelNo(n))), [{ rounds: 18, shots: 20 }, { rounds: 8, shots: 2 }, { rounds: 14, shots: 6 }], { checked: 'allowance on levels 1, 3 and 8 (given code)', what: 'allowances' });
      for (const budget of [{ rounds: 13, shots: 11 }, { rounds: 17, shots: 14 }]) {
        const r = await playOn(engine, 1, {}, ruleFor(engine), { budget });
        if (r.error) fail({ checked: `level 1 with a budget of ${budget.rounds} rounds and ${budget.shots} shots`, observed: `the engine threw: ${String(r.error.message).split('\n')[0]}`, expected: 'no error: running out is handled' });
        if (r.over) fail({ checked: `level 1 with a budget of ${budget.rounds} rounds and ${budget.shots} shots`, observed: sayScore(r), expected: `no more than ${budget.rounds} rounds and ${budget.shots} shots, the scored rounds included` });
        // With 17 rounds the allowance is 7: after the controls' 2, the search's estimate of
        // 6 rounds does not fit in the 5 left, so it must not be offered, let alone started.
        if (budget.rounds === 17) {
          const said = r.env.entries.map((e) => `${e.step}: ${String(e.result)}`);
          if (said.some((x) => /^repair: stopped/.test(x)) || !said.some((x) => /nothing left to try (that )?fits the budget/.test(x))) fail({ checked: 'level 1 with a budget of 17 rounds and 14 shots: 7 rounds to learn with, 5 of them left after the controls', observed: `repairs: ${said.filter((x) => /^repair|^spent/.test(x)).slice(0, 4).join(' / ') || 'none logged'}; last lines logged: ${said.slice(-3).join(' / ') || 'none'}`, expected: 'no option that costs more than the 5 rounds left is offered: the log says nothing left to try that fits the budget, and no repair is started and then stopped by the meter' });
        }
      }
      // A repair can cost more than its estimate: a search of memory that moves every
      // round never settles. The engine must stop when the meter says so, not throw.
      const ref = referee(levelNo(3));
      const kit = { game: gameIdOf('lob'), controls: { ...CONTROLS }, statusLine: ref.truth.lineAddr(), message: ref.truth.msgAddr() };
      const r = await playOn(engine, 3, kit, { calls: [], async decide() { return { choice: 0, ms: 1 }; } }, { budget: { rounds: 17, shots: 12 } });
      if (r.error || r.over) fail({ checked: 'level 3 with option 0 and 7 rounds to learn with', input: 'the search (option 0) runs out of rounds on memory that moves', observed: r.error ? `the engine threw: ${String(r.error.message).split('\n')[0]}` : sayScore(r), expected: 'no error and no more than 17 rounds: OutOfBudget during a repair ends the repairs, and the scored rounds are still played' });
    },
  },

  {
    id: '03-play', title: 'playRounds plays the level\'s rounds with the kit\'s aim, and fires nothing it cannot aim',
    requirement: 'playRounds starts each scored round, aims with the best part in the kit and fires once. With nothing in the kit that reads the state it logs why and fires nothing, without throwing.',
    reread: `${L}, from a fit to a shot`,
    timeLimitMs: 20000,
    async run({ fn }) {
      const playRounds = await fn('engine.mjs', 'playRounds');
      const fitShots = await fn('learn.mjs', 'fitShots');
      const level = levelNo(1);
      const ref = referee(level);
      const kit = { game: gameIdOf('lob'), controls: { ...CONTROLS }, statusLine: ref.truth.lineAddr(), message: ref.truth.msgAddr(), found: { ...foundFor(ref.truth), landing: { addr: ref.truth.stateBase() + 56, type: 'f32' } }, shots: shots(), fit: { coef: fitShots(split(shots()).fitOn), game: gameIdOf('lob') } };
      const env = envWith({ async decide() { return { choice: 0 }; } });
      await playRounds(ref.host, level, kit, env);
      const hits = ref.shots.filter((s) => s.miss <= 12).length;
      if (ref.shots.length !== 10 || hits < 7) fail({ checked: 'playRounds on level 1 with a fit in the kit', observed: `${ref.shots.length} shots, ${hits} within 12 paces`, expected: '10 shots, at least 7 within 12 paces' });
      const bare = referee(level);
      const env2 = envWith({ async decide() { return { choice: 0 }; } });
      await playRounds(bare.host, level, { controls: { ...CONTROLS }, statusLine: bare.truth.lineAddr(), message: bare.truth.msgAddr() }, env2);
      if (bare.shots.length) fail({ checked: 'playRounds with nothing that reads the state', observed: `${bare.shots.length} shots fired`, expected: 'none, and a log entry saying why' });
      if (!env2.entries.some((e) => String(e.result).includes('cannot play'))) fail({ checked: 'what playRounds logged with nothing that reads the state', observed: env2.entries.length ? env2.entries.slice(0, 3).map((e) => `${e.step}: ${e.result}`).join(' / ') : 'nothing', expected: 'an entry for the round whose result starts "cannot play:" and says why, as the lesson gives it' });
    },
  },
  {
    id: '03-level-1', title: 'level 1 passes within its budget',
    requirement: 'From an empty kit, playLevel passes level 1 (7 of the last 10 shots within 12 paces) without going over 28 rounds and 30 shots.',
    reread: `${L}, level 1`,
    timeLimitMs: 40000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const r = await playOn(engine, 1, {}, ruleFor(engine));
      if (!r.pass) fail({ checked: 'level 1 from an empty kit', observed: sayScore(r), expected: '7 of the last 10 shots within 12 paces, within the budget' });
    },
  },
];
