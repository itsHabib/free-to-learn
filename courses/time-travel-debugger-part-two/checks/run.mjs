// Runs the cases of one unit against a folder of learner files, one process per case,
// so an endless loop is stopped by a time limit and one case cannot disturb another.
import { fork } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
export const UNITS = ['08', '09', '10', '11', '12', '13'];
export const DEFAULT_LIMIT_MS = 10000;

// The lesson section that teaches each check, from lessons/sections.json.
export function sectionFor(id) {
  let map;
  try { map = JSON.parse(readFileSync(join(here, '..', 'lessons', 'sections.json'), 'utf8')).checks; } catch { return null; }
  const m = map[id];
  return m ? `lesson ${m.lesson}, "${m.section}"` : null;
}

export async function listCases(unit) {
  const { cases, title } = await import(`./${unit}.mjs`);
  return { title, cases };
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
    // 'close' comes after the IPC channel has delivered its last message; 'exit' can come first,
    // which would report a finished check as one that ended early.
    child.once('close', (code, signal) => { const why = lastErrorLine(stderr); finish({ id: c.id, pass: false, kind: 'error', message: `the check process ended early (exit code ${code}${signal ? ', signal ' + signal : ''})${why ? ': ' + why : ''}` }); });
    child.send({ workDir, unit, caseId: c.id });
  });
}

// The line of a child's stderr that says what went wrong: the last line that names an error,
// else the last line that is neither a stack frame nor Node's version line.
function lastErrorLine(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^at /.test(l) && !/^Node\.js v\d/.test(l));
  return [...lines].reverse().find((l) => /^\w*(Error|Exception)\b/.test(l)) ?? lines.at(-1) ?? '';
}

export async function runUnit(workDir, unit, { only = null, jobs = 1 } = {}) {
  const { title, cases } = await listCases(unit);
  const todo = cases.filter(c => !only || only.includes(c.id));
  const results = new Array(todo.length);
  let next = 0;
  const lane = async () => { while (next < todo.length) { const k = next++; const c = todo[k]; const r = await runCase(workDir, unit, c); results[k] = { ...r, title: c.title, reread: sectionFor(c.id), requirement: c.requirement }; } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, todo.length)) }, lane));
  return { unit, title, results, pass: results.every(r => r.pass) };
}
