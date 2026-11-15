// Unit 12: stack and names. Names are compared with what the files hold; stacks,
// function stops and stepOut with a brute-force replay on your own machine.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, show, countSteps, readJson, courseRoot } from './harness.mjs';
import { trace, statesAt, scan, uncounted, loadRecording } from './trace.mjs';

export const title = 'Stack and names';
const rng = (seed) => { let x = seed >>> 0 || 1; return (n) => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x % n; }; };
const bytesOf = (rel) => new Uint8Array(readFileSync(join(courseRoot, rel)));

async function setup({ cls }) {
  const Machine = await cls('machine.mjs', 'Machine');
  const Debugger = await cls('debugger.mjs', 'Debugger');
  const counter = countSteps(Machine);
  const { recording, program } = loadRecording('checks/fixtures/10/lob-m1.json');
  const T = uncounted(counter, () => trace(Machine, program, recording));
  return { Machine, counter, recording, program, T, d: new Debugger(program, recording) };
}

export const cases = [
  {
    id: '12.names', title: 'functionNames reads the name section', timeLimitMs: 10000,
    requirement: 'functionNames(bytes) returns { index: name } from subsection 1 of the "name" custom section, skipping other sections and subsections, and {} for a file without one.',
    async run({ fn }) {
      const functionNames = await fn('names.mjs', 'functionNames');
      const want = readJson('checks/fixtures/12/names.json');
      for (const [file, names] of Object.entries(want)) {
        const got = functionNames(bytesOf(file));
        const g = Object.fromEntries(Object.entries(got ?? {}).map(([k, v]) => [String(k), v]));
        const keys = new Set([...Object.keys(g), ...Object.keys(names)]);
        for (const k of keys) if (g[k] !== names[k]) fail({ checked: 'functionNames reads every function name', input: `functionNames(bytes of ${file})`, observed: `function ${k} is ${show(g[k])}`, expected: `${show(names[k])}${file.includes('odd') ? ' (this file puts subsections 2 and 0 before subsection 1, and has a name longer than 127 bytes and an index of 300)' : ''}` });
      }
    },
  },
  {
    id: '12.lines', title: 'lineAt finds the row of any instruction', timeLimitMs: 10000,
    requirement: 'lineAt(lines, offset) returns { line, column } of the last row at or before offset, or null before the first row.',
    async run({ fn }) {
      const lineAt = await fn('names.mjs', 'lineAt');
      const table = readJson('lines/lob.json');
      const rows = table.rows;
      const program = readJson('programs/lob.json');
      const offsets = [0, rows[0].offset - 1, rows[0].offset, rows.at(-1).offset, rows.at(-1).offset + 50, ...program.functions.flatMap((f) => f.offsets)];
      let k = 0;
      for (const offset of offsets.sort((a, b) => a - b)) {
        while (k < rows.length && rows[k].offset <= offset) k++;
        const want = k ? { line: rows[k - 1].line, column: rows[k - 1].column } : null;
        const got = lineAt(rows, offset);
        const same = want === null ? got === null : got && got.line === want.line && got.column === want.column;
        if (!same) fail({ checked: 'lineAt returns the last row at or before the offset', input: `lineAt(lines/lob.json rows, ${offset})`, observed: show(got), expected: show(want) });
      }
    },
  },
  {
    id: '12.stack', title: 'stack() lists the frames at any position', timeLimitMs: 30000,
    requirement: 'stack() returns [{ func, at }] for the frames in progress, outermost first, and [] between calls.',
    async run(env) {
      const { d, T, Machine, program, recording, counter } = await setup(env);
      const r = rng(41);
      const ps = [T.callStart[50], T.callStart[50] + 1];
      for (let k = 1; k < T.end && ps.length < 14; k += 1 + r(60000)) if (T.depth[k] === 2 || ps.length % 3 === 0) ps.push(k);
      const states = uncounted(counter, () => statesAt(Machine, program, recording, ps));
      for (const p of ps) {
        d.seek(p);
        const got = (d.stack() ?? []).map((f) => ({ func: f.func, at: f.at }));
        const want = states.get(p).frames.map((f) => ({ func: f.func, at: f.at }));
        if (JSON.stringify(got) !== JSON.stringify(want)) fail({ checked: 'stack() lists the frames, outermost first', input: `seek(${p}), stack()`, observed: show(got), expected: show(want) });
      }
    },
  },
  {
    id: '12.function-stops', title: 'continue and continueBack stop where a function begins', timeLimitMs: 40000,
    requirement: 'A function stop fires at a position whose next instruction is the function\'s instruction 0; reason is "function".',
    async run(env) {
      const { d, T } = await setup(env);
      const r = rng(43);
      for (let k = 0; k < 10; k++) {
        // game_tick (8) is entered between calls, so its stop fires at idle positions.
        const stops = { functions: [k >= 8 ? 8 : k % 2 ? 5 : 6] };
        const p = 1000 + r(T.end - 2000);
        for (const dir of [+1, -1]) {
          const want = scan(T, stops, p, dir);
          d.seek(p);
          const got = dir > 0 ? d.continue(stops) : d.continueBack(stops);
          if (!got || got.tick !== want.tick || !want.kinds.includes(got.reason)) fail({ checked: `${dir > 0 ? 'continue' : 'continueBack'} stops where ${({ 5: 'new_round (function 5)', 6: 'update_hud (function 6)', 8: 'game_tick (function 8), which begins between calls' })[stops.functions[0]]} begins`, input: `seek(${p}), ${dir > 0 ? 'continue' : 'continueBack'}(${show(stops)})`, observed: show(got), expected: `{ reason: ${want.kinds.join(' or ')}, tick: ${want.tick} }` });
        }
      }
    },
  },
  {
    id: '12.step-out', title: 'stepOut runs to the end of the current function', timeLimitMs: 30000,
    requirement: 'Inside a call, stepOut() moves to the first later position with fewer frames than now.',
    async run(env) {
      const { d, T } = await setup(env);
      const r = rng(47);
      let tried = 0;
      for (let p = 5000; p < T.end && tried < 10; p += 1 + r(70000)) {
        if (T.depth[p] < 1) continue;
        tried++;
        let q = p + 1;
        while (q <= T.end && T.depth[q] >= T.depth[p]) q++;
        d.seek(p);
        d.stepOut();
        if (d.tick !== q) fail({ checked: 'stepOut stops when the current function has returned', input: `seek(${p}) with ${T.depth[p]} frames, stepOut()`, observed: `tick ${d.tick}`, expected: `tick ${q}, the first position with fewer than ${T.depth[p]} frames` });
      }
    },
  },
];
