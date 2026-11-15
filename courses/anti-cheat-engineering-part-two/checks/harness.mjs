// Shared helpers for the checks. A check either returns (pass) or throws a
// CheckFailure saying what was checked, the input, what was observed and what
// was required.
//
// Your files are read from your project folder by their path in it:
//   await fn('server/admission.mjs', 'parseInput')    an exported function
//   await cls('trade/trade.mjs', 'Ledger')            an exported class
//   json('detect/settings.json')                       a JSON file, parsed
// A file counts as "not written yet" when it is missing from the project, when a
// function in it throws an error saying "not written yet" (as every starter function
// does), and, for a JSON file, when it is empty or still holds the words
// "not written yet" (the starter's placeholder).
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const courseRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const NOT_WRITTEN = 'not written yet';

export class CheckFailure extends Error {
  constructor(fields) { super(fields.observed ?? 'check failed'); this.fields = fields; }
}
export function fail(fields) { throw new CheckFailure(fields); }

// Short, readable rendering of a value.
export function show(value, limit = 240) {
  const text = render(value);
  return text.length > limit ? text.slice(0, limit - 3) + '...' : text;
}
function render(value) {
  if (value === undefined) return 'nothing (undefined)';
  if (value === null) return 'null';
  if (typeof value === 'bigint') return `${value}n`;
  if (ArrayBuffer.isView(value)) value = Array.from(value);
  if (Array.isArray(value)) return '[' + value.map(render).join(', ') + ']';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Object.is(value, -0)) return '-0';
  if (typeof value === 'object') return '{ ' + Object.entries(value).map(([k, v]) => `${k}: ${render(v)}`).join(', ') + ' }';
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
  return Object.is(a, b);
}

export function firstDifference(observed, expected, path = '') {
  if (ArrayBuffer.isView(observed)) observed = Array.from(observed);
  if (ArrayBuffer.isView(expected)) expected = Array.from(expected);
  if (Array.isArray(expected)) {
    if (!Array.isArray(observed)) return `${path || 'the value'} should be a list but is ${show(observed, 60)}`;
    const n = Math.min(observed.length, expected.length);
    for (let i = 0; i < n; i++) if (!same(observed[i], expected[i])) return firstDifference(observed[i], expected[i], `${path}${path ? ', ' : ''}position ${i}`);
    if (observed.length !== expected.length) return `${path ? path + ': ' : ''}yours has ${observed.length} entries, the required value has ${expected.length}`;
    return null;
  }
  if (expected && typeof expected === 'object') {
    if (!observed || typeof observed !== 'object') return `${path || 'the value'} should be an object but is ${show(observed, 60)}`;
    for (const k of Object.keys(expected)) if (!same(observed[k], expected[k])) return firstDifference(observed[k], expected[k], `${path}${path ? ', ' : ''}field ${k}`);
    const extra = Object.keys(observed).filter(k => !(k in expected));
    if (extra.length) return `${path ? path + ': ' : ''}yours has a field the required value lacks: ${extra[0]}`;
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
  try { fn(); } catch (error) {
    if (String(error?.message ?? '').includes(NOT_WRITTEN)) throw error;
    return error;
  }
  return null;
}

// A course file (not one of yours), by its path from the course folder.
export function readJson(rel) { return JSON.parse(readFileSync(join(courseRoot, rel), 'utf8')); }

function notWritten(file, why) { return Error(`${file}: ${NOT_WRITTEN} (${why})`); }

// Load your files from your project folder. Paths may be nested: 'server/admission.mjs'.
export function makeLoader(workDir) {
  const cache = new Map();
  let real = workDir;
  try { real = realpathSync(workDir); } catch { /* the folder is checked below, per file */ }
  const tidy = (message) => String(message).split('\n')[0].split(workDir).join('PROJECT').split(real).join('PROJECT');

  async function load(file) {
    if (!cache.has(file)) {
      if (!existsSync(join(workDir, file))) throw notWritten(file, `it is missing from your project; copy starter/${file} to begin`);
      let mod;
      try {
        mod = await import(pathToFileURL(join(workDir, file)).href);
      } catch (error) {
        if (String(error?.message ?? '').includes(NOT_WRITTEN)) throw error;
        throw new CheckFailure({
          checked: `loading your ${file}`,
          observed: `${file} could not be loaded: ${tidy(error?.message ?? error)}`,
          expected: `${file} loads as an ES module (look for a syntax error or a misspelled import)`,
          loadError: true,
        });
      }
      cache.set(file, mod);
    }
    return cache.get(file);
  }

  async function get(file, name, kind = 'function') {
    const mod = await load(file);
    if (typeof mod[name] !== 'function') fail({ checked: `${file} exports ${name}`, observed: `${file} has no exported ${kind} named ${name}`, expected: `export ${kind === 'class' ? 'class' : 'function'} ${name} in ${file}` });
    return mod[name];
  }

  // A JSON file of yours, parsed afresh on every call.
  function json(file) {
    const path = join(workDir, file);
    if (!existsSync(path)) throw notWritten(file, `it is missing from your project; copy starter/${file} to begin`);
    const text = readFileSync(path, 'utf8');
    if (!text.trim()) throw notWritten(file, "the file is empty");
    if (text.includes(NOT_WRITTEN)) throw notWritten(file, `it still holds the starter's "${NOT_WRITTEN}": replace that with your values`);
    try {
      return JSON.parse(text);
    } catch (error) {
      fail({
        checked: `reading your ${file}`,
        observed: `${file} is not valid JSON: ${tidy(error.message)}`,
        expected: `${file} holds one JSON value (look for a trailing comma, a comment or a missing quote)`,
        loadError: true,
      });
    }
  }

  return { load, json, fn: (file, name) => get(file, name), cls: (file, name) => get(file, name, 'class') };
}
