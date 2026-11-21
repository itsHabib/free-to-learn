// Feed eleven messages to a parseInput and print what it says about each.
// node examples/try-parse.mjs            the unit 12 checkpoint, examples/admission-checkpoint.mjs
// node examples/try-parse.mjs project    your project's server/admission.mjs
// A function that is still a hole prints its "not written yet" message for that line.
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';

const [folder] = process.argv.slice(2);
const url = folder
  ? pathToFileURL(join(resolve(folder), 'server', 'admission.mjs')).href
  : new URL('./admission-checkpoint.mjs', import.meta.url).href;
const { parseInput } = await import(url);

const ok = '{"v":1,"seq":1,"angle":45,"power":60,"fire":false}';
const messages = [
  ['a number, not text', 42],
  ['201 bytes of spaces', ' '.repeat(201)],
  ['not JSON', '{v:1}'],
  ['a JSON list', '[1,2,3]'],
  ['an extra field', ok.replace('}', ',"score":99}')],
  ['version 2', ok.replace('"v":1', '"v":2')],
  ['seq 0', ok.replace('"seq":1', '"seq":0')],
  ['angle 45.5', ok.replace('"angle":45', '"angle":45.5')],
  ['power as a string', ok.replace('"power":60', '"power":"60"')],
  ['fire as a word', ok.replace('false', '"yes"')],
  ['an ordinary aim', ok],
];

for (const [label, text] of messages) {
  let said;
  try {
    const result = parseInput(text);
    said = result.ok
      ? `ok ${JSON.stringify(result.input)}`
      : `refused: ${result.reason}`;
  } catch (error) {
    if (!/not written yet/.test(error.message)) throw error;
    said = error.message;
  }
  console.log(`${label.padEnd(20)} ${said}`);
}
