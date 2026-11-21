// Print your score of the first dev session of each kind, with the settings it read.
// node examples/try-score.mjs project    your project's detect/ files and detect/settings.json
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { firstSessions, play } from './first-sessions.mjs';

const [folder] = process.argv.slice(2);
if (!folder || process.argv.length !== 3) {
  console.log('Usage: node examples/try-score.mjs PROJECT');
  process.exit(2);
}
const detect = join(resolve(folder), 'detect');
const { features } = await import(
  pathToFileURL(join(detect, 'features.mjs')).href
);
const { score } = await import(
  pathToFileURL(join(detect, 'detector.mjs')).href
);
const settings = JSON.parse(
  readFileSync(join(detect, 'settings.json'), 'utf8'),
);

console.log(
  `detect/settings.json: features ${Object.keys(settings.features ?? {}).join(', ') || 'none'}`,
);
console.log(
  `${'session'.padEnd(18)}${'hitRate'.padStart(9)}${'score'.padStart(9)}`,
);
for (const c of firstSessions()) {
  const f = features(play(c));
  let s;
  try {
    s = score(f, settings).toFixed(3);
  } catch (error) {
    if (!/not written yet/.test(error.message)) throw error;
    s = error.message;
  }
  const rate = f.hitRate === null ? '-' : f.hitRate.toFixed(3);
  console.log(`${c.id.padEnd(18)}${rate.padStart(9)}${s.padStart(9)}`);
}
