// Run a findLeaks on the full view and on a drawnView at three moments of one scripted
// session, and print the hidden names each leaks.
// node examples/try-leaks.mjs            the unit 13 checkpoint's two files
// node examples/try-leaks.mjs project    your project's server/leaks.mjs and server/view.mjs
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { fullView } from '../public/full-view.mjs';
import { moments } from './moments.mjs';

const [folder] = process.argv.slice(2);
const load = (name, checkpoint) =>
  import(
    folder
      ? pathToFileURL(join(resolve(folder), 'server', `${name}.mjs`)).href
      : new URL(checkpoint, import.meta.url).href
  );
const { findLeaks } = await load('leaks', './leaks-checkpoint.mjs');
const { drawnView } = await load('view', './view-checkpoint.mjs');

for (const { label, game, info } of moments()) {
  for (const [name, view] of [
    ['full view', fullView],
    ['drawn view', drawnView],
  ]) {
    let said;
    try {
      const leaks = findLeaks(view, game, info);
      said = leaks.length ? leaks.join(', ') : 'nothing';
    } catch (error) {
      if (!/not written yet/.test(error.message)) throw error;
      said = error.message;
    }
    console.log(`${`${label}, ${name}:`.padEnd(24)} ${said}`);
  }
}
