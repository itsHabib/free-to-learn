// Loads the "(pure)" regions of a world file into a sandbox with no browser objects, so Node can run them.
// Every other line of the file is blanked, not removed, so an error names the same line number as the file.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const START = /^\/\/ region: (.+ \(pure\))$/;

// The file's text with only its pure regions kept: { source, regions, problems }.
export function pureSource(text) {
  const lines = text.split('\n');
  const keep = lines.map(() => '');
  const regions = [];
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const m = START.exec(lines[i].trim());
    if (!m) continue;
    const end = lines.findIndex((l, j) => j > i && l.trim() === `// endregion: ${m[1]}`);
    if (end < 0) { problems.push(`line ${i + 1}: region ${m[1]} has no "// endregion: ${m[1]}" line`); continue; }
    for (let j = i; j <= end; j++) keep[j] = lines[j];
    regions.push(m[1]);
    i = end;
  }
  keep[0] = "'use strict';"; // line 1 is the doctype, never part of a region
  return { source: keep.join('\n'), regions, problems };
}

const BUILTINS = ['Math', 'Number', 'Array', 'Object', 'String', 'Error', 'Map', 'Set', 'JSON', 'Float32Array', 'Float64Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array'];

// The names a script declares at its top level (column 0): functions, consts and lets.
export const declared = (source) => [...source.matchAll(/^(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=)/gm)].map((m) => m[1] ?? m[2]);

// A sandbox holding the pure functions of `file`. call(name, ...args) runs one of them.
// Errors keep the file's line numbers: "world.html:115". The source runs inside one function, so its names are
// local variables of that function: looking a name up on a sandbox's global object is many times slower, and
// growing an island makes millions of such lookups. The wrapper's opening shares line 1 with the blanked doctype
// and its closing goes after the last line, so line numbers do not move.
export function loadWorld(file, { label = 'world.html', extra = null } = {}) {
  const { source, regions, problems } = pureSource(readFileSync(file, 'utf8'));
  if (problems.length) throw Object.assign(new Error(problems[0]), { kind: 'load' });
  if (!regions.length) throw Object.assign(new Error(`${label} has no "// region: ... (pure)" lines`), { kind: 'load' });
  const context = vm.createContext({});
  const names = declared(source);
  // Built-ins the code uses, held as locals too: each is a slow lookup on a sandbox's global object.
  const builtins = BUILTINS.filter((n) => !names.includes(n)).join(', ');
  const wrap = (text, prelude, own) => `(function (__w) { 'use strict'; const { ${builtins} } = globalThis; ${prelude}${text}\nreturn { ${own.join(', ')} }; })`;
  let world;
  try {
    world = new vm.Script(wrap(source, '', names), { filename: label }).runInContext(context, { timeout: 5000 })();
    if (extra) {
      const own = declared(extra.source);
      const prelude = `const { ${names.filter((n) => !own.includes(n)).join(', ')} } = __w; `;
      const more = new vm.Script(wrap(extra.source, prelude, own), { filename: extra.label }).runInContext(context, { timeout: 5000 })(world);
      world = { ...world, ...more };
    }
  } catch (e) {
    throw Object.assign(new Error(`${firstLine(e)}${where(e, [label, extra?.label])}`), { kind: 'load' });
  }
  // A direct call, with no time limit of its own: checks/run.mjs runs a lesson's checks in a worker it can stop.
  const has = (name) => typeof world[name] === 'function';
  const call = (name, ...args) => world[name](...args);
  const text = (name) => String(world[name]);
  return { call, has, text, regions, source, names: Object.keys(world), get: (name) => world[name] };
}

export const firstLine = (e) => String(e?.message ?? e).split('\n')[0];

// " (world.html line 115)" from an error's stack, or nothing.
export function where(e, labels) {
  for (const label of labels.filter(Boolean)) {
    const m = String(e?.stack ?? '').match(new RegExp(`${label.replace('.', '\\.')}:(\\d+)`));
    if (m) return ` (${label} line ${m[1]})`;
  }
  return '';
}
