// Print a drawnView's message at three moments of one scripted session, and its size
// against the full view's.
// node examples/try-view.mjs            the unit 13 checkpoint, examples/view-checkpoint.mjs
// node examples/try-view.mjs project    your project's server/view.mjs
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { fullView } from '../public/full-view.mjs';
import { moments } from './moments.mjs';

const [folder] = process.argv.slice(2);
const url = folder
  ? pathToFileURL(join(resolve(folder), 'server', 'view.mjs')).href
  : new URL('./view-checkpoint.mjs', import.meta.url).href;
const { drawnView } = await import(url);

for (const { label, game, info } of moments()) {
  let text;
  try {
    text = JSON.stringify(drawnView(game, info));
  } catch (error) {
    if (!/not written yet/.test(error.message)) throw error;
    console.log(`${label}: ${error.message}`);
    continue;
  }
  const full = JSON.stringify(fullView(game, info)).length;
  console.log(`${label}: ${text.length} bytes (the full view: ${full})`);
  console.log(`  ${text}`);
}
