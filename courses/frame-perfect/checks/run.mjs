// Runs a module's checks in a separate process with a time limit.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS } from './modules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const MODULES = Object.keys(CHECKS);
const LIMIT_MS = 180_000;

export function runModule(workDir, id) {
  if (!CHECKS[id]) return Promise.reject(new Error(`there is no module ${id}; the modules are ${MODULES.join(', ')}`));
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(here, 'worker.mjs'), workDir, id], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), LIMIT_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const line = out.trim().split('\n').pop();
      if (signal === 'SIGKILL') return done(single(id, 'timeout', `module ${id}'s checks ran longer than ${LIMIT_MS / 1000} s and were stopped. A search with no budget, or a loop that never ends, does this.`));
      try { return done(JSON.parse(line)); } catch { return done(single(id, 'error', `the checks stopped with exit code ${code}: ${err.trim().split('\n').slice(-3).join(' ')}`)); }
    });
  });
}
const single = (id, kind, message) => ({ module: id, results: [{ id: `c${id}-run`, title: `module ${id}'s checks`, pass: false, kind, message }] });
