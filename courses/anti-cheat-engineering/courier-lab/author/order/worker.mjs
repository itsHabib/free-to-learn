import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { basename, join } from 'node:path';
import { startServer } from '../../tests/harness.mjs';
import { request } from '../../clients/http-client.mjs';
import { componentFixtures } from './component-fixtures.mjs';

export function assertionEvidence(error) {
  // Value types cannot establish provenance. The full runtime calibration
  // determines whether a scenario distinguishes correct and incorrect behavior.
  return error instanceof assert.AssertionError && Object.hasOwn(error, 'actual') && Object.hasOwn(error, 'expected');
}

function errorRecord(error) {
  return { name: error.name, code: error.code, message: error.message, actual: error.actual, expected: error.expected, operator: error.operator, stack: error.stack };
}

async function runScenario(seed) {
  const server = await startServer({ seed, entry: join(process.cwd(), 'server.mjs') });
  let error;
  let trace;
  let healthy = false;
  let ticks = 0;
  try {
    const { scenario } = await import(pathToFileURL(join(process.cwd(), 'learner-scenario.mjs')));
    if (typeof scenario !== 'function') throw new Error('learner-scenario.mjs must export async scenario({base, advance}).');
    await scenario({
      base: server.base,
      advance: async (count) => {
        if (!Number.isSafeInteger(count) || count < 1 || count > 100 || ticks + count > 400) throw new Error('Scenario advance budget is 400 ticks, in calls of 1–100.');
        ticks += count;
        return server.advance(count);
      },
    });
  } catch (caught) { error = caught; }
  try {
    const health = await request(server.base, '/health');
    trace = await server.record();
    healthy = health.status === 200 && health.data?.ok === true && trace.dropped === 0;
  } catch (caught) { error = caught; }
  try {
    const exit = await server.stop();
    if (exit.code !== 0) throw new Error(`Runtime exited with ${exit.code ?? exit.signal}.`);
  } catch (caught) { healthy = false; error = caught; }
  const kind = healthy && !error ? 'pass' : healthy && assertionEvidence(error) ? 'assertion' : 'runner-failure';
  return { kind, healthy, ticks, error: error && errorRecord(error), trace, diagnostics: server.diagnostics() };
}

async function main() {
  const [mode, seedValue] = process.argv.slice(2);
  const seed = Number(seedValue);
  if (!Number.isSafeInteger(seed)) throw new Error('Worker needs an integer seed.');
  if (mode === 'scenario') return runScenario(seed);
  if (mode !== 'component') throw new Error('Unknown worker mode.');
  const criteria = await componentFixtures(process.cwd(), seed);
  if (criteria.every((item) => item.passed)) return { kind: 'pass', criteria };
  return { kind: criteria.some((item) => item.failureKind === 'runner-failure') ? 'runner-failure' : 'component-failure', criteria };
}

// Importing assertionEvidence for tests must not launch a worker.
if (basename(process.argv[1] ?? '') === 'worker.mjs' && typeof process.send === 'function') {
  main().then((result) => process.send({ type: 'result', result }, () => process.disconnect())).catch((error) => {
    process.send({ type: 'result', result: { kind: 'runner-failure', healthy: false, error: errorRecord(error) } }, () => process.disconnect());
  });
}
