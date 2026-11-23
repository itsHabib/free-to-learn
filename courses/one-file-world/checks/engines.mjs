// Same seed, same island: runs the learner's pure code twice in Node, each time in a fresh sandbox, and, where
// it is installed (macOS ships it), once in JavaScriptCore, the engine of Safari. Each run returns ridged on a
// fixed grid of points and the height grid of one island.
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadWorld, pureSource } from './pure.mjs';

export const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc';
export const GRID = 64; // ridged at 64 by 64 points
export const SEED = 7;

// FNV-1a over the raw bytes of a typed array.
export function fingerprint(a) {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

// The driver, as text, so the same lines run in Node's sandbox and in JavaScriptCore.
const DRIVER = `
function __run(seed) {
  const grid = new Float64Array(${GRID * GRID});
  const D = [0, 0];
  for (let i = 0; i < grid.length; i++) grid[i] = ridged((i % ${GRID}) * 0.173 - 3.1, Math.floor(i / ${GRID}) * 0.191 + 1.7, 10, D);
  const land = fillLand(new Float32Array(N * N), islandParams(seed));
  return { grid, land };
}`;

export function nodeRun(file, label, seed = SEED) {
  return loadWorld(file, { label, extra: { source: DRIVER, label: 'the check' } }).call('__run', seed);
}

// WORLD_NO_JSC=1 stands for a computer without it, to test what the lab says there.
export const jscPresent = () => !process.env.WORLD_NO_JSC && existsSync(JSC);

// The same driver in JavaScriptCore: the grid's numbers as text (a number's shortest text reads back to the same
// number) and the island's fingerprint.
export function jscRun(file, seed = SEED) {
  const { source } = pureSource(readFileSync(file, 'utf8'));
  const tmp = mkdtempSync(join(tmpdir(), 'world-jsc-'));
  try {
    const script = join(tmp, 'run.js');
    const fp = `function __fp(a){const b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let h=0x811c9dc5;for(let i=0;i<b.length;i++)h=Math.imul(h^b[i],0x01000193);return (h>>>0).toString(16).padStart(8,'0');}`;
    writeFileSync(script, `${source}\n${DRIVER}\n${fp}\nconst __r = __run(${seed});\nprint(JSON.stringify({ grid: Array.from(__r.grid, String), land: __fp(__r.land) }));\n`);
    const out = JSON.parse(execFileSync(JSC, [script], { encoding: 'utf8', timeout: 60000 }));
    return { grid: Float64Array.from(out.grid, Number), land: out.land };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export const differing = (a, b) => a.reduce((n, v, i) => n + (Object.is(v, b[i]) ? 0 : 1), 0);
