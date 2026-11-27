import { fail, expectSame, show, CONTROLS, observed, envWith, gameIdOf, playOn, sayScore, ruleFor, menusOf, kitBy, scripted, first, levelNo } from './harness.mjs';
import { makeGame } from '../host.mjs';
import { referee } from '../levels.mjs';

export const title = 'The game fights back';
const L = 'lesson 06';

function liveEnv(host) {
  const bytes = host.memory();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const load = (type, a) => (a < 0 || a + 4 > bytes.byteLength ? null : type === 'i32.load' ? view.getInt32(a, true) : type === 'f32.load' ? view.getFloat32(a, true) : type === 'i32.load8_u' ? bytes[a] : null);
  return { load, call: () => null, memo: new Map() };
}

// The passes, run with your own functions, on one game.
async function passes(fn, game, mode, seed) {
  const parseModule = await fn('wasm.mjs', 'parseModule'), liftAll = await fn('lift.mjs', 'liftAll'), placeKey = await fn('lift.mjs', 'placeKey');
  const launchOf = await fn('flight.mjs', 'launchOf'), aimValues = await fn('flight.mjs', 'aimValues'), flightOf = await fn('flight.mjs', 'flightOf'), decoding = await fn('flight.mjs', 'decoding');
  const g = makeGame({ game, mode, seed });
  const all = liftAll(parseModule(g.host.binary()));
  const key = all.get('game_key'), tick = all.get('game_tick');
  const launch = launchOf(key), aim = aimValues(key, launch), flight = flightOf(tick, launch);
  const d = decoding(aim.angle.value, placeKey(aim.angle.raw.addr, aim.angle.raw.offset));
  return { ...g, key, tick, launch, aim, flight, d };
}

// A state read from the game itself, for checkReader's tests.
const truthState = (truth, change = {}) => () => {
  const level = truth.windLevel();
  const line = truth.line().match(/WIND ([-+][\d.]+)/);
  return { angle: truth.angle(), power: truth.power(), wind: line ? Number(line[1]) : null, wind_arrows: line ? null : level, target_x: truth.targetX(), ...change };
};

// The kit levels 1 and 2 leave when every menu is answered with option 0: the
// controls, addresses from a search, a fit and the physics.
async function searchedKit(engine) {
  const kit = {};
  for (const n of [1, 2]) {
    const r = await playOn(engine, n, kit, first);
    if (!r.pass) fail({ checked: `the kit levels 1 and 2 leave with option 0 on every menu, which this check starts from`, input: `level ${n}`, observed: sayScore(r), expected: `level ${n} passed` });
  }
  if (!kit.found) fail({ checked: 'the kit levels 1 and 2 leave with option 0 on every menu', observed: `it holds ${Object.keys(kit).join(', ')}`, expected: 'addresses found by a search (kit.found): with option 0 the search comes before reading the code' });
  return kit;
}

export const cases = [
  {
    id: '06-flag', title: 'flagOf finds the hit radius and where the flag is stored',
    requirement: 'flagOf(tickFn, flight, key) finds the value game_tick subtracts from the landing before comparing the distance with a constant: { value, radius, raws }, raws being loads of the places the flag may be stored at. On every build of Lob there is one, and decoded it is the flag.',
    reread: `${L}, the flag, found by the hit test`,
    async run({ fn }) {
      const flagOf = await fn('reader.mjs', 'flagOf');
      const decoder = await fn('flight.mjs', 'decoder');
      const evaluate = await fn('lift.mjs', 'evaluate');
      for (const [game, mode] of [['lob', 0], ['lob', 14], ['lob', 6]]) {
        const p = await passes(fn, game, mode, 7);
        const f = flagOf(p.tick, p.flight, p.d.key);
        if (f?.radius !== 12 || f.raws?.length !== 1) fail({ checked: `flagOf on ${game}, build ${mode}`, observed: show(f && { radius: f.radius, raws: f.raws?.length }), expected: '{ radius: 12, raws: one place }' });
        p.host.tick(30);
        const x = evaluate(decoder({ ...p.d, float: true }, f.raws[0]), liveEnv(p.host));
        if (!(Math.abs(x - p.truth.targetX()) < 1e-4)) fail({ checked: `the flag decoded from the place flagOf found (${game}, build ${mode})`, observed: show(x), expected: `${p.truth.targetX()}` });
      }
    },
  },
  {
    id: '06-read-state', title: 'readState reads the game through what the code says',
    requirement: 'readerFrom(aim, flight, flagRaw) gives expressions for angle, power, wind and flag; readState(host, reader, lineAddr) evaluates them on live memory and returns { angle, power, wind, wind_arrows, target_x }. Where the code takes the wind from the server, wind is null and wind_arrows comes from the status line.',
    reread: `${L}, a reader made of the code's expressions`,
    async run({ fn }) {
      const flagOf = await fn('reader.mjs', 'flagOf'), readerFrom = await fn('reader.mjs', 'readerFrom'), readState = await fn('reader.mjs', 'readState');
      for (const [game, mode] of [['lob', 2], ['lob', 6], ['lob', 7], ['lob', 15]]) {
        const p = await passes(fn, game, mode, 9);
        const reader = readerFrom(p.aim, p.flight, flagOf(p.tick, p.flight, p.d.key).raws[0]);
        for (let r = 0; r < 3; r++) {
          p.host.press('KeyN'); p.host.tick(2 + 5 * r); p.host.press('ArrowUp');
          const s = readState(p.host, reader, p.truth.lineAddr());
          const line = p.truth.line().match(/WIND ([-+][\d.]+)/);
          const windOk = mode & 1 ? s.wind === null && s.wind_arrows === p.truth.windLevel() : typeof s.wind === 'number' && Math.abs(s.wind - Number(line[1])) <= 0.051 && s.wind_arrows === null;
          if (!(Math.abs(s.angle - p.truth.angle()) < 1e-6) || s.power !== p.truth.power() || !(Math.abs(s.target_x - p.truth.targetX()) < 1e-4) || !windOk) fail({ checked: `readState on ${game}, build ${mode}, round ${r + 2}`, observed: show(s), expected: `angle ${p.truth.angle()}, power ${p.truth.power()}, target_x ${p.truth.targetX().toFixed(3)}, ${mode & 1 ? `wind null and wind_arrows ${p.truth.windLevel()}` : `wind near ${line?.[1]} and wind_arrows null`}` });
        }
      }
    },
  },
  {
    id: '06-check-reader', title: 'checkReader accepts a right reader and refutes wrong ones',
    requirement: 'checkReader(host, look, { lineAddr, rounds, newRound }) starts each round, reads the state and compares it with the status line and the flag on screen: { ok, rows, problems }. A wrong angle, a flag far from the one on screen, and a number for the wind where the screen shows arrows are each refuted.',
    reread: `${L}, the screen check`,
    async run({ fn }) {
      const checkReader = await fn('reader.mjs', 'checkReader');
      const run = (mode, change) => { const g = makeGame({ mode, seed: 11 }); return checkReader(g.host, truthState(g.truth, change), { lineAddr: g.truth.lineAddr(), rounds: 3, newRound: 'KeyN' }); };
      const ok = run(6, {});
      if (!ok?.ok || ok.rows?.length !== 3) fail({ checked: 'checkReader with a right reader over 3 rounds', observed: show(ok && { ok: ok.ok, rows: ok.rows?.length, problems: ok.problems }), expected: 'ok true, 3 rows, no problems' });
      for (const [what, mode, change] of [['an angle 3 too high', 6, null], ['a flag 50 paces from the one on screen', 6, 'flag'], ['a wind of 1.5 where the screen shows arrows', 7, { wind: 1.5, wind_arrows: null }]]) {
        const g = makeGame({ mode, seed: 11 });
        const look = change === null ? () => ({ ...truthState(g.truth)(), angle: g.truth.angle() + 3 }) : change === 'flag' ? () => ({ ...truthState(g.truth)(), target_x: g.truth.targetX() + 50 }) : truthState(g.truth, change);
        const v = checkReader(g.host, look, { lineAddr: g.truth.lineAddr(), rounds: 3, newRound: 'KeyN' });
        if (v?.ok !== false || !v.problems?.length) fail({ checked: `checkReader with ${what}`, observed: show(v && { ok: v.ok, problems: v.problems }), expected: 'ok false, with a problem that says what disagreed' });
      }
      const g = makeGame({ mode: 0, seed: 11 });
      const thrower = checkReader(g.host, () => { throw new Error('no such field'); }, { lineAddr: g.truth.lineAddr(), rounds: 3, newRound: 'KeyN' });
      if (thrower?.ok !== false) fail({ checked: 'checkReader with a reader that throws', observed: show(thrower), expected: 'ok false, not an exception' });
    },
  },
  {
    id: '06-wind-band', title: 'windBand gives the winds an arrow count can stand for',
    requirement: 'Each arrow is 1.5 units, the count is rounded, and the wind stays between -5 and 5: windBand(n) = [max(-5, 1.5 (n - 0.5)), min(5, 1.5 (n + 0.5))].',
    reread: `${L}, wind the client never sees`,
    async run({ fn }) {
      const windBand = await fn('reader.mjs', 'windBand');
      expectSame([windBand(0), windBand(1), windBand(3), windBand(-3)], [[-0.75, 0.75], [0.75, 2.25], [3.75, 5], [-5, -3.75]], { checked: 'windBand for 0, 1, 3 and -3 arrows', what: 'bands' });
    },
  },
  {
    id: '06-aim-band', title: 'aimBand plans for the middle of the band and takes the shortest flight that lands within 2 paces',
    requirement: 'aimBand(state, predict) searches with the wind at the middle of the band, lowest angle first, and stops at the first setting within 2 paces of the flag.',
    reread: `${L}, aiming inside the band`,
    async run({ fn }) {
      const aimBand = await fn('reader.mjs', 'aimBand');
      const winds = [];
      const predict = (angle, power, wind) => { winds.push(wind); return { x: 90 + (power * power * Math.sin((2 * angle * Math.PI) / 180)) / 8 + 20 * wind, frames: Math.round(power * Math.sin((angle * Math.PI) / 180)) }; };
      const plan = aimBand({ angle: 45, power: 60, wind: null, wind_arrows: 2, target_x: 700 }, predict);
      if (!winds.length || winds.some((w) => w !== 3)) fail({ checked: 'the wind aimBand plans with for 2 arrows', observed: show([...new Set(winds)]), expected: '3, the middle of the band [2.25, 3.75]' });
      if (!plan || !(plan.miss <= 2)) fail({ checked: 'aimBand\'s plan', observed: show(plan), expected: 'a setting within 2 paces of 700' });
      for (let a = 5; a < plan.angle; a++) for (let p = 10; p <= 100; p++) if (Math.abs(predict(a, p, 3).x - 700) <= 2) fail({ checked: 'whether a lower angle would also do', observed: `angle ${a}, power ${p} lands within 2 paces, below your angle ${plan.angle}`, expected: 'the lowest angle with a setting within 2 paces: the shortest flight' });
    },
  },
  {
    id: '06-learn-reader', title: 'learnReader tests the code\'s reader against the screen for 3 rounds before installing it',
    requirement: 'learnReader(host, kit, env, which) builds the reader from analyse(host).readers[which], checks it against the screen for 3 rounds, and only then sets kit.reader = { game, which, says } and drops kit.found.',
    reread: `${L}, learning the reader`,
    timeLimitMs: 20000,
    async run({ fn }) {
      const learnReader = await fn('engine.mjs', 'learnReader');
      const ref = referee(levelNo(3));
      const { host, seen } = observed({ host: ref.host, truth: ref.truth });
      const kit = { game: gameIdOf('lob'), controls: { ...CONTROLS }, statusLine: ref.truth.lineAddr(), message: ref.truth.msgAddr(), found: { stale: true } };
      await learnReader(host, kit, envWith(first), 0);
      if (!kit.reader || kit.reader.game !== gameIdOf('lob') || kit.reader.which !== 0 || typeof kit.reader.says !== 'string') fail({ checked: 'kit.reader after learnReader on level 3', observed: show(kit.reader), expected: '{ game: the gameId, which: 0, says: what the code says about the state, in words }' });
      if (kit.found) fail({ checked: 'kit.found after the reader is installed', observed: show(kit.found), expected: 'gone: nothing reads the state through searched addresses once the code\'s reader is in' });
      if ((seen.presses.KeyN ?? 0) !== 3) fail({ checked: 'rounds learnReader spent', observed: `${seen.presses.KeyN ?? 0}`, expected: '3' });
      // A screen that shows the flag 100 pixels to the right of where memory has it: the
      // reader agrees with memory, not with the screen, so it must not be installed.
      const ref2 = referee(levelNo(3));
      const shifted = { ...ref2.host, screen: () => { const s = ref2.host.screen(); const data = new Uint8ClampedArray(s.data.length); for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) { const from = (y * s.width + x) * 4, to = (y * s.width + Math.min(s.width - 1, x + 100)) * 4; if (s.data[from] > 190 && s.data[from + 1] < 120) data.set(s.data.subarray(from, from + 4), to); else if (data[from + 3] === 0) data.set([214, 235, 255, 255], from); } return { ...s, data }; } };
      const kit2 = { game: gameIdOf('lob'), controls: { ...CONTROLS }, statusLine: ref2.truth.lineAddr(), message: ref2.truth.msgAddr() };
      const got = await learnReader(shifted, kit2, envWith(first), 0);
      if (got || kit2.reader) fail({ checked: 'learnReader when the screen shows the flag 100 pixels from where the reader puts it', observed: show(kit2.reader), expected: 'null, and no reader in the kit: the screen check refuted it' });
    },
  },
  {
    id: '06-check-kit', title: 'checkKit finds the first problem, most basic first, with its evidence',
    requirement: 'checkKit(host, kit, level, env) returns null when the kit is ready, or { part, why, evidence, options }: controls before state before flag before aim; evidence holds moves (searched addresses failed a round later), arrows (the status line shows arrows), exact (radius under 12) and flag-moves.',
    reread: `${L}, the engine checks its kit`,
    timeLimitMs: 40000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const at = (n) => referee(levelNo(n));
      const env = envWith(first);
      const p1 = await engine.checkKit(at(1).host, {}, levelNo(1), env);
      if (p1?.part !== 'controls') fail({ checked: 'checkKit with an empty kit on level 1', observed: show(p1 && { part: p1.part, why: p1.why }), expected: 'part "controls"' });
      const r2 = at(1), base = { game: gameIdOf('lob'), controls: { ...CONTROLS }, statusLine: r2.truth.lineAddr(), message: r2.truth.msgAddr() };
      const p2 = await engine.checkKit(r2.host, { ...base }, levelNo(1), env);
      if (p2?.part !== 'state') fail({ checked: 'checkKit with the controls but nothing that reads the state', observed: show(p2 && { part: p2.part, why: p2.why }), expected: 'part "state"' });
      const kit = await searchedKit(engine);
      const r3 = at(3);
      const p3 = await engine.checkKit(r3.host, kit, levelNo(3), env);
      if (p3?.part !== 'state' || !p3.evidence?.includes('moves')) fail({ checked: 'checkKit on level 3 with addresses a search found on level 2', observed: show(p3 && { part: p3.part, why: p3.why, evidence: p3.evidence }), expected: 'part "state" with evidence "moves": a round later the addresses no longer hold what the screen shows' });
      const ready = await kitBy(engine, 4);
      const noPhysics = { ...ready };
      delete noPhysics.physics;
      const p5 = await engine.checkKit(at(5).host, { ...noPhysics }, levelNo(5), env);
      if (p5?.part !== 'aim' || !p5.evidence?.includes('arrows')) fail({ checked: 'checkKit on level 5 with a reader and no physics', observed: show(p5 && { part: p5.part, evidence: p5.evidence }), expected: 'part "aim" with evidence "arrows": the status line shows only wind arrows' });
      const p2b = await engine.checkKit(at(2).host, noPhysics, levelNo(2), env);
      if (p2b?.part !== 'aim' || !p2b.evidence?.includes('exact')) fail({ checked: 'checkKit on level 2 with a reader and no physics', observed: show(p2b && { part: p2b.part, evidence: p2b.evidence }), expected: 'part "aim" with evidence "exact": the target is 3 paces wide' });
      const p6 = await engine.checkKit(at(6).host, { ...ready }, levelNo(6), env);
      if (p6?.part !== 'flag' || !p6.evidence?.includes('flag-moves')) fail({ checked: 'checkKit on level 6 with the kit level 4 left', observed: show(p6 && { part: p6.part, evidence: p6.evidence }), expected: 'part "flag" with evidence "flag-moves"' });
      expectSame(await engine.checkKit(at(4).host, { ...ready }, levelNo(4), env), null, { checked: 'checkKit on level 4 with the kit level 4 left', what: 'the problem' });
    },
  },
  {
    id: '06-menu', title: 'the state problem offers the search first, then each reader the code suggests',
    requirement: 'Each option is { kind, label, cost: { rounds, shots }, limits, run }: the search comes first (cost about 6 rounds; ruled out by moves and arrows), then a reader option for each reader the analysis found.',
    reread: `${L}, the menu: options, costs and limits`,
    timeLimitMs: 40000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const kit = await searchedKit(engine);
      const p = await engine.checkKit(referee(levelNo(3)).host, kit, levelNo(3), envWith(first));
      const kinds = (p?.options ?? []).map((o) => o.kind);
      if (kinds[0] !== 'search' || !kinds.slice(1).length || kinds.slice(1).some((k) => k !== 'reader')) fail({ checked: 'the options for the state problem on level 3', observed: show(kinds), expected: '["search", "reader"]: the search first, then a reader for each one the code suggests' });
      for (const o of p.options) {
        if (typeof o.label !== 'string' || !o.label || !Number.isInteger(o.cost?.rounds) || !Number.isInteger(o.cost?.shots) || !Array.isArray(o.limits) || typeof o.run !== 'function') fail({ checked: `the ${o.kind} option`, observed: show({ ...o, run: typeof o.run }), expected: '{ kind, label (words), cost: { rounds, shots } (whole numbers), limits (a list), run (a function) }' });
      }
      const search = p.options[0];
      if (!search.limits.includes('moves') || !search.limits.includes('arrows')) fail({ checked: 'what rules the search out', observed: show(search.limits), expected: 'moves and arrows' });
    },
  },
  {
    id: '06-heuristic', title: 'heuristic: the cheapest option no evidence rules out',
    requirement: 'heuristic(problem, options) returns the index of the cheapest option, rounds before shots, among those whose limits share nothing with problem.evidence; the first of equals; 0 when every option is ruled out.',
    reread: `${L}, a rule to measure the decision model against`,
    async run({ fn }) {
      const heuristic = await fn('engine.mjs', 'heuristic');
      const o = (kind, rounds, shots, limits = []) => ({ kind, label: kind, cost: { rounds, shots }, limits });
      const cases = [
        ['search or reader, no evidence', [], [o('search', 6, 0, ['moves', 'arrows']), o('reader', 3, 0)], 1],
        ['search or reader after the state moved', ['moves'], [o('search', 6, 0, ['moves', 'arrows']), o('reader', 3, 0)], 1],
        ['a cheap search and a dear reader, no evidence', [], [o('search', 2, 0, ['moves']), o('reader', 3, 0)], 0],
        ['the same after the state moved', ['moves'], [o('search', 2, 0, ['moves']), o('reader', 3, 0)], 1],
        ['fit or physics, rounds equal, shots differ', [], [o('fit', 3, 17), o('physics', 3, 3)], 1],
        ['two equal options', [], [o('a', 3, 0), o('b', 3, 0)], 0],
        ['fewer rounds against fewer shots', [], [o('fit', 2, 9), o('physics', 4, 0)], 0],
        ['every option ruled out', ['arrows'], [o('a', 3, 0, ['arrows']), o('b', 1, 0, ['arrows'])], 0],
      ];
      for (const [what, evidence, options, want] of cases) expectSame(heuristic({ part: 'x', why: 'x', evidence, options }, options), want, { checked: `heuristic: ${what}`, what: 'the index' });
    },
  },
  {
    id: '06-picks', title: 'playLevel does what the picker picks',
    requirement: 'On level 3 from a kit with searched addresses: when the picker picks the reader, no search runs; when it picks the search, the search runs once and is not offered again on that level.',
    reread: `${L}, budgets make the order matter`,
    timeLimitMs: 60000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const pick = (want) => { const calls = []; return { calls, async decide(text, labels, options) { const kinds = options?.[0]?.problem ? options.map((x) => x.kind) : null; const i = kinds ? Math.max(0, kinds.indexOf(want)) : 0; calls.push({ text, labels, choice: i, kinds, problem: options?.[0]?.problem ?? null }); return { choice: i, ms: 1 }; } }; };
      const reader = pick('reader');
      const r1 = await playOn(engine, 3, await searchedKit(engine), reader);
      if (r1.ref.seen.writes) fail({ checked: 'memory writes on level 3 when the picker picks the reader', observed: `${r1.ref.seen.writes} writes`, expected: 'none: no search ran, so nothing was write-tested' });
      if (!r1.pass) fail({ checked: 'level 3 when the picker picks the reader', observed: sayScore(r1), expected: 'passed within the budget' });
      // A picker that would take the search every time it is offered: the engine must
      // offer it once, then go on to the reader.
      const search = pick('search');
      const kit = await searchedKit(engine);
      const r2 = await playOn(engine, 3, kit, search, { budget: { rounds: 70, shots: 30 } });
      if (!r2.ref.seen.writes) fail({ checked: 'memory writes on level 3 when the picker picks the search', observed: 'none', expected: 'write-tests: the search ran' });
      const searches = menusOf(search).filter((m) => m.part === 'state' && m.kinds[m.choice] === 'search').length;
      if (searches !== 1 || !kit.reader) fail({ checked: 'what followed the search on level 3', input: 'a budget of 70 rounds, so the engine has room to go on', observed: `the search was picked ${searches} time(s); the kit ${kit.reader ? 'has' : 'has no'} reader`, expected: 'the search picked once, then the reader installed: a search that was tried on this level is not offered again' });
    },
  },
  {
    id: '06-budget', title: 'playLevel never goes over a level\'s budget',
    requirement: 'With option 0 on every menu, level 3 from a searched kit runs out of rounds during the search: the engine stops repairing, plays what it can, and stays within 18 rounds and 12 shots, without throwing. An option whose cost does not fit what is left is not offered.',
    reread: `${L}, budgets make the order matter`,
    timeLimitMs: 60000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const r = await playOn(engine, 3, await searchedKit(engine), first);
      if (r.error) fail({ checked: 'level 3 with option 0 on every menu', observed: `the engine threw: ${String(r.error.message).split('\n')[0]}`, expected: 'no error' });
      if (r.over) fail({ checked: 'level 3 with option 0 on every menu', observed: sayScore(r), expected: 'within 18 rounds and 12 shots' });
      // With 5 rounds to learn, the first check of the searched addresses leaves 4: the
      // search (about 6) does not fit, so it is not offered, and option 0 is the reader.
      const tight = await playOn(engine, 3, await searchedKit(engine), first, { budget: { rounds: 15, shots: 12 } });
      if (!tight.pass) fail({ checked: 'level 3 with option 0 and a budget of 15 rounds', input: '5 rounds to learn with; checking the searched addresses spends 1', observed: sayScore(tight), expected: 'passed: only options whose cost fits what is left are offered, so the search is left off and the reader is tried' });
    },
  },
  {
    id: '06-stuck', title: 'with nothing that reads the state, the engine says why and fires nothing',
    requirement: 'When nothing in the kit reads the state and no option fits what is left of the budget, playLevel logs why and fires no shot, without throwing.',
    reread: `${L}, the engine checks its kit`,
    timeLimitMs: 30000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const ref = referee(levelNo(5));
      const kit = { game: gameIdOf('lob'), controls: { ...CONTROLS }, statusLine: ref.truth.lineAddr(), message: ref.truth.msgAddr() };
      const r = await playOn(engine, 5, kit, first, { budget: { rounds: 12, shots: 10 } });
      if (r.error) fail({ checked: 'level 5 with nothing that reads the state and 2 rounds to learn with', observed: `the engine threw: ${String(r.error.message).split('\n')[0]}`, expected: 'no error' });
      if (r.fired) fail({ checked: 'shots fired with nothing that reads the state', observed: `${r.fired}`, expected: 'none' });
      if (!r.env.entries.some((e) => /nothing left to try (that )?fits the budget|cannot play/.test(String(e.result)))) fail({ checked: 'what the engine logged', observed: r.env.entries.length ? r.env.entries.slice(-3).map((e) => `${e.step}: ${e.result}`).join(' / ') : 'nothing', expected: 'a line saying why: "nothing left to try that fits the budget ..." from playLevel, or "cannot play: ..." from playRounds' });
    },
  },
  ...[3, 4, 5].map((n) => ({
    id: `06-level-${n}`, title: `level ${n} passes within its budget`,
    requirement: `From the kit level ${n - 1} leaves, playLevel passes level ${n}, ${levelNo(n).name}, within ${levelNo(n).budget.rounds} rounds and ${levelNo(n).budget.shots} shots.`,
    reread: `${L}, levels 3 to 5`,
    timeLimitMs: 60000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const kit = await kitBy(engine, n - 1);
      const r = await playOn(engine, n, kit, ruleFor(engine));
      if (!r.pass) fail({ checked: `level ${n} from the kit level ${n - 1} left`, observed: sayScore(r), expected: `${levelNo(n).pass} of the last 10 shots within 12 paces, within the budget` });
    },
  })),
];
