// Runs the cases of one module against a folder of learner files, one process per case.
import { fork } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
export const MODULES = ['01', '02', '03', '04', '05', '06', '07', '08'];
export const DEFAULT_LIMIT_MS = 8000;

// The lesson section that teaches each check, from lessons/sections.json.
export function sectionFor(id) {
  let map;
  try { map = JSON.parse(readFileSync(join(here, '..', 'lessons', 'sections.json'), 'utf8')).checks; } catch { return null; }
  const m = map[id];
  return m ? `lesson ${m.lesson}, "${m.section}"` : null;
}

export async function listCases(module) {
  const { cases, title } = await import(`./${module}.mjs`);
  return { title, cases };
}

function runCase(workDir, module, c, variant) {
  const limit = c.timeLimitMs ?? DEFAULT_LIMIT_MS;
  return new Promise(resolve => {
    const child = fork(join(here, 'worker.mjs'), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: ['--max-old-space-size=512', '--stack-size=4000'] });
    let done = false;
    let stderr = '';
    child.stderr.on('data', d => { if (stderr.length < 2000) stderr += d; });
    const finish = r => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      resolve(r);
    };
    const timer = setTimeout(() => finish({ id: c.id, pass: false, kind: 'timeout', limitMs: limit }), limit);
    child.once('message', finish);
    child.once('error', e => finish({ id: c.id, pass: false, kind: 'error', message: e.message }));
    child.once('exit', (code, signal) => finish({ id: c.id, pass: false, kind: 'error', message: `the check process ended early (exit code ${code}${signal ? ', signal ' + signal : ''})${stderr ? ': ' + stderr.trim().split('\n').slice(-1)[0] : ''}` }));
    child.send({ workDir, module, caseId: c.id, variant });
  });
}

export async function runModule(workDir, module, { variant = 0, only = null } = {}) {
  const { title, cases } = await listCases(module);
  const results = [];
  for (const c of cases) {
    if (only && !only.includes(c.id)) continue;
    const r = await runCase(workDir, module, c, variant);
    results.push({ ...r, title: c.title, reread: sectionFor(c.id) ?? c.reread, requirement: c.requirement });
  }
  return { module, title, variant, results, pass: results.every(r => r.pass) };
}
