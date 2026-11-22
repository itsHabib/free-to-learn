// Worked subset: run a single numeric comparison.
import { pathToFileURL } from 'node:url';

// region: one-comparison
function evaluate(program, value) {
  const stack = [];
  for (const [op, literal] of program) {
    if (op === 'load') stack.push(value);
    if (op === 'const') stack.push(literal);
    if (op === 'gt') {
      const right = stack.pop();
      const left = stack.pop();
      stack.push(left !== null && right !== null && left > right);
    }
  }
  return stack.pop();
}
// endregion: one-comparison

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const program = [['load'], ['const', 30], ['gt']];
  console.log([29, 30, 31, null].map(value => evaluate(program, value)));
}
