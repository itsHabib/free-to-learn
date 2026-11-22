// This verifier checks the *shape* of a program without executing a single row.
export function isI32(value) {
  return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
}

export function validateValue(value) {
  if (value !== null && !isI32(value)) {
    throw new TypeError('Row value must be null or a signed 32-bit integer');
  }
}

export function validateProgram(program) {
  if (!Array.isArray(program)) throw new TypeError('Expected an array of instructions');
  const types = [];
  for (const [index, instruction] of program.entries()) {
    if (!Array.isArray(instruction)) throw new TypeError('Expected a tuple at instruction ' + index);
    const [op, literal] = instruction;
    if (op === 'const') {
      if (instruction.length !== 2 || !isI32(literal)) {
        throw new TypeError('const requires one signed i32 literal at instruction ' + index);
      }
      types.push('number');
      continue;
    }
    if (instruction.length !== 1) throw new TypeError('Unexpected operands at instruction ' + index);
    if (op === 'load') {
      types.push('number');
      continue;
    }
    if (op !== 'eq' && op !== 'gt' && op !== 'and') {
      throw new TypeError('Unknown instruction at index ' + index);
    }
    const required = op === 'and' ? 'boolean' : 'number';
    const right = types.pop();
    const left = types.pop();
    if (left !== required || right !== required) {
      throw new TypeError(op + ' needs two ' + required + ' operands at instruction ' + index);
    }
    types.push('boolean');
  }
  if (types.length !== 1 || types[0] !== 'boolean') {
    throw new TypeError('A predicate must finish with exactly one boolean');
  }
}
