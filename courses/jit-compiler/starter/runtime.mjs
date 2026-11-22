import { validateProgram, validateValue } from '../lib/program.mjs';
import { signedI32, instantiatePredicate } from '../lib/wasm.mjs';
import { runBatches } from '../lib/batches.mjs';

function evaluate(program, value) {
  // Lesson 01. Walk the validated tuples with a fresh operand stack.
  throw new Error('Lesson 01: implement evaluate in your runtime.mjs');
}

export function interpret(program, value) {
  validateProgram(program);
  validateValue(value);
  return evaluate(program, value);
}

export function compile(program) {
  validateProgram(program);
  // Lesson 02. Emit this program's i32 instructions and instantiate them.
  throw new Error('Lesson 02: implement compile in your runtime.mjs');
}

function executeBatch(program, values, start, end, predicate, matches, trace) {
  // Lesson 03. Write indices to matches exactly once. Record a failing guard.
  // Return { interpreted, compiledRows, guardFailures } for this batch.
  throw new Error('Lesson 03: implement executeBatch in your runtime.mjs');
}

export function run(program, values, options = {}) {
  return runBatches(program, values, options, compile, executeBatch);
}
