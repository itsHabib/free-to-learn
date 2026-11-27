import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, show, envWith, gameIdOf, playOn, sayScore, ruleFor, kitBy, first, levelNo, LEVELS } from './harness.mjs';
import { makeGame } from '../host.mjs';

export const title = 'A game you have never seen';
const L = 'lesson 08';

// Climb all ten levels from an empty kit with one picker; a level that is not
// passed does not stop the climb.
async function climbWith(engine, picker) {
  const kit = {}, rows = [];
  for (const level of LEVELS) rows.push(await playOn(engine, level.n, kit, picker));
  return rows;
}

// The text of a file with its comments taken out and the insides of its strings blanked,
// so a name in a comment or a log message is not mistaken for code.
function codeOnly(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; out += ' '; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1; out += c + c; i = j + 1; continue; }
    if (c === '`') {
      let j = i + 1; out += '`';
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') { let depth = 1, k = j + 2; while (k < src.length && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; } out += ' ' + src.slice(j + 2, k - 1) + ' '; j = k; continue; }
        j++;
      }
      out += '`'; i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

export const cases = [
  {
    id: '08-new-game', title: 'nothing learned on Lob is used on Lob II',
    requirement: 'On a game whose file differs from the kit\'s, the engine deletes the eight entries learned on the other game (statusLine, message, found, shots, fit, physics, reader, mover) before it reads that game\'s memory or screen, writes to it or presses a key. With a kit learned on Lob and a budget too small to learn anything on Lob II, it fires no shot, and afterwards the kit holds nothing of Lob.',
    reread: `${L}, a kit from another game`,
    timeLimitMs: 90000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      // The kit levels 1 to 7 leave, played with your heuristic. Its reader and physics take
      // the place of found addresses, practice shots and a fit, so those three come from
      // level 1 played from an empty kit with option 0 on every menu, which searches memory
      // and fits practice shots. All eight entries are then ones learned on Lob.
      const kit = {};
      for (let n = 1; n <= 7; n++) {
        const r = await playOn(engine, n, kit, ruleFor(engine));
        if (!r.pass) fail({ checked: 'the kit your engine builds on levels 1 to 7, which this check starts from', input: `level ${n}, with your heuristic answering the menus`, observed: `level ${n} was not passed: ${sayScore(r)}`, expected: `level ${n} passed within its budget, as its own check requires. This check plays Lob's levels 1 to 7 with your engine before it reaches Lob II, so a change that loses a Lob level fails here` });
      }
      const early = {};
      await playOn(engine, 1, early, first);
      for (const k of ['found', 'shots', 'fit']) if ((kit[k] === undefined || kit[k] === null) && early[k] !== undefined && early[k] !== null) kit[k] = structuredClone(early[k]);
      const ENTRIES = ['statusLine', 'message', 'found', 'shots', 'fit', 'physics', 'reader', 'mover'];
      const planted = Object.fromEntries(ENTRIES.filter((k) => kit[k] !== undefined && kit[k] !== null).map((k) => [k, JSON.stringify(kit[k])]));
      const missing = ENTRIES.filter((k) => !(k in planted));
      if (missing.length) fail({ checked: 'the kit learned on Lob that this check carries to Lob II', observed: `it has no ${missing.join(', ')}`, expected: 'all eight entries: levels 1 to 7 with your heuristic, and level 1 with option 0 on every menu for found, shots and fit' });
      // What the kit still held from Lob when the engine first used Lob II: its first read of
      // memory or the screen, write or key press. Reading the file, as gameId does, comes before.
      let atFirstUse = null;
      const watch = (host) => {
        const first = (name) => (...args) => {
          if (!atFirstUse) atFirstUse = ENTRIES.filter((k) => kit[k] !== undefined && kit[k] !== null && JSON.stringify(kit[k]) === planted[k]);
          return host[name](...args);
        };
        return Object.freeze({ binary: () => host.binary(), memory: first('memory'), screen: first('screen'), write: first('write'), press: first('press'), tick: first('tick') });
      };
      const r = await playOn(engine, 8, kit, ruleFor(engine), { budget: { rounds: 12, shots: 10 } }, watch);
      if (r.error) fail({ checked: 'level 8 with a kit learned on Lob and 2 rounds to learn with', observed: `the engine threw: ${String(r.error.message).split('\n')[0]}`, expected: 'no error' });
      if (atFirstUse?.length) fail({ checked: 'the kit when your engine first read Lob II\'s memory or screen or pressed a key', observed: `it still held ${atFirstUse.join(', ')} from Lob`, expected: 'none of the eight entries learned on Lob: the game step deletes them before anything else' });
      if (r.fired) fail({ checked: 'shots fired on Lob II with only Lob\'s kit', observed: `${r.fired} shots`, expected: 'none: Lob\'s reader and physics are not known to be right for Lob II, and there is no room to learn' });
      const lob = gameIdOf('lob');
      const left = ENTRIES.filter((k) => kit[k] !== undefined && kit[k] !== null && (JSON.stringify(kit[k]) === planted[k] || kit[k]?.game === lob));
      if (kit.game !== gameIdOf('lob2') || left.length) fail({ checked: 'the kit after level 8', observed: `game ${show(kit.game)}; still holding ${left.join(', ') || 'nothing of Lob'}`, expected: `game ${gameIdOf('lob2')} and nothing learned on Lob` });
    },
  },
  {
    id: '08-passes', title: 'on Lob II your passes find a simulator, a reader and a flag motion, and each matches the game',
    requirement: 'On Lob II builds 0, 6 and 7, analyse(host) finds a simulator and a reader with its flag motion. The reader matches the game; the simulator lands where the game lands, after the same number of frames; the flag\'s path matches the game for 300 frames.',
    reread: `${L}, a kit from another game`,
    timeLimitMs: 30000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const reader = await load('reader.mjs');
      const race = await load('race.mjs');
      for (const mode of [0, 6, 7]) {
        const { host, truth } = makeGame({ game: 'lob2', mode, seed: 17 });
        const code = engine.analyse(host);
        if (!code?.simulate || !code.readers?.length || !code.readers[0].mover) fail({ checked: `analyse on Lob II, build ${mode}`, observed: show(code && { simulate: typeof code.simulate, readers: code.readers?.length, mover: Boolean(code.readers?.[0]?.mover) }), expected: 'a simulator, a reader and the flag\'s motion: the shapes your passes look for are all there, in another layout' });
        const cand = code.readers[0];
        host.press('KeyN'); host.tick(5); host.press('ArrowUp');
        const st = reader.readState(host, cand.reader, truth.lineAddr());
        const windOk = mode & 1 ? st.wind === null && st.wind_arrows === truth.windLevel() : typeof st.wind === 'number';
        if (!(Math.abs(st.angle - truth.angle()) < 1e-6) || st.power !== truth.power() || !(Math.abs(st.target_x - truth.targetX()) < 1e-4) || !windOk) fail({ checked: `the reader on Lob II, build ${mode}`, observed: show(st), expected: `angle ${truth.angle()}, power ${truth.power()}, target_x ${truth.targetX().toFixed(3)}${mode & 1 ? `, wind null, wind_arrows ${truth.windLevel()}` : ''}` });
        for (const [angle, power] of [[33, 77], [58, 92]]) {
          const wind = mode & 1 ? truth.serverWind() : undefined;
          const s = code.simulate(host.memory(), { angle, power, wind });
          while (Math.round(truth.angle()) !== angle) host.press(truth.angle() < angle ? 'ArrowRight' : 'ArrowLeft');
          while (truth.power() !== power) host.press(truth.power() < power ? 'ArrowUp' : 'ArrowDown');
          host.press('Space');
          let f = 0;
          while (truth.flying()) { host.tick(1); f++; }
          if (!s || s.x !== truth.impactX() || s.frames !== f) fail({ checked: `the simulator on Lob II, build ${mode}, angle ${angle}, power ${power}`, observed: show(s), expected: `{ x: ${truth.impactX()}, frames: ${f} }, exactly` });
          host.press('KeyN'); host.tick(3);
        }
        const path = race.flagPath(host.memory(), cand.mover, cand.reader.flag, 300);
        for (let k = 0; k <= 300; k++) {
          if (k) host.tick(1);
          if (!(Math.abs(path?.[k] - truth.targetX()) <= 0.05)) fail({ checked: `the flag's path on Lob II, build ${mode}`, observed: `after ${k} frames it says ${show(path?.[k])}`, expected: `${truth.targetX().toFixed(3)}` });
        }
      }
    },
  },
  {
    id: '08-no-run', title: 'your engine never runs the game file',
    requirement: 'No file in your work folder uses WebAssembly, looks a name up on globalThis by a computed key, or imports vm, worker_threads, child_process, cluster or wasi; and the checks run your files with WebAssembly removed from the global object. The engine reads, decodes and lifts the bytes; running a copy would answer every question without understanding any.',
    reread: `${L}, what you built`,
    async run({ load, workDir }) {
      // The engine reads the file: analyse works from its bytes, here with WebAssembly gone.
      const engine = await load('engine.mjs');
      const { makeGame } = await import('../host.mjs');
      if (typeof globalThis.WebAssembly !== 'undefined') fail({ checked: 'that the check runs your engine without WebAssembly', observed: 'the global WebAssembly is still there', expected: 'removed before any work file loads' });
      const code = engine.analyse(makeGame({ game: 'lob2', mode: 0, seed: 1 }).host);
      if (!code?.simulate || !code.readers?.length) fail({ checked: 'analyse on Lob II\'s file', observed: show(code && { simulate: typeof code.simulate, readers: code.readers?.length }), expected: 'a simulator and at least one reader, worked out from the bytes alone' });
      const bad = [];
      for (const f of readdirSync(workDir).filter((x) => x.endsWith('.mjs'))) {
        const raw = readFileSync(join(workDir, f), 'utf8');
        const text = codeOnly(raw);
        const why = /\bWebAssembly\b/.test(text) ? 'uses WebAssembly'
          : /\bglobalThis\s*\[/.test(text) ? 'looks a name up on globalThis by a computed key'
          : /(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*['"](?:node:)?(?:vm|worker_threads|child_process|cluster|wasi)['"]/.test(raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')) ? 'imports a module that can start a fresh copy of JavaScript'
          : null;
        if (why) bad.push(`${f} ${why}`);
      }
      if (bad.length) fail({ checked: 'whether a file of yours could run the game', observed: bad.join('; '), expected: 'no file does any of these: the engine works from the bytes, never by running them' });
    },
  },
  {
    id: '08-climb', title: 'from an empty kit, your heuristic clears all ten levels within their budgets',
    requirement: 'playLevel, with your heuristic answering every repair menu, passes levels 1 to 10 in order from an empty kit, each within its budget.',
    reread: `${L}, run the climb`,
    timeLimitMs: 120000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const rows = await climbWith(engine, ruleFor(engine));
      const bad = rows.find((r) => !r.pass);
      if (bad) fail({ checked: `the climb with your heuristic: level ${bad.level.n}, ${bad.level.name}`, observed: sayScore(bad), expected: `${bad.level.pass} of the last 10 within ${bad.level.radius} paces, within the budget` });
    },
  },
  {
    id: '08-option0', title: 'with option 0 on every menu, the engine stays inside every budget',
    requirement: 'Climbing with option 0 on every menu, the engine may fail levels (it searches memory that moves on level 3), but no level goes over its budget and the engine never throws.',
    reread: `${L}, when no picker helps`,
    timeLimitMs: 120000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const rows = await climbWith(engine, first);
      const bad = rows.find((r) => r.over || r.error);
      if (bad) fail({ checked: `the climb with option 0: level ${bad.level.n}`, observed: sayScore(bad), expected: 'within the budget, with no error' });
    },
  },
  {
    id: '08-unavailable', title: 'with a decision model that is never there, the engine stays inside every budget',
    requirement: 'Climbing with a decision model that throws on every call, choose takes option 0 each time; no level goes over its budget and the engine never throws.',
    reread: `${L}, when no picker helps`,
    timeLimitMs: 120000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const rows = await climbWith(engine, { calls: [], async decide() { throw new Error('the decision model is not running'); } });
      const bad = rows.find((r) => r.over || r.error);
      if (bad) fail({ checked: `the climb with no decision model: level ${bad.level.n}`, observed: sayScore(bad), expected: 'within the budget, with no error' });
    },
  },
];
