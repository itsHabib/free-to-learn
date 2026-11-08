import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { investigations, runInvestigation } from './runtime.mjs';

function safe(value) {
  try { return JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? { type: 'undefined' } : item)); }
  catch { return { type: 'non-JSON result' }; }
}

/** Expected checkpoints are measured from the actual engine and owner clock. */
export async function assess(candidate) {
  if (typeof candidate?.predictTiming !== 'function') return {
    passed: false, criteria: [{ name: 'export predictTiming(record)', passed: false, error: {
      message: 'Export the pure predictTiming function.', expected: 'function', actual: typeof candidate?.predictTiming, source: 'LEARNER.md#the-contract',
    } }],
  };
  const criteria = [];
  for (const item of investigations()) {
    const actualRun = runInvestigation(item.record);
    const offered = structuredClone(item.record);
    let predicted;
    try {
      predicted = await candidate.predictTiming(offered);
      assert.deepEqual(offered, item.record, 'Do not mutate the input record.');
      assert.deepEqual(predicted, actualRun.observed);
      criteria.push({ name: item.name, passed: true });
    } catch (error) {
      const index = actualRun.observed.checkpoints.findIndex((checkpoint, i) => {
        try { assert.deepEqual(predicted?.checkpoints?.[i], checkpoint); return false; } catch { return true; }
      });
      const mutated = !isDeepStrictEqual(offered, item.record);
      const expected = mutated ? item.record : index < 0 ? actualRun.observed : actualRun.observed.checkpoints[index];
      const observed = mutated ? offered : index < 0 ? predicted : predicted?.checkpoints?.[index];
      criteria.push({ name: item.name, passed: false, error: {
        message: `Timing prediction differs${index < 0 || mutated ? '' : ` at ${expected.label}`}: ${error.message}`,
        expected, actual: safe(observed), source: `LEARNER.md#${mutated ? 'the-contract' : item.section}`,
      } });
    }
  }
  return { passed: criteria.every((item) => item.passed), criteria };
}
