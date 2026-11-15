// Runs one check case in its own process so an endless loop can be stopped.
import { makeLoader, CheckFailure, NOT_WRITTEN } from './harness.mjs';
// Work files never run the game. host.mjs keeps its own reference to WebAssembly, taken when
// it loads; after that the global goes, so a work file that reaches for it finds nothing.
import '../host.mjs';
delete globalThis.WebAssembly;

function whereInWork(error, workDir) {
  const lines = String(error?.stack ?? '').split('\n');
  for (const line of lines) {
    const i = line.indexOf(workDir);
    if (i >= 0) {
      const m = line.slice(i + workDir.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return `${m[1]} line ${m[2]}`;
    }
  }
  return null;
}

process.on('message', async ({ workDir, module, caseId, variant }) => {
  let result;
  try {
    const { cases } = await import(`./${module}.mjs`);
    const c = cases.find(x => x.id === caseId);
    const loader = makeLoader(workDir);
    await c.run({ ...loader, variant, workDir });
    result = { id: caseId, pass: true };
  } catch (error) {
    const message = String(error?.message ?? error);
    if (error instanceof CheckFailure) result = { id: caseId, pass: false, kind: 'failure', fields: error.fields };
    else if (message.includes(NOT_WRITTEN)) result = { id: caseId, pass: false, kind: 'not-written', message: message.split('\n')[0] };
    else result = { id: caseId, pass: false, kind: 'error', message: `${error?.name ?? 'Error'}: ${message.split('\n')[0]}`, where: whereInWork(error, workDir) };
  }
  process.send(result, () => process.exit(0));
});
