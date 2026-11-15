// Shared helpers for Sightline's module checks. A check either returns (pass) or throws a
// CheckFailure that says what was checked, the input, what was observed and what was required.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LEVELS, referee, score } from '../levels.mjs';
import { scripted, random, first } from '../models.mjs';
import { makeGame as newGame, gameBytes } from '../host.mjs';

const courseRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export class CheckFailure extends Error {
  constructor(fields) {
    super(fields.observed ?? 'check failed');
    this.fields = fields;
  }
}

export function fail(fields) {
  throw new CheckFailure(fields);
}

export const NOT_WRITTEN = 'not written yet';

// Short, readable rendering of a value (never raw multi-line JSON).
export function show(value, limit = 240) {
  const text = render(value);
  return text.length > limit ? text.slice(0, limit - 3) + '...' : text;
}
function render(value) {
  if (value === undefined) return 'nothing (undefined)';
  if (value === null) return 'null';
  if (ArrayBuffer.isView(value)) value = Array.from(value);
  if (Array.isArray(value)) return '[' + value.map(render).join(', ') + ']';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'object') {
    return '{ ' + Object.entries(value).map(([k, v]) => `${k}: ${render(v)}`).join(', ') + ' }';
  }
  return String(value);
}

export function same(a, b) {
  if (ArrayBuffer.isView(a)) a = Array.from(a);
  if (ArrayBuffer.isView(b)) b = Array.from(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => same(a[k], b[k]));
  }
  return Object.is(a, b) || (a === 0 && b === 0);
}

// Describe the first place two values differ, with its position.
export function firstDifference(observed, expected, path = '') {
  if (ArrayBuffer.isView(observed)) observed = Array.from(observed);
  if (Array.isArray(expected)) {
    if (!Array.isArray(observed)) return `${path || 'the value'} should be a list but is ${show(observed, 60)}`;
    const n = Math.min(observed.length, expected.length);
    for (let i = 0; i < n; i++) {
      if (!same(observed[i], expected[i])) return firstDifference(observed[i], expected[i], `${path}${path ? ', ' : ''}position ${i}`);
    }
    if (observed.length !== expected.length) {
      return `${path ? path + ': ' : ''}yours has ${observed.length} entries, the required value has ${expected.length}` +
        (observed.length > expected.length ? ` (first extra entry at position ${n}: ${show(observed[n], 60)})` : ` (first missing entry at position ${n}: ${show(expected[n], 60)})`);
    }
    return null;
  }
  if (expected && typeof expected === 'object') {
    if (!observed || typeof observed !== 'object') return `${path || 'the value'} should be an object but is ${show(observed, 60)}`;
    for (const k of Object.keys(expected)) {
      if (!same(observed[k], expected[k])) return firstDifference(observed[k], expected[k], `${path}${path ? ', ' : ''}field ${k}`);
    }
    return null;
  }
  return `at ${path || 'the value'}: yours is ${show(observed, 60)}, required ${show(expected, 60)}`;
}

export function expectSame(observed, expected, { checked, input, what = 'your result' }) {
  if (same(observed, expected)) return;
  fail({ checked, input, observed: `${what}: ${show(observed)}`, expected: show(expected), diff: firstDifference(observed, expected) });
}

// Run fn, expecting it to throw. A starter "not written yet" error is passed through.
export function thrown(fn) {
  try {
    fn();
  } catch (error) {
    if (String(error?.message ?? '').includes(NOT_WRITTEN)) throw error;
    return error;
  }
  return null;
}

export function fixtureJson(name) {
  return JSON.parse(readFileSync(join(courseRoot, 'fixtures', name), 'utf8'));
}

// The controls the help text describes. Checks use them so each module can be
// checked on its own, whatever an earlier module did.
export const CONTROLS = Object.freeze({ angle_up: 'ArrowRight', angle_down: 'ArrowLeft', power_up: 'ArrowUp', power_down: 'ArrowDown', fire: 'Space', new_round: 'KeyN' });
export const LIMITS = Object.freeze({ angle_min: 5, angle_max: 85, power_min: 10, power_max: 100 });
export const near = (a, b, tol) => typeof a === 'number' && Math.abs(a - b) <= tol;

// Load learner modules from the work folder.
export function makeLoader(workDir) {
  const cache = new Map();
  async function load(file) {
    if (!cache.has(file)) {
      let mod;
      try {
        mod = await import(pathToFileURL(join(workDir, file)).href);
      } catch (error) {
        throw new CheckFailure({
          checked: `loading your ${file}`,
          observed: `${file} could not be loaded: ${String(error?.message ?? error).split('\n')[0].split(workDir).join('work')}`,
          expected: `${file} loads as an ES module (look for a syntax error or a misspelled import)`,
          loadError: true,
        });
      }
      cache.set(file, mod);
    }
    return cache.get(file);
  }
  async function fn(file, name) {
    const mod = await load(file);
    if (typeof mod[name] !== 'function') {
      fail({ checked: `${file} exports ${name}`, observed: `${file} has no exported function named ${name}`, expected: `export function ${name}(...) in ${file}` });
    }
    return mod[name];
  }
  return { load, fn };
}

// A host that counts what an engine did with it, so a check never has to take
// the engine's word for how many rounds it played or how many shots hit.
export function observed({ host, truth }) {
  const seen = { presses: {}, hits: 0, frames: 0, writes: 0 };
  let last = truth.message();
  const look = () => { const m = truth.message(); if (m !== last) { if (m.startsWith('HIT')) seen.hits++; last = m; } };
  return {
    seen,
    host: {
      binary: () => host.binary(),
      memory: () => host.memory(),
      write: (addr, type, value) => { seen.writes++; host.write(addr, type, value); },
      press: (key) => { seen.presses[key] = (seen.presses[key] ?? 0) + 1; host.press(key); look(); },
      tick: (frames = 1) => { for (let i = 0; i < frames; i++) { host.tick(1); seen.frames++; look(); } },
      screen: () => host.screen(),
    },
  };
}

// ---------- the engine, the ladder and scripted pickers ----------

export { scripted, random, first, LEVELS };
export const levelNo = (n) => LEVELS[n - 1];

// What the lab hands your engine, with a log the check can read afterwards.
export function envWith(models) {
  const entries = [];
  return { models, log: (e) => { entries.push(e); }, entries };
}

// The gameId your engine.mjs works out with gameId(host), for one of the course's games.
export function gameIdOf(game) {
  const bytes = gameBytes(game);
  let sum = 0;
  for (const b of bytes) sum = (sum * 31 + b) >>> 0;
  return `${bytes.length}:${sum}`;
}

// A picker that answers repair menus with your own heuristic and every other menu
// with option 0, the way the lab's default does, and records what it was asked.
export function ruleFor(engine, { otherwise = () => 0 } = {}) {
  const calls = [];
  return {
    calls,
    async decide(text, labels, options) {
      const problem = options?.[0]?.problem;
      const choice = problem ? engine.heuristic(problem, options) : otherwise(text, labels);
      calls.push({ text, labels, choice, problem: problem ?? null, kinds: problem ? options.map((o) => o.kind) : null });
      return { choice, ms: 1, model: 'rule' };
    },
  };
}

// The repair menus a picker was shown: [{ part, kinds, choice }].
export const menusOf = (picker) => (picker.calls ?? []).filter((c) => c.problem || c.kinds).map((c) => ({ part: c.problem?.part, kinds: c.kinds ?? null, choice: c.choice, text: c.text }));

// Play level n with an engine on a host the referee watches. Returns the
// referee's score (with what the level used against its budget), what the picker
// was asked, and the engine's log.
export async function playOn(engine, n, kit, models, over = {}) {
  const level = { ...levelNo(n), ...over };
  const ref = referee(level);
  const env = envWith(models);
  let error = null;
  try { await engine.playLevel(ref.host, level, kit, env); } catch (e) { error = e; }
  if (error && String(error?.message ?? error).includes(NOT_WRITTEN)) throw error;
  return { ...score(level, ref.shots, ref.seen), error, ref, env, level, calls: models.calls ?? [] };
}

// A level's result in words, with what the engine did, so a failure says more than a score.
export function sayScore(r) {
  const tail = (r.env?.entries ?? []).slice(-4).map((e) => `[${e.rung}] ${e.step}: ${String(e.result).split('\n')[0].slice(0, 110)}`).join(' / ');
  const voided = (r.ref?.shots ?? []).filter((s) => s.written).length;
  const used = r.used ? `; it used ${r.used.rounds} of ${r.level.budget.rounds} rounds and ${r.used.shots} of ${r.level.budget.shots} shots` : '';
  return `${r.hits} of the last ${r.rounds} shots within ${r.level.radius} paces (${r.fired} shots landed in all${voided ? `, ${voided} of them not counted because memory was written during their round` : ''})${used}`
    + `${r.error ? `; the engine stopped with "${String(r.error.message).split('\n')[0]}"` : ''}`
    + `.${tail ? ` Its last logged steps: ${tail}` : ' It logged nothing.'}`;
}

// The kit a passed level leaves, made here by playing the levels before it with
// your engine and your heuristic. Each check that needs one builds it fresh.
export async function kitBy(engine, upTo) {
  const kit = {};
  for (let n = 1; n <= upTo; n++) {
    const r = await playOn(engine, n, kit, ruleFor(engine));
    if (!r.pass) fail({ checked: `the kit your engine builds on levels 1 to ${upTo}, which this check starts from`, input: `level ${n}, with your heuristic answering the menus`, observed: `level ${n} was not passed: ${sayScore(r)}`, expected: `level ${n} passed within its budget, as its own check requires` });
  }
  return kit;
}
