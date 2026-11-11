import { readFile } from 'node:fs/promises';
import { replay } from '../engine.mjs';
if (process.argv.length !== 3) {
  console.error('Usage: npm run replay -- path/to/record.json');
  process.exit(2);
}
try {
  const state = replay(JSON.parse(await readFile(process.argv[2], 'utf8')));
  console.log(JSON.stringify(state, null, 2));
} catch (error) {
  console.error(`Replay refused: ${error.message}`);
  process.exitCode = 1;
}
