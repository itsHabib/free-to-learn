// Acceptance cases for the new application; no runSlice implementation is supplied.
// Every invocation snapshots the submitted files before importing either one.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { readProgram } from '../public/program.mjs';
import { makeWorld } from '../public/world.mjs';
// Plain reads and writes, not fs.copyFileSync: copying file metadata can fail
// with EPERM where the project folder belongs to another user.
const copyFileSync = (from, to) => writeFileSync(to, readFileSync(from));

const checkerPath = fileURLToPath(import.meta.url);
const promptPath = fileURLToPath(new URL('../lessons/08.md', import.meta.url));
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
function attemptIdentity(folder) {
  const route = JSON.parse(
    readFileSync(join(folder, 'PROJECT.json'), 'utf8'),
  ).unit08_start_route;
  const initialRoute = ['write', 'supplied'].includes(route)
    ? { unit08_start_route: route }
    : {};
  return {
    ...initialRoute,
    format: 'ttd2-slice-attempt-1',
    prompt: {
      file: 'lesson-08.md',
      sha256: digest(join(folder, 'lesson-08.md')),
    },
    checker: {
      file: 'check-slice.mjs',
      sha256: digest(join(folder, 'check-slice.mjs')),
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
  throw Error(
    'Usage: node examples/check-slice.mjs PROJECT --help-used "what helped"',
  );
}
let attempt;
let evidence;
if (checkingSnapshot) {
  attempt = resolve(flag);
  evidence = attemptIdentity(attempt);
  assert.equal(
    digest(checkerPath),
    evidence.checker.sha256,
    'Checker changed after this attempt was saved',
  );
} else {
  const project = resolve(directory);
  const identity = JSON.parse(
    readFileSync(join(project, 'PROJECT.json'), 'utf8'),
  );
  if (identity.course !== 'time-travel-debugger-part-two')
    throw Error('Not a debugger part two project');
  attempt = join(
    project,
    'attempts',
    `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-slice`,
  );
  mkdirSync(attempt, { recursive: true });
  for (const file of ['machine.mjs', 'run-slice.mjs', 'PROJECT.json'])
    copyFileSync(join(project, file), join(attempt, file));
  if (existsSync(join(project, 'report.md')))
    copyFileSync(join(project, 'report.md'), join(attempt, 'report.md'));
  copyFileSync(promptPath, join(attempt, 'lesson-08.md'));
  copyFileSync(checkerPath, join(attempt, 'check-slice.mjs'));
  evidence = attemptIdentity(attempt);
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), '--snapshot', attempt, help],
    {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    },
  );
  process.stdout.write(child.stdout ?? '');
  process.stderr.write(child.stderr ?? '');
  let receipt;
  try {
    receipt = JSON.parse(
      readFileSync(join(attempt, 'slice-receipt.json'), 'utf8'),
    );
  } catch {
    /* A timeout or early exit may not produce a receipt. */
  }
  const complete =
    receipt?.application === 'instruction-budget-runner' &&
    receipt.format === evidence.format &&
    receipt.unit08_start_route === evidence.unit08_start_route &&
    receipt.prompt?.sha256 === evidence.prompt.sha256 &&
    receipt.checker?.sha256 === evidence.checker.sha256 &&
    receipt.help_used === help &&
    Array.isArray(receipt.results) &&
    receipt.results.length > 0 &&
    typeof receipt.pass === 'boolean';
  if (child.error || child.signal || !complete) {
    const message =
      child.error?.code === 'ETIMEDOUT'
        ? 'Runner did not return within 10 seconds; check that each slice stops after its budget.'
        : `Check process ended without a complete result: ${child.error?.message ?? child.signal ?? child.status}`;
    writeFileSync(
      join(attempt, 'slice-receipt.json'),
      JSON.stringify(
        {
          ...evidence,
          application: 'instruction-budget-runner',
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
    receipt.results.length === 5 &&
    receipt.results.every((result) => result.pass === true);
  process.exit(child.status === 0 && passed ? 0 : 1);
}
const results = [];
let Machine;
let runSlice;
try {
  ({ Machine } = await import(
    pathToFileURL(join(attempt, 'machine.mjs')).href
  ));
  ({ runSlice } = await import(
    pathToFileURL(join(attempt, 'run-slice.mjs')).href
  ));
  assert.equal(typeof runSlice, 'function', 'Export runSlice(machine, budget)');
  const small = (code, results = []) =>
    new Machine({
      format: 'ttd2-program-1',
      types: [{ params: [], results }],
      imports: [],
      functions: [{ index: 0, type: 0, locals: [], code }],
      exports: [{ name: 'main', kind: 'func', index: 0 }],
      globals: [],
      memory: { min: 1 },
      data: [],
    });
  // The starter's runSlice throws "not written yet". That throw is not a rejection
  // or a trap the runner chose to keep, so every case fails and says so.
  const notWritten = (error) =>
    String(error?.message).includes('not written yet');
  const check = (name, run) => {
    try {
      run();
      results.push({ name, pass: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      const message = notWritten(error)
        ? 'runSlice is not written yet'
        : error.message;
      results.push({ name, pass: false, message });
      console.log(`FAIL ${name}: ${message}`);
    }
  };
  // Like assert.throws, except that an unwritten runSlice's error is passed on.
  const throwsWritten = (run, expected, message) =>
    assert.throws(
      run,
      (error) => {
        if (notWritten(error)) throw error;
        if (expected && !expected.test(String(error?.message))) return false;
        return true;
      },
      message,
    );
  check('invalid budgets do no work', () => {
    const m = small([['end']]);
    for (const budget of [
      0,
      -1,
      1.5,
      Infinity,
      NaN,
      '2',
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      for (const active of [false, true]) {
        if (active) m.begin('main');
        const before = globalThis.structuredClone(m.state);
        throwsWritten(
          () => runSlice(m, budget),
          null,
          'Reject non-positive or unsafe integer budget',
        );
        assert.deepEqual(
          m.state,
          before,
          'Validation must happen before stepping',
        );
        if (active) m.step();
      }
    }
  });
  check('idle and exact-boundary return', () => {
    const m = small([['i32.const', 7], ['end']], ['i32']);
    assert.deepEqual(runSlice(m, 2), { executed: 0, stopped: 'returned' });
    m.begin('main');
    assert.deepEqual(runSlice(m, 1), { executed: 1, stopped: 'budget' });
    assert.deepEqual(runSlice(m, 1), { executed: 1, stopped: 'returned' });
    assert.equal(m.state.result, 7);
    assert.equal(m.state.calls, 1, 'Resuming must not begin another call');
  });
  check('endless guest yields repeatedly', () => {
    const m = small([['loop', null], ['br', 0], ['end'], ['end']]);
    m.begin('main');
    assert.deepEqual(runSlice(m, 11), { executed: 11, stopped: 'budget' });
    const copy = globalThis.structuredClone(m.state);
    m.state = copy;
    assert.deepEqual(runSlice(m, 17), { executed: 17, stopped: 'budget' });
    assert.equal(m.state.tick, 28);
    assert.equal(m.state.calls, 1);
    assert.equal(m.running, true);
  });
  check('traps remain errors', () => {
    const m = small(
      [['i32.const', 1], ['i32.const', 0], ['i32.div_s'], ['end']],
      ['i32'],
    );
    m.begin('main');
    throwsWritten(
      () => runSlice(m, 10),
      /trap:/,
      'Do not turn guest traps into successful pauses',
    );
  });
  check('chunked Lob matches uninterrupted Lob', () => {
    const program = readProgram('lob');
    const m = new Machine(program, makeWorld(42).imports);
    const uninterrupted = new Machine(program, makeWorld(42).imports);
    m.begin('game_init', [5, 0]);
    let executed = 0;
    let slices = 0;
    do {
      const before = m.state.tick;
      const out = runSlice(m, 211);
      assert.equal(out.executed, m.state.tick - before);
      assert.ok(
        out.executed > 0 && out.executed <= 211,
        'Each non-idle slice makes bounded progress',
      );
      assert.equal(out.stopped, m.running ? 'budget' : 'returned');
      executed += out.executed;
      assert.ok(++slices < 2000, 'Lob initialization should finish');
    } while (m.running);
    uninterrupted.invoke('game_init', [5, 0]);
    assert.equal(executed, uninterrupted.state.tick);
    assert.deepEqual(
      m.state,
      uninterrupted.state,
      'Slicing must preserve the whole game state',
    );
    assert.ok(slices > 1, 'Actually yield during initialization');
  });
} catch (error) {
  results.push({
    name: 'load submitted application',
    pass: false,
    message: error.message,
  });
  console.log(`FAIL load submitted application: ${error.message}`);
}
const pass = results.length > 0 && results.every((result) => result.pass);
writeFileSync(
  join(attempt, 'slice-receipt.json'),
  JSON.stringify(
    {
      ...evidence,
      application: 'instruction-budget-runner',
      help_used: help,
      pass,
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Saved files and results in ${attempt}`);
process.exitCode = pass ? 0 : 1;
