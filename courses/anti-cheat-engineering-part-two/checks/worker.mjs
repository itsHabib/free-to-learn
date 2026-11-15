// Runs one check case in its own process.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeLoader, CheckFailure, NOT_WRITTEN } from './harness.mjs';

// "server/admission.mjs line 12" for the first stack line inside the project folder.
function whereInWork(error, workDir) {
  const roots = new Set([workDir, pathToFileURL(workDir).href]);
  try { const real = realpathSync(workDir); roots.add(real); roots.add(pathToFileURL(real).href); } catch { /* keep the given path */ }
  for (const line of String(error?.stack ?? '').split('\n')) {
    for (const root of roots) {
      const i = line.indexOf(root);
      if (i < 0) continue;
      const m = line.slice(i + root.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return `${decodeURIComponent(m[1])} line ${m[2]}`;
    }
  }
  return null;
}

process.on('message', async ({ workDir, unit, caseId }) => {
  let result;
  try {
    const { cases } = await import(`./${unit}.mjs`);
    const c = cases.find(x => x.id === caseId);
    if (!c) throw Error(`checks/${unit}.mjs has no case ${caseId}`);
    await c.run({ ...makeLoader(workDir), workDir });
    result = { id: caseId, pass: true };
  } catch (error) {
    const message = String(error?.message ?? error);
    if (error instanceof CheckFailure) result = { id: caseId, pass: false, kind: 'failure', fields: error.fields };
    else if (message.includes(NOT_WRITTEN)) result = { id: caseId, pass: false, kind: 'not-written', message: message.split('\n')[0] };
    else result = { id: caseId, pass: false, kind: 'error', message: `${error?.name ?? 'Error'}: ${message.split('\n')[0]}`, where: whereInWork(error, workDir) };
  }
  try {
    process.send(result, (error) => process.exit(error ? 3 : 0));
  } catch (error) {
    // A field that cannot be sent (a BigInt, say) must not hide the outcome.
    process.send({ id: caseId, pass: false, kind: 'error', message: `the check's result could not be reported: ${error.message}` }, (error) => process.exit(error ? 3 : 0));
  }
});
