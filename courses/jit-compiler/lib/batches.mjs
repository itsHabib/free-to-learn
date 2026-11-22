import { validateProgram, validateValue } from './program.mjs';

// The learner owns executeBatch. This supplied host gives the policy the last
// completed batch's counters and retains one compiled predicate per query.
export function runBatches(program, values, options, compile, executeBatch) {
  validateProgram(program);
  if (!Array.isArray(values)) throw new TypeError('Expected an array of row values');
  const { choose = () => 'interpret', batchSize = 64, auditCompiledRows } = options;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a positive safe integer');
  }
  if (typeof choose !== 'function') throw new TypeError('choose must be a function');
  if (auditCompiledRows !== undefined && typeof auditCompiledRows !== 'function') {
    throw new TypeError('auditCompiledRows must be a function');
  }
  const matches = [];
  const trace = [];
  let predicate;
  let previous = Object.freeze({ rows: 0, nulls: 0, guardFailures: 0 });

  for (let start = 0; start < values.length; start += batchSize) {
    const end = Math.min(values.length, start + batchSize);
    const observation = Object.freeze({ start, end, remainingRows: values.length - start,
      compiled: predicate !== undefined, previous });
    const action = choose(observation);
    if (action !== 'interpret' && action !== 'compile') {
      throw new TypeError("choose must return 'interpret' or 'compile'");
    }
    trace.push({ kind: 'decision', start, end, action });
    if (action === 'compile' && !predicate) {
      predicate = compile(program);
      trace.push({ kind: 'compile', at: start });
    }
    let nulls = 0;
    for (let row = start; row < end; row++) {
      validateValue(values[row]);
      if (values[row] === null) nulls++;
    }
    let active = action === 'compile' ? predicate : undefined;
    let calls = 0;
    if (active && auditCompiledRows) {
      // Lesson checks count calls to the cached executable. Timed runs pass it directly.
      active = value => {
        calls++;
        return predicate(value);
      };
    }
    const { interpreted, compiledRows, guardFailures } =
      executeBatch(program, values, start, end, active, matches, trace);
    auditCompiledRows?.(calls);
    trace.push({ kind: 'batch', start, end, interpreted, compiledRows, nulls, guardFailures });
    previous = Object.freeze({ rows: end - start, nulls, guardFailures });
  }
  return { matches, trace };
}
