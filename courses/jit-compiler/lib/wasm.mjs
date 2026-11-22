// Lengths are unsigned. An i32.const operand has a signed LEB128 encoding.
function unsignedLength(value) {
  const bytes = [];
  do {
    const digit = value % 128;
    value = Math.floor(value / 128);
    bytes.push(value ? digit | 0x80 : digit);
  } while (value);
  return bytes;
}

export function signedI32(value) {
  const bytes = [];
  for (;;) {
    const digit = value & 0x7f;
    value >>= 7;
    const negative = (digit & 0x40) !== 0;
    const finished = (value === 0 && !negative) || (value === -1 && negative);
    bytes.push(finished ? digit : digit | 0x80);
    if (finished) return bytes;
  }
}

function section(id, payload) {
  return [id, ...unsignedLength(payload.length), ...payload];
}

// Wrap the learner's instructions in one (param i32) (result i32) function.
// No imports: the generated predicate can only use its input and constants.
export function instantiatePredicate(instructions) {
  const body = [0x00, ...instructions, 0x0b]; // zero local declarations; end
  const type = section(1, [1, 0x60, 1, 0x7f, 1, 0x7f]);
  const functions = section(3, [1, 0]); // one function, with type index zero
  const exports = section(7, [1, 4, 0x74, 0x65, 0x73, 0x74, 0, 0]); // "test"
  const code = section(10, [1, ...unsignedLength(body.length), ...body]);
  const bytes = Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0, ...type, ...functions, ...exports, ...code]);
  return new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.test;
}
