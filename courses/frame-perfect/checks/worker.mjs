// Runs one module's checks against a work folder and prints the results as one line of JSON.
// It runs in its own process (see run.mjs), so a search that never ends cannot hang the lab.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHECKS } from './modules.mjs';
import { verifyCore } from './judge.mjs';

const [workArg, id] = process.argv.slice(2);
const work = resolve(workArg);
const kindOf = (e) => (/not written yet/.test(e.message) ? 'not-written' : /budget/i.test(e.message) ? 'budget' : e instanceof Error && e.name === 'Error' ? 'wrong' : 'error');

async function main() {
  verifyCore();
  const file = join(work, 'tas.mjs');
  if (!existsSync(file)) throw new Error(`there is no ${file}. Make your work folder with: node lab.mjs start ./work`);
  const tas = await import(pathToFileURL(file).href);
  const results = [];
  for (const c of CHECKS[id]) {
    try {
      await c.run(tas, work);
      results.push({ id: c.id, title: c.title, pass: true, kind: 'pass', message: '' });
    } catch (e) {
      results.push({ id: c.id, title: c.title, pass: false, kind: kindOf(e), message: e.message });
    }
  }
  return results;
}

main().then(
  (results) => process.stdout.write(JSON.stringify({ module: id, results }) + '\n'),
  (e) => process.stdout.write(JSON.stringify({ module: id, results: [{ id: `c${id}-load`, title: 'load work/tas.mjs', pass: false, kind: /not written yet/.test(e.message) ? 'not-written' : 'error', message: e.message }] }) + '\n'),
);
