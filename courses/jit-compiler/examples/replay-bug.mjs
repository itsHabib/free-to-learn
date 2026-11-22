// Worked failure. This deliberately broken scanner restarts an interpreted
// suffix at zero after it has already published its first result.
import { pathToFileURL } from 'node:url';
import { compile, interpret } from '../reference/runtime.mjs';

export function replayBug() {
  const program = [['load'], ['const', 30], ['gt']];
  const values = [45, null, 46];
  const predicate = compile(program);
  const matches = [];
  // region: restart
  let row = 0;
  while (row < values.length && values[row] !== null) {
    if (predicate(values[row])) matches.push(row);
    row++;
  }
  const failedAt = row;
  const resumeAt = 0; // intentional defect
  for (row = resumeAt; row < values.length; row++) {
    if (interpret(program, values[row])) matches.push(row);
  }
  // endregion: restart
  return { failedAt, resumeAt, matches };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(replayBug()));
}
