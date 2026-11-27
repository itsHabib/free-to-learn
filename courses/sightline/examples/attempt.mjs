// The record of one try at a lesson's new case, kept under work/.attempts/.
// A checker saves the try before it loads any of your code, and loads your code
// from the saved copy, as "lab.mjs check" does, so what ran is what is kept. A
// file that can't load is a try too, with your files and your note, that status
// shows.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, '../course.json'), 'utf8'));
const isFile = (path) => existsSync(path) && statSync(path).isFile();

// The files a module imports by a relative path, by the import and export
// statements and the import() calls that name one in quotes.
function importsOf(path) {
  if (!/\.m?js$/.test(path)) return [];
  const named = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  const found = [...readFileSync(path, 'utf8').matchAll(named)];
  return found.map((m) => resolve(dirname(path), m[1].split(/[?#]/)[0]));
}

// Everything in the work folder the try needs: every file you write and every
// file you are given, as "lab.mjs check" saves, the new case's own file, and
// whatever any of them imports, such as a helper of yours.
function filesFor(work, entry) {
  const start = [entry, ...config.workFiles, ...(config.given ?? [])];
  const queue = start.map((f) => join(work, f)).filter(isFile);
  const kept = new Set(queue);
  for (const path of queue) {
    for (const next of importsOf(path)) {
      const inside = relative(work, next);
      if (inside.startsWith('..') || isAbsolute(inside)) continue;
      if (kept.has(next) || !isFile(next)) continue;
      kept.add(next);
      queue.push(next);
    }
  }
  return queue;
}

// Start a try: copy what it needs, and write a first record.
export function beginAttempt(folder, check, entry, helpUsed) {
  const work = resolve(folder);
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(work, '.attempts', `${id}-${check}`);
  const files = join(dir, 'files');
  mkdirSync(files, { recursive: true });
  for (const path of filesFor(work, entry)) {
    const target = join(files, relative(work, path));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(path, target);
  }
  writeFileSync(join(files, 'package.json'), '{"type":"module"}\n');
  const attempt = { dir, files, entry, work, check, helpUsed };
  save(attempt, { finished: false, results: [] });
  return attempt;
}

// Any value as JSON text, whatever a learner's function returned: a BigInt
// becomes its digits and an n, an object met again inside itself becomes
// "[cycle]", and a value JSON still can't hold becomes its String.
function plain() {
  const ancestors = []; // the objects holding the one being written
  return function (key, x) {
    if (typeof x === 'bigint') return `${x}n`;
    if (x === null || typeof x !== 'object') return x;
    while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop();
    if (ancestors.includes(x)) return '[cycle]';
    ancestors.push(x);
    return x;
  };
}
export function shown(value, space) {
  try {
    return JSON.stringify(value, plain(), space) ?? String(value);
  } catch {
    try {
      return String(value);
    } catch {
      return 'a value that cannot be printed';
    }
  }
}

// The record stays a JSON object whatever the results hold: if one can't
// be written as JSON, the results are kept as text instead.
function save({ dir, check, helpUsed }, rest) {
  let text = shown({ check, helpUsed, ...rest }, 1);
  if (!text.startsWith('{')) {
    const results = shown(rest.results);
    text = JSON.stringify({ check, helpUsed, ...rest, results }, null, 1);
  }
  writeFileSync(join(dir, `${check}.json`), text);
}

// Load the new case's file from the saved copy. If it can't load, the try ends
// here: the record says why, in one sentence, and the check exits with 1.
export async function loadForAttempt(attempt) {
  const { files, entry, work } = attempt;
  try {
    return await import(pathToFileURL(join(files, entry)).href);
  } catch (error) {
    const said = String(error?.message ?? error).split('\n')[0];
    // The reason names your own files, not the copies.
    const why = said.split(files).join(work);
    save(attempt, { finished: true, loadError: why, results: [] });
    console.log(`Your file could not be loaded, so no case ran: ${why}`);
    console.log(`This try is saved in ${attempt.dir}.`);
    process.exit(1);
  }
}

// The try's results, once every case has run.
export function finishAttempt(attempt, results, extra = {}) {
  save(attempt, { finished: true, ...extra, results });
}
