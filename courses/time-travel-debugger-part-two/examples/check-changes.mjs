// Acceptance cases for lesson 13's new application; no changesOf is supplied.
// Every invocation copies the submitted files into a new attempt folder first,
// then checks that copy in a separate process with a time limit.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { loadRecording } from '../checks/trace.mjs';
// Plain reads and writes, not fs.copyFileSync: copying file metadata can fail
// with EPERM where the project folder belongs to another user.
const copyFileSync = (from, to) => writeFileSync(to, readFileSync(from));

const CASES = 6;
// One replay of the whole run, forward, plus room for one restore and a short
// replay back to where the question started.
const SLACK = 2000;
const FILES = [
  'machine.mjs',
  'recorder.mjs',
  'debugger.mjs',
  'changes.mjs',
  'PROJECT.json',
];
const checkerPath = fileURLToPath(import.meta.url);
const promptPath = fileURLToPath(new URL('../lessons/13.md', import.meta.url));
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
function attemptIdentity(folder) {
  const route = JSON.parse(
    readFileSync(join(folder, 'PROJECT.json'), 'utf8'),
  ).unit12_start_route;
  return {
    ...(['write', 'supplied'].includes(route)
      ? { unit12_start_route: route }
      : {}),
    format: 'ttd2-changes-attempt-1',
    application: 'changes',
    prompt: {
      file: 'lesson-13.md',
      sha256: digest(join(folder, 'lesson-13.md')),
    },
    checker: {
      file: 'check-changes.mjs',
      sha256: digest(join(folder, 'check-changes.mjs')),
    },
  };
}

const [directory, flag, help] = process.argv.slice(2);
const checkingSnapshot = directory === '--snapshot';
if (
  !directory ||
  (!checkingSnapshot && flag !== '--help-used') ||
  !help ||
  process.argv.length !== 5
) {
  console.error(
    'Usage: node examples/check-changes.mjs PROJECT --help-used "what helped"',
  );
  process.exit(2);
}

if (!checkingSnapshot) {
  const project = resolve(directory);
  let attempt;
  try {
    const identity = JSON.parse(
      readFileSync(join(project, 'PROJECT.json'), 'utf8'),
    );
    if (identity.course !== 'time-travel-debugger-part-two')
      throw Error(`${directory} is not a debugger part two project`);
    for (const file of FILES)
      if (!existsSync(join(project, file)))
        throw Error(`${directory}/${file} is missing`);
    attempt = join(
      project,
      'attempts',
      `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-changes`,
    );
    mkdirSync(attempt, { recursive: true });
    for (const file of FILES)
      copyFileSync(join(project, file), join(attempt, file));
    if (existsSync(join(project, 'report.md')))
      copyFileSync(join(project, 'report.md'), join(attempt, 'report.md'));
    copyFileSync(promptPath, join(attempt, 'lesson-13.md'));
    copyFileSync(checkerPath, join(attempt, 'check-changes.mjs'));
  } catch (error) {
    console.error(`Could not start the check: ${error.message}`);
    process.exit(2);
  }
  const evidence = attemptIdentity(attempt);
  const child = spawnSync(
    process.execPath,
    [checkerPath, '--snapshot', attempt, help],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 },
  );
  process.stdout.write(child.stdout ?? '');
  process.stderr.write(child.stderr ?? '');
  let receipt;
  try {
    receipt = JSON.parse(
      readFileSync(join(attempt, 'changes-receipt.json'), 'utf8'),
    );
  } catch {
    /* A timeout or early exit may not produce a receipt. */
  }
  const complete =
    receipt?.format === evidence.format &&
    receipt.unit12_start_route === evidence.unit12_start_route &&
    receipt.prompt?.sha256 === evidence.prompt.sha256 &&
    receipt.checker?.sha256 === evidence.checker.sha256 &&
    receipt.help_used === help &&
    Array.isArray(receipt.results) &&
    typeof receipt.pass === 'boolean';
  if (child.error || child.signal || !complete) {
    const message =
      child.error?.code === 'ETIMEDOUT'
        ? 'The check did not finish within 120 seconds; each question should replay the run about once.'
        : `Check process ended without a complete result: ${child.error?.message ?? child.signal ?? child.status}`;
    writeFileSync(
      join(attempt, 'changes-receipt.json'),
      JSON.stringify(
        {
          ...evidence,
          help_used: help,
          pass: false,
          results: [{ name: 'check process', pass: false, message }],
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`FAIL ${message}\nSaved files and results in ${attempt}`);
    process.exit(1);
  }
  const passed =
    receipt.pass &&
    receipt.results.length === CASES &&
    receipt.results.every((result) => result.pass === true);
  process.exit(child.status === 0 && passed ? 0 : 1);
}

// The child process: check the copied files in the attempt folder.
const attempt = resolve(flag);
const evidence = attemptIdentity(attempt);
assert.equal(
  digest(checkerPath),
  evidence.checker.sha256,
  'Checker changed after this attempt was saved',
);
const results = [];
const notWritten = (error) =>
  String(error?.message).includes('changesOf: not written yet');
const check = async (name, run) => {
  try {
    await run();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = notWritten(error)
      ? 'changesOf is not written yet'
      : error.message;
    results.push({ name, pass: false, message });
    console.log(`FAIL ${name}: ${message}`);
  }
};

// One pass over a recording on the submitted Machine, before any counting: for
// every byte, each tick at which an instruction changed it, with the value before
// and after, and how many stores rewrote it with the value it already held.
function history(Machine, program, recording) {
  let next = 0;
  const imports = {};
  for (const { name } of program.imports)
    imports[name] = () => recording.answers[next++].result;
  const m = new Machine(program, imports);
  const initial = m.state.memory.slice();
  const changes = new Map();
  const same = new Map();
  for (const call of recording.calls) {
    m.begin(call.name, call.args);
    while (m.running) {
      const event = m.step();
      for (const w of event.writes)
        for (let i = 0; i < w.size; i++) {
          const a = w.address + i;
          if (w.before[i] === w.after[i]) {
            same.set(a, (same.get(a) ?? 0) + 1);
            continue;
          }
          if (!changes.has(a)) changes.set(a, []);
          changes.get(a).push([event.tick, w.before[i], w.after[i]]);
        }
    }
  }
  return { initial, changes, same, end: m.state.tick };
}

// The byte values at [address, address + size) at position t.
function valueAt(H, address, size, t) {
  const out = [];
  for (let a = address; a < address + size; a++) {
    let v = H.initial[a];
    for (const [tick, , after] of H.changes.get(a) ?? []) {
      if (tick > t) break;
      v = after;
    }
    out.push(v);
  }
  return out;
}

// Every tick at or before `here` that changed one of the bytes, with the bytes
// just before and just after it.
function expected(H, address, size, here) {
  const ticks = new Set();
  for (let a = address; a < address + size; a++)
    for (const [tick] of H.changes.get(a) ?? [])
      if (tick <= here) ticks.add(tick);
  return [...ticks]
    .sort((x, y) => x - y)
    .map((tick) => ({
      tick,
      before: valueAt(H, address, size, tick - 1),
      after: valueAt(H, address, size, tick),
    }));
}

try {
  const load = (file) => import(pathToFileURL(join(attempt, file)).href);
  const { Machine } = await load('machine.mjs');
  const { Debugger } = await load('debugger.mjs');
  const { changesOf } = await load('changes.mjs');
  assert.equal(
    typeof changesOf,
    'function',
    'Export changesOf(debugger, { address, size }) from changes.mjs',
  );
  let counting = false;
  let steps = 0;
  const step = Machine.prototype.step;
  Machine.prototype.step = function (...args) {
    if (counting) steps++;
    return step.apply(this, args);
  };
  const open = (fixture) => {
    const { recording, program } = loadRecording(fixture);
    const H = history(Machine, program, recording);
    const d = new Debugger(program, recording);
    return { H, d };
  };
  // Ask one question from `here` and compare with the pass above.
  const ask = (H, d, here, address, size) => {
    const want = expected(H, address, size, here);
    d.seek(here);
    steps = 0;
    counting = true;
    let got;
    try {
      got = changesOf(d, { address, size });
    } finally {
      counting = false;
    }
    const input = `changesOf(d, { address: ${address}, size: ${size} }) at position ${here}`;
    assert.ok(Array.isArray(got), `${input} returned ${got}, not an array`);
    const plain = got.map((c) => ({
      tick: c?.tick,
      before: Array.from(c?.before ?? []),
      after: Array.from(c?.after ?? []),
    }));
    assert.equal(
      plain.length,
      want.length,
      `${input} listed ${plain.length} changes; there are ${want.length}${want.length ? `, the first at tick ${want[0].tick}` : ''}`,
    );
    plain.forEach((c, k) =>
      assert.deepEqual(
        c,
        want[k],
        `${input}: change ${k + 1} is ${JSON.stringify(c)}; it should be ${JSON.stringify(want[k])}`,
      ),
    );
    assert.equal(
      d.tick,
      here,
      `${input}: the debugger must stand where it started, ${here}, not ${d.tick}`,
    );
    const budget = d.end + SLACK;
    assert.ok(
      steps <= budget,
      `${input} replayed ${steps} instructions; at most ${budget}, one replay of the run plus ${SLACK}`,
    );
    return want.length;
  };
  // The first 4-byte-aligned address that `test` accepts, with its changes up to here.
  const pick = (H, here, test) => {
    for (const address of [...H.changes.keys()].sort((a, b) => a - b)) {
      if (address % 4) continue;
      const n = expected(H, address, 4, here).length;
      if (test(address, n)) return address;
    }
    throw Error('the check itself found no bytes to ask about (report this)');
  };

  const lob = open('checks/fixtures/10/lob-m1.json');
  const here = lob.H.end - 37;
  const word = (H, address, t) => {
    const b = valueAt(H, address, 4, t);
    return b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
  };
  const g = word(lob.H, 78112, here);

  await check(
    'bad questions are refused before moving or running',
    async () => {
      for (const bad of [
        { address: 131072, size: 1 },
        { address: 131070, size: 4 },
        { address: -1, size: 1 },
        { address: 100, size: 0 },
        { address: 100.5, size: 1 },
        { address: 100, size: 1.5 },
      ]) {
        lob.d.seek(here);
        steps = 0;
        counting = true;
        let refused = false;
        try {
          changesOf(lob.d, bad);
        } catch (error) {
          if (notWritten(error)) throw error;
          refused = true;
        } finally {
          counting = false;
        }
        assert.ok(refused, `refuse ${JSON.stringify(bad)}`);
        assert.equal(lob.d.tick, here, `${JSON.stringify(bad)}: do not move`);
        assert.equal(
          steps,
          0,
          `${JSON.stringify(bad)}: refuse before replaying`,
        );
      }
    },
  );

  await check('the pointer at 78112, changed only in game_init', async () => {
    assert.ok(ask(lob.H, lob.d, here, 78112, 4) > 0, 'the pointer changes');
  });

  await check(
    'a counter changed on every game frame, from the middle of the run',
    async () => {
      ask(lob.H, lob.d, Math.floor(here / 2), g + 72, 4);
    },
  );

  await check('nothing has run at position 0', async () => {
    ask(lob.H, lob.d, 0, g + 72, 4);
  });

  await check(
    'stores that rewrite the value already there are not changes',
    async () => {
      const address = [...lob.H.same.keys()]
        .sort((a, b) => a - b)
        .find(
          (a) =>
            (lob.H.changes.get(a) ?? []).filter(([t]) => t <= here).length >= 2,
        );
      assert.ok(
        address !== undefined,
        'the check itself found no byte to ask about (report this)',
      );
      ask(lob.H, lob.d, here, address, 1);
    },
  );

  await check('Lob II: a 4-byte value changed a few times', async () => {
    const lob2 = open('checks/fixtures/10/lob2-m1.json');
    const here2 = lob2.H.end - 101;
    const address = pick(lob2.H, here2, (a, n) => n >= 3 && n <= 50);
    ask(lob2.H, lob2.d, here2, address, 4);
  });
} catch (error) {
  results.push({
    name: 'load submitted files',
    pass: false,
    message: error.message,
  });
  console.log(`FAIL load submitted files: ${error.message}`);
}
const pass = results.length === CASES && results.every((result) => result.pass);
writeFileSync(
  join(attempt, 'changes-receipt.json'),
  JSON.stringify({ ...evidence, help_used: help, pass, results }, null, 2) +
    '\n',
);
console.log(`Saved files and results in ${attempt}`);
process.exitCode = pass ? 0 : 1;
