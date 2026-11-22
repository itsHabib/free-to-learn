import { validateProgram, validateValue } from '../lib/program.mjs';
import { signedI32, instantiatePredicate } from '../lib/wasm.mjs';
import { runBatches } from '../lib/batches.mjs';

// region: evaluate
function evaluate(program, value) {
  const stack = [];
  for (const [op, literal] of program) {
    if (op === 'load' || op === 'const') {
      stack.push(op === 'load' ? value : literal);
      continue;
    }
    const right = stack.pop();
    const left = stack.pop();
    if (op === 'and') stack.push(left && right);
    else if (left === null || right === null) stack.push(false);
    else if (op === 'gt') stack.push(left > right);
    else stack.push(left === right);
  }
  return stack.pop();
}
// endregion: evaluate

export function interpret(program, value) {
  validateProgram(program);
  validateValue(value);
  return evaluate(program, value);
}

// region: compile
export function compile(program) {
  validateProgram(program);
  const instructions = [];
  for (const [op, literal] of program) {
    if (op === 'load') instructions.push(0x20, 0x00);
    if (op === 'const') instructions.push(0x41, ...signedI32(literal));
    if (op === 'gt') instructions.push(0x4a);
    if (op === 'eq') instructions.push(0x46);
    if (op === 'and') instructions.push(0x71);
  }
  return instantiatePredicate(instructions);
}
// endregion: compile

// region: batch
function executeBatch(program, values, start, end, predicate, matches, trace) {
  let row = start;
  let guardFailures = 0;
  if (predicate) {
    while (row < end && values[row] !== null) {
      if (predicate(values[row])) matches.push(row);
      row++;
    }
    if (row < end) {
      guardFailures++;
      trace.push({ kind: 'guard-failure', at: row, resumeAt: row });
    }
  }
  const compiledRows = row - start;
  for (; row < end; row++) {
    if (evaluate(program, values[row])) matches.push(row);
  }
  return { interpreted: end - start - compiledRows, compiledRows, guardFailures };
}
// endregion: batch

export function run(program, values, options = {}) {
  return runBatches(program, values, options, compile, executeBatch);
}
