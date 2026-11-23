// The determinism rule: whatever shapes the island uses only operations that give the same bits on every machine.
import { declared } from './pure.mjs';

export const EXACT = ['sqrt', 'floor', 'ceil', 'imul', 'abs', 'min', 'max'];
export const ruleText = 'Anything that shapes the island may use only + - * /, Math.sqrt, Math.floor, Math.ceil, Math.imul, Math.abs, Math.min and Math.max';
// Layers that do not shape the island: the camera, the day, the flock and the sound.
const EXEMPT = new Set([1, 3, 7, 8]);

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' '); // a comment may name anything

// What a piece of source uses that the rule forbids, as a list of names.
export function forbidden(source) {
  const found = new Set();
  const code = stripComments(source);
  for (const m of code.matchAll(/\bMath\s*\.\s*(\w+)/g)) if (!EXACT.includes(m[1])) found.add(`Math.${m[1]}`);
  if (/\bMath\b(?!\s*\.)/.test(code)) found.add('Math without a plain .name (write Math.sqrt, not Math["sqrt"] or { sqrt } = Math)');
  if (code.includes('**')) found.add('** (a power, like Math.pow)');
  for (const m of code.matchAll(/\b(Date|performance|crypto)\b/g)) found.add(m[1]);
  return [...found];
}

// A script's top-level declarations: [{ name, text }]. Anything before the first one is "the top of the file".
export function declarations(source) {
  const out = [{ name: 'the code at the top', text: '' }];
  for (const line of source.split('\n')) {
    const name = declared(line)[0];
    if (name) out.push({ name, text: '' });
    out.at(-1).text += line + '\n';
  }
  return out;
}

// Every declaration of a world file's pure source that shapes the island, up to a layer: core, and each numbered
// layer that is not exempt. A helper the learner added (a name the stage does not have) is read wherever it stands,
// if one of those calls it; the stage's own camera, day, flock and sound stay exempt.
export function landPath(source, layer, stageNames) {
  const all = [];
  for (const m of source.matchAll(/^\/\/ region: ((\d+)-\S+|core) \(pure\)\n([\s\S]*?)^\/\/ endregion: \1 \(pure\)/gm)) {
    const n = m[2] ? +m[2] : 0;
    for (const d of declarations(m[3])) all.push({ ...d, region: m[1], shapes: n <= layer && !EXEMPT.has(n) });
  }
  const read = all.filter((d) => d.shapes);
  for (const d of read) {
    const code = stripComments(d.text);
    for (const other of all) if (!read.includes(other) && !stageNames.includes(other.name) && new RegExp(`\\b${other.name}\\s*\\(`).test(code)) read.push(other); // grows while it is read
  }
  return read;
}

function why(bad) {
  if (bad.includes('Math.random')) return 'Math.random gives different numbers on every run, so the same seed would not give the same island.';
  return 'Those may differ in the last bit between JavaScript engines, so the same seed could give a different island in another browser, and erosion in lesson 5 makes such differences grow.';
}

// The first fault in a list of declarations, as a message that names the function, or null.
export function ruleFault(list) {
  for (const d of list) {
    const bad = forbidden(d.text);
    if (bad.length) return `${d.name}${d.region ? ` (region ${d.region})` : ''} uses ${bad.join(', ')}. ${why(bad)} ${ruleText}.`;
  }
  return null;
}
