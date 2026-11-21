// Acceptance cases for lesson 10's new application; no reverseFind is supplied.
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
const BUDGET = 20000;
const FILES = [
  'machine.mjs',
  'recorder.mjs',
  'debugger.mjs',
  'reverse-find.mjs',
  'PROJECT.json',
];
const checkerPath = fileURLToPath(import.meta.url);
const promptPath = fileURLToPath(new URL('../lessons/10.md', import.meta.url));
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
function attemptIdentity(folder) {
  const route = JSON.parse(
    readFileSync(join(folder, 'PROJECT.json'), 'utf8'),
  ).unit10_start_route;
  return {
    ...(['write', 'supplied'].includes(route)
      ? { unit10_start_route: route }
      : {}),
    format: 'ttd2-reverse-find-attempt-1',
    application: 'reverse-find',
    prompt: {
      file: 'lesson-10.md',
      sha256: digest(join(folder, 'lesson-10.md')),
    },
    checker: {
      file: 'check-reverse-find.mjs',
      sha256: digest(join(folder, 'check-reverse-find.mjs')),
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
    'Usage: node examples/check-reverse-find.mjs PROJECT --help-used "what helped"',
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
      `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-rfind`,
    );
    mkdirSync(attempt, { recursive: true });
    for (const file of FILES)
      copyFileSync(join(project, file), join(attempt, file));
    if (existsSync(join(project, 'report.md')))
      copyFileSync(join(project, 'report.md'), join(attempt, 'report.md'));
    copyFileSync(promptPath, join(attempt, 'lesson-10.md'));
    copyFileSync(checkerPath, join(attempt, 'check-reverse-find.mjs'));
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
      readFileSync(join(attempt, 'rfind-receipt.json'), 'utf8'),
    );
  } catch {
    /* A timeout or early exit may not produce a receipt. */
  }
  const complete =
    receipt?.format === evidence.format &&
    receipt.unit10_start_route === evidence.unit10_start_route &&
    receipt.prompt?.sha256 === evidence.prompt.sha256 &&
    receipt.checker?.sha256 === evidence.checker.sha256 &&
    receipt.help_used === help &&
    Array.isArray(receipt.results) &&
    typeof receipt.pass === 'boolean';
  if (child.error || child.signal || !complete) {
    const message =
      child.error?.code === 'ETIMEDOUT'
        ? 'The check did not finish within 120 seconds; each search should replay a few thousand instructions, not the run.'
        : `Check process ended without a complete result: ${child.error?.message ?? child.signal ?? child.status}`;
    writeFileSync(
      join(attempt, 'rfind-receipt.json'),
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
  String(error?.message).includes('reverseFind: not written yet');
const check = async (name, run) => {
  try {
    await run();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = notWritten(error)
      ? 'reverseFind is not written yet'
      : error.message;
    results.push({ name, pass: false, message });
    console.log(`FAIL ${name}: ${message}`);
  }
};

// One pass over a recording on the submitted Machine, counted separately from the
// search: for every byte, each tick at which an instruction changed it, and for
// every 4,096-byte page, the last tick any instruction wrote it.
function history(Machine, program, recording) {
  let next = 0;
  const imports = {};
  for (const { name } of program.imports)
    imports[name] = () => recording.answers[next++].result;
  const m = new Machine(program, imports);
  const initial = m.state.memory.slice();
  const changes = new Map();
  const pageLast = new Map();
  for (const call of recording.calls) {
    m.begin(call.name, call.args);
    while (m.running) {
      const event = m.step();
      for (const w of event.writes)
        for (let i = 0; i < w.size; i++) {
          const a = w.address + i;
          pageLast.set(a >> 12, event.tick);
          if (w.before[i] === w.after[i]) continue;
          if (!changes.has(a)) changes.set(a, []);
          changes.get(a).push([event.tick, w.before[i], w.after[i]]);
        }
    }
  }
  return { initial, changes, pageLast, end: m.state.tick };
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

// The greatest position before `here` where the bytes equal `equals`, or null.
// The bytes change only at the ticks in H.changes, so only those moments and
// the position just before each one need testing.
function brute(H, address, size, equals, here) {
  const moments = new Set([here - 1]);
  for (let a = address; a < address + size; a++)
    for (const [tick] of H.changes.get(a) ?? [])
      if (tick <= here) moments.add(tick - 1);
  const same = (t) =>
    valueAt(H, address, size, t).every((v, i) => v === equals[i]);
  const sorted = [...moments].filter((t) => t >= 0).sort((a, b) => b - a);
  for (const t of sorted) if (same(t)) return t;
  return null;
}

try {
  const load = (file) => import(pathToFileURL(join(attempt, file)).href);
  const { Machine } = await load('machine.mjs');
  const { Debugger } = await load('debugger.mjs');
  const { reverseFind } = await load('reverse-find.mjs');
  assert.equal(
    typeof reverseFind,
    'function',
    'Export reverseFind(debugger, { address, size, equals }) from reverse-find.mjs',
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
  // Ask one question from `here` and compare with the brute-force answer.
  const ask = (H, d, here, address, size, equals, budget = BUDGET) => {
    const want = brute(H, address, size, equals, here);
    d.seek(here);
    steps = 0;
    counting = true;
    let got;
    try {
      got = reverseFind(d, { address, size, equals });
    } finally {
      counting = false;
    }
    const input = `reverseFind(d, { address: ${address}, size: ${size}, equals: [${equals}] }) at position ${here}`;
    assert.equal(got, want, `${input} returned ${got}; the answer is ${want}`);
    assert.equal(
      d.tick,
      want === null ? here : want,
      `${input}: the debugger must stand at ${want === null ? 'the position it started from' : 'the answer'}, not ${d.tick}`,
    );
    if (want !== null)
      assert.deepEqual(
        [...d.read(address, size)],
        equals,
        `${input}: memory at the answer holds the value`,
      );
    assert.ok(
      steps <= budget,
      `${input} replayed ${steps} instructions; at most ${budget}, since a replay from position 0 would cost about ${here}`,
    );
    return got;
  };
  // A byte whose last change came `from` to `to` instructions before here, on a
  // page written as often as `pageTest` asks; equals is its value before that change.
  const pick = (H, here, from, to, pageTest) => {
    for (const [address, list] of [...H.changes].sort((a, b) => a[0] - b[0])) {
      const last = list.filter(([tick]) => tick <= here).at(-1);
      if (!last || here - last[0] < from || here - last[0] > to) continue;
      if (!pageTest(H.pageLast.get(address >> 12))) continue;
      return { address, equals: [last[1]], changed: last[0] };
    }
    throw Error('the check itself found no byte to ask about (report this)');
  };

  const lob = open('checks/fixtures/10/lob-m1.json');
  const here = lob.H.end - 37;

  await check(
    'a valid question works, and bad ones are refused before moving',
    async () => {
      const t = pick(lob.H, here, 3000, 9000, () => true);
      lob.d.seek(here);
      assert.equal(
        typeof reverseFind(lob.d, {
          address: t.address,
          size: 1,
          equals: t.equals,
        }),
        'number',
        'a value the byte held a few thousand instructions ago is found',
      );
      for (const bad of [
        { address: 131072, size: 1, equals: [0] },
        { address: 131070, size: 4, equals: [0, 0, 0, 0] },
        { address: 100, size: 0, equals: [] },
        { address: 100, size: 2, equals: [0] },
        { address: 100, size: 1, equals: [256] },
        { address: 100, size: 1, equals: [1.5] },
      ]) {
        lob.d.seek(here);
        steps = 0;
        counting = true;
        try {
          assert.throws(
            () => reverseFind(lob.d, bad),
            `refuse ${JSON.stringify(bad)}`,
          );
        } finally {
          counting = false;
        }
        assert.equal(lob.d.tick, here, `${JSON.stringify(bad)}: do not move`);
        assert.equal(
          steps,
          0,
          `${JSON.stringify(bad)}: refuse before replaying`,
        );
      }
    },
  );

  await check('a value held a few thousand instructions back', async () => {
    const t = pick(lob.H, here, 3000, 9000, () => true);
    ask(lob.H, lob.d, here, t.address, 1, t.equals);
  });

  await check(
    'a value last held in game_init, on a page nothing has written since',
    async () => {
      const t = pick(lob.H, here, 300000, Infinity, (last) => last < 100000);
      ask(lob.H, lob.d, here, t.address, 1, t.equals);
    },
  );

  await check('the value the bytes hold now, four bytes wide', async () => {
    const t = pick(lob.H, here, 300000, Infinity, (last) => last < 100000);
    const address = t.address - (t.address % 4);
    ask(lob.H, lob.d, here, address, 4, valueAt(lob.H, address, 4, here));
  });

  await check(
    'a value the bytes never held: null, and the debugger stays',
    async () => {
      const t = pick(lob.H, here, 300000, Infinity, (last) => last < 100000);
      const seen = new Set([lob.H.initial[t.address]]);
      for (const [, , after] of lob.H.changes.get(t.address)) seen.add(after);
      let never = 0;
      while (seen.has(never)) never++;
      ask(lob.H, lob.d, here, t.address, 1, [never], 4 * BUDGET);
    },
  );

  await check(
    'Lob II: a value held a few thousand instructions back',
    async () => {
      const lob2 = open('checks/fixtures/10/lob2-m1.json');
      const here2 = lob2.H.end - 101;
      const t = pick(lob2.H, here2, 3000, 9000, () => true);
      ask(lob2.H, lob2.d, here2, t.address, 1, t.equals);
    },
  );
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
  join(attempt, 'rfind-receipt.json'),
  JSON.stringify({ ...evidence, help_used: help, pass, results }, null, 2) +
    '\n',
);
console.log(`Saved files and results in ${attempt}`);
process.exitCode = pass ? 0 : 1;
