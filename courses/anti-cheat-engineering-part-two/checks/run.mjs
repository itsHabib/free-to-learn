// Runs the cases of one unit against a project folder, one process per case, so an
// endless loop is stopped by a time limit and one case cannot disturb another.
// A unit is checks/NN.mjs exporting `title` and `cases`: [{ id, title, requirement,
// timeLimitMs?, run({ fn, cls, json, load, workDir }) }].
import { fork } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
export const UNITS = ['12', '13', '14', '15', '16', '17'];
export const DEFAULT_LIMIT_MS = 10000;

// The lesson section that teaches each check, from lessons/sections.json.
export function sectionFor(id) {
  let map;
  try { map = JSON.parse(readFileSync(join(here, '..', 'lessons', 'sections.json'), 'utf8')).checks; } catch { return null; }
  const m = map?.[id];
  return m ? `lesson ${m.lesson}, "${m.section}"` : null;
}

// { unit, title, cases } for a unit. When checks/NN.mjs does not exist yet the answer
// has missing: true; when it exists but does not load, loadError says why. Neither throws.
export async function listCases(unit) {
  if (!UNITS.includes(unit)) throw Error(`There is no unit ${unit}: choose ${UNITS.join(', ')}`);
  const file = join(here, `${unit}.mjs`);
  if (!existsSync(file)) return { unit, title: null, cases: [], missing: true };
  try {
    const mod = await import(pathToFileURL(file).href);
    if (!Array.isArray(mod.cases)) return { unit, title: mod.title ?? null, cases: [], loadError: `checks/${unit}.mjs exports no list named cases` };
    return { unit, title: mod.title ?? null, cases: mod.cases };
  } catch (error) {
    return { unit, title: null, cases: [], loadError: String(error?.message ?? error).split('\n')[0] };
  }
}

function runCase(workDir, unit, c) {
  const limit = c.timeLimitMs ?? DEFAULT_LIMIT_MS;
  return new Promise(resolve => {
    const child = fork(join(here, 'worker.mjs'), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: ['--max-old-space-size=1024', '--stack-size=4000'] });
    let done = false;
    let stderr = '';
    const started = Date.now();
    // Keep the end of stderr: after an uncaught error Node prints the error, its stack and then
    // its own version line, so the useful line is near the end but not last.
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-8000); });
    const finish = r => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      resolve({ ...r, ms: Date.now() - started });
    };
    const timer = setTimeout(() => finish({ id: c.id, pass: false, kind: 'timeout', limitMs: limit }), limit);
    child.once('message', finish);
    child.once('error', e => finish({ id: c.id, pass: false, kind: 'error', message: e.message }));
    // 'close', not 'exit': 'close' comes after the IPC channel has delivered the worker's last message.
    child.once('close', (code, signal) => { const why = lastErrorLine(stderr); finish({ id: c.id, pass: false, kind: 'error', message: `the check process ended early (exit code ${code}${signal ? ', signal ' + signal : ''})${why ? ': ' + why : ''}` }); });
    child.send({ workDir, unit, caseId: c.id });
  });
}

// Runs the unit's cases (or only the ids listed) with `jobs` processes at a time.
// A unit whose checks are missing or do not load comes back with no results and pass: false.
// The line of a child's stderr that says what went wrong: the last line that names an error,
// else the last line that is neither a stack frame nor Node's version line.
function lastErrorLine(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^at /.test(l) && !/^Node\.js v\d/.test(l));
  return [...lines].reverse().find((l) => /^\w*(Error|Exception)\b/.test(l)) ?? lines.at(-1) ?? '';
}

export async function runUnit(workDir, unit, { only = null, jobs = 1 } = {}) {
  const listed = await listCases(unit);
  if (listed.missing || listed.loadError) return { ...listed, results: [], pass: false };
  const dir = resolve(workDir);
  const todo = listed.cases.filter(c => !only || only.includes(c.id));
  const results = new Array(todo.length);
  let next = 0;
  const lane = async () => { while (next < todo.length) { const k = next++; const c = todo[k]; const r = await runCase(dir, unit, c); results[k] = { ...r, title: c.title, reread: sectionFor(c.id), requirement: c.requirement }; } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, todo.length)) }, lane));
  return { unit, title: listed.title, results, pass: results.length > 0 && results.every(r => r.pass) };
}
