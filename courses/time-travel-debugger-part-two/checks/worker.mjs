// Runs one check case in its own process.
import { makeLoader, CheckFailure, NOT_WRITTEN } from './harness.mjs';

function whereInWork(error, workDir) {
  for (const line of String(error?.stack ?? '').split('\n')) {
    const i = line.indexOf(workDir);
    if (i >= 0) {
      const m = line.slice(i + workDir.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return `${m[1]} line ${m[2]}`;
    }
  }
  return null;
}

process.on('message', async ({ workDir, unit, caseId }) => {
  let result;
  try {
    const { cases } = await import(`./${unit}.mjs`);
    const c = cases.find(x => x.id === caseId);
    await c.run({ ...makeLoader(workDir), workDir });
    result = { id: caseId, pass: true };
  } catch (error) {
    const message = String(error?.message ?? error);
    if (error instanceof CheckFailure) result = { id: caseId, pass: false, kind: 'failure', fields: error.fields };
    else if (message.includes(NOT_WRITTEN)) result = { id: caseId, pass: false, kind: 'not-written', message: message.split('\n')[0] };
    else result = { id: caseId, pass: false, kind: 'error', message: `${error?.name ?? 'Error'}: ${message.split('\n')[0]}`, where: whereInWork(error, workDir) };
  }
  process.send(result, (error) => process.exit(error ? 3 : 0));
});
