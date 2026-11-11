import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

function errorEvidence(error) {
  if (!error || typeof error !== 'object') return { message: String(error) };
  const result = {};
  for (const key of ['name', 'message', 'stack', 'code', 'operator', 'expected', 'actual', 'source', 'input']) {
    if (key in error) result[key] = error[key];
  }
  return result;
}

function normalize(assessment) {
  if (!assessment || typeof assessment.passed !== 'boolean' || !Array.isArray(assessment.criteria) || !assessment.criteria.length || assessment.criteria.length > 256) throw new Error('Fixture returned an invalid assessment.');
  const names = new Set();
  const criteria = assessment.criteria.map((criterion) => {
    if (!criterion || typeof criterion.name !== 'string' || !criterion.name.trim() || criterion.name.length > 300 || names.has(criterion.name) || typeof criterion.passed !== 'boolean') throw new Error('Fixture returned an invalid criterion.');
    names.add(criterion.name);
    return { name: criterion.name, passed: criterion.passed, ...(criterion.error === undefined ? {} : { error: errorEvidence(criterion.error) }) };
  });
  if (assessment.passed !== criteria.every((criterion) => criterion.passed)) throw new Error('Fixture summary disagrees with its criteria.');
  return { kind: assessment.passed ? 'pass' : 'behavior-failure', healthy: true, passed: assessment.passed, criteria, ...(assessment.evidence === undefined ? {} : { evidence: assessment.evidence }) };
}

async function main() {
  const send = process.send?.bind(process);
  if (!send) throw new Error('The core worker requires its owner process.');
  const abortOnDisconnect = () => process.exit(1);
  process.once('disconnect', abortOnDisconnect);
  // Prevent accidental or trivial candidate use of the runner result channel.
  process.send = undefined;
  let result;
  try {
    const [policy, fixtures, scenario] = process.argv.slice(2);
    const judge = await import(pathToFileURL(resolve(fixtures)));
    if (typeof judge.assess !== 'function') throw new Error('Fixture must export assess(candidate).');
    let candidate = await import(pathToFileURL(resolve(policy)));
    if (scenario) {
      candidate = { ...candidate, scenarioPath: resolve(scenario), policyPath: resolve(policy) };
    }
    result = normalize(await judge.assess(candidate, { onCriterion: name => console.log(`Criterion started: ${String(name).slice(0, 300)}`) }));
  } catch (error) {
    result = { kind: 'runner-failure', healthy: false, passed: false, error: errorEvidence(error) };
  }
  // JSON serialization bounds and validates the evidence before it crosses IPC.
  let encoded;
  try {
    encoded = JSON.stringify(result, (_key, value) => typeof value === 'bigint' ? String(value) : value);
    if (Buffer.byteLength(encoded) > 512 * 1024) throw new Error('Fixture result exceeded its evidence budget.');
  } catch (error) {
    encoded = JSON.stringify({ kind: 'runner-failure', healthy: false, passed: false, error: errorEvidence(error) });
  }
  send({ type: 'core-result', result: JSON.parse(encoded) }, () => {
    process.removeListener('disconnect', abortOnDisconnect);
    process.disconnect?.();
  });
}

await main();
