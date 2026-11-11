import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRepairServer } from './server.mjs';
import { repair } from './policy.mjs';
import { correctPolicies, wrongPolicies, wrongAdapters } from './controls.mjs';

const AssertionError = assert.AssertionError;
const send = process.send?.bind(process);
if (!send) throw new Error('Run this trusted worker through the scenario fixture.');
process.send = undefined;
const abortOnDisconnect = () => process.exit(1);
process.once('disconnect', abortOnDisconnect);

const [scenarioPath, variantName, policyPath] = process.argv.slice(2);
// Variant identity belongs to the owner; it is not an input to the scenario.
process.argv = [process.argv[0]];

async function selectedVariant(name) {
  if (name === 'submitted') {
    const candidate = await import(pathToFileURL(resolve(policyPath)));
    if (typeof candidate.repair !== 'function') throw new Error('Captured policy must export repair.');
    return { policy: candidate.repair };
  }
  if (name === 'reference') return { policy: repair };
  const policy = [...correctPolicies, ...wrongPolicies].find((item) => item.name === name);
  if (policy) return { policy: policy.repair };
  const adapter = wrongAdapters.find((item) => item.name === name);
  if (adapter) return { policy: correctPolicies[0].repair, requestAdapter: adapter.requestAdapter };
  throw new Error('Unknown scenario variant.');
}

function errorDetails(error) {
  return { name: error?.name ?? 'Error', message: String(error?.message ?? error), expected: error?.expected ?? null, actual: error?.actual ?? null };
}

let server;
let result;
try {
  server = await createRepairServer(await selectedVariant(variantName));
  const candidate = await import(pathToFileURL(resolve(scenarioPath)));
  if (typeof candidate.scenario !== 'function') throw new Error('Export async scenario({base,moveActor}).');
  let failure;
  try { await candidate.scenario({ base: server.base, moveActor: server.moveActor }); }
  catch (error) { failure = error; }
  const activity = server.activity();
  // This checks participation only. The complete variant panel checks whether
  // the scenario actually distinguishes behavior; no assertion dataflow is inferred.
  const meaningful = activity.stateReads > 0 && activity.repairRequests > 0;
  let status = failure ? 'runtime-failure' : 'passed';
  if (failure instanceof AssertionError) status = 'assertion-failure';
  // A genuine mismatch may stop before the next state read. Participation is
  // required of completed runs; the full panel rejects blanket assertion throws.
  if (!failure && !meaningful) status = 'insufficient-evidence';
  const trace = server.record();
  result = { status, activity, ...(failure ? { error: errorDetails(failure) } : {}), trace: trace.slice(0, 32), traceDropped: Math.max(0, trace.length - 32) };
} catch (error) {
  result = { status: server ? 'runtime-failure' : 'runner-failure', error: errorDetails(error), activity: server?.activity() ?? { requests: 0, stateReads: 0, repairRequests: 0 }, trace: [] };
} finally {
  await server?.close();
}
const seen = new WeakSet();
const encoded = JSON.stringify(result, (_key, value) => {
  if (typeof value === 'bigint') return String(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '<repeated reference>';
  seen.add(value);
  return value;
});
if (Buffer.byteLength(encoded) > 512 * 1024) result = { status: 'runtime-failure', error: { message: 'Scenario evidence exceeded its byte bound.' }, trace: [] };
else result = JSON.parse(encoded);
send({ type: 'capstone-result', result }, () => { process.removeListener('disconnect', abortOnDisconnect); process.disconnect(); });
