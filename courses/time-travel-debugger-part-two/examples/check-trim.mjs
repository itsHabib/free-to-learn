// Acceptance cases for lesson 09's new application; no trimRecording is supplied.
// Every invocation copies the submitted files into a new attempt folder first,
// then checks that copy in a separate process with a time limit.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { readProgram } from '../public/program.mjs';
import { makeWorld } from '../public/world.mjs';
import { session, plan } from '../public/sessions.mjs';
import { nodeRecord, withGetters } from '../checks/09.mjs';
// Plain reads and writes, not fs.copyFileSync: copying file metadata can fail
// with EPERM where the project folder belongs to another user.
const copyFileSync = (from, to) => writeFileSync(to, readFileSync(from));

const CASES = 5;
const checkerPath = fileURLToPath(import.meta.url);
const promptPath = fileURLToPath(new URL('../lessons/09.md', import.meta.url));
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
function attemptIdentity(folder) {
  const route = JSON.parse(
    readFileSync(join(folder, 'PROJECT.json'), 'utf8'),
  ).unit09_start_route;
  return {
    ...(['write', 'supplied'].includes(route)
      ? { unit09_start_route: route }
      : {}),
    format: 'ttd2-trim-attempt-1',
    application: 'trim-recording',
    prompt: {
      file: 'lesson-09.md',
      sha256: digest(join(folder, 'lesson-09.md')),
    },
    checker: {
      file: 'check-trim.mjs',
      sha256: digest(join(folder, 'check-trim.mjs')),
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
    'Usage: node examples/check-trim.mjs PROJECT --help-used "what helped"',
  );
}

if (!checkingSnapshot) {
  const project = resolve(directory);
  const identity = JSON.parse(
    readFileSync(join(project, 'PROJECT.json'), 'utf8'),
  );
  if (identity.course !== 'time-travel-debugger-part-two')
    throw Error('Not a debugger part two project');
  const attempt = join(
    project,
    'attempts',
    `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-trim`,
  );
  mkdirSync(attempt, { recursive: true });
  for (const file of [
    'machine.mjs',
    'recorder.mjs',
    'trim.mjs',
    'PROJECT.json',
  ])
    copyFileSync(join(project, file), join(attempt, file));
  if (existsSync(join(project, 'report.md')))
    copyFileSync(join(project, 'report.md'), join(attempt, 'report.md'));
  copyFileSync(promptPath, join(attempt, 'lesson-09.md'));
  copyFileSync(checkerPath, join(attempt, 'check-trim.mjs'));
  const evidence = attemptIdentity(attempt);
  const child = spawnSync(
    process.execPath,
    [checkerPath, '--snapshot', attempt, help],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  process.stdout.write(child.stdout ?? '');
  process.stderr.write(child.stderr ?? '');
  let receipt;
  try {
    receipt = JSON.parse(
      readFileSync(join(attempt, 'trim-receipt.json'), 'utf8'),
    );
  } catch {
    /* A timeout or early exit may not produce a receipt. */
  }
  const complete =
    receipt?.format === evidence.format &&
    receipt.unit09_start_route === evidence.unit09_start_route &&
    receipt.prompt?.sha256 === evidence.prompt.sha256 &&
    receipt.checker?.sha256 === evidence.checker.sha256 &&
    receipt.help_used === help &&
    Array.isArray(receipt.results) &&
    typeof receipt.pass === 'boolean';
  if (child.error || child.signal || !complete) {
    const message =
      child.error?.code === 'ETIMEDOUT'
        ? 'The check did not finish within 60 seconds; a trim should replay only the first n calls, once.'
        : `Check process ended without a complete result: ${child.error?.message ?? child.signal ?? child.status}`;
    writeFileSync(
      join(attempt, 'trim-receipt.json'),
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
const check = async (name, run) => {
  try {
    await run();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false, message: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
};
const plain = (value) => JSON.parse(JSON.stringify(value));
try {
  const load = (file) => import(pathToFileURL(join(attempt, file)).href);
  const { Machine } = await load('machine.mjs');
  const { replay } = await load('recorder.mjs');
  const { trimRecording } = await load('trim.mjs');
  assert.equal(
    typeof trimRecording,
    'function',
    'Export trimRecording(program, recording, n) from trim.mjs',
  );
  // Count every instruction run through the Machine class the files share.
  let steps = 0;
  const step = Machine.prototype.step;
  Machine.prototype.step = function (...args) {
    steps++;
    return step.apply(this, args);
  };
  // Instructions the first n calls take, run here with the recording's answers.
  const ticksOf = (program, recording, n) => {
    let next = 0;
    const imports = {};
    for (const { name } of program.imports)
      imports[name] = () => recording.answers[next++].result;
    const m = new Machine(program, imports);
    for (const call of recording.calls.slice(0, n))
      m.invoke(call.name, call.args);
    return m.state.tick;
  };
  const lob = readProgram('lob');
  const lob2 = readProgram('lob2');
  const calls = session({
    seed: 9901,
    mode: 1,
    plan: plan({ seed: 9901, shots: 2 }),
  });
  const full = await nodeRecord('lob', makeWorld(990).imports, calls);
  const fire = calls.findIndex((c) => c.name === 'game_key' && c.args[0] === 5);
  const middle = fire + 25;

  await check('invalid n is refused before any work', async () => {
    const before = globalThis.structuredClone(full);
    assert.equal(trimRecording(lob, full, 1)?.calls?.length, 1, 'n = 1 works');
    for (const n of [-1, 1.5, full.calls.length + 1, '3', NaN]) {
      steps = 0;
      assert.throws(
        () => trimRecording(lob, full, n),
        `n = ${String(n)} must throw`,
      );
      assert.equal(steps, 0, `n = ${String(n)}: refuse before running`);
    }
    assert.deepEqual(full, before, 'Leave the recording unchanged');
  });

  await check(
    'a cut during a shot keeps exactly the answers asked so far',
    async () => {
      const want = await nodeRecord(
        'lob',
        makeWorld(990).imports,
        calls.slice(0, middle),
      );
      assert.ok(want.answers.length < full.answers.length);
      const limit = ticksOf(lob, full, middle);
      steps = 0;
      const got = trimRecording(lob, full, middle);
      assert.ok(
        steps <= limit,
        `ran ${steps} instructions; the first ${middle} calls take ${limit}`,
      );
      assert.deepEqual(
        plain(got),
        plain(want),
        `trimRecording(lob, recording, ${middle}) must equal a recording of the first ${middle} calls: ${got?.answers?.length} answers, wanted ${want.answers.length}`,
      );
    },
  );

  await check('all calls and no calls', async () => {
    const before = globalThis.structuredClone(full);
    const all = trimRecording(lob, full, full.calls.length);
    assert.deepEqual(plain(all), plain(full));
    for (const key of ['calls', 'results', 'answers', 'hashes']) all[key].pop();
    assert.deepEqual(full, before, 'The whole-length copy shares no arrays');
    const none = trimRecording(lob, full, 0);
    assert.deepEqual(plain(none), {
      ...plain(full),
      calls: [],
      results: [],
      answers: [],
      hashes: [],
    });
  });

  await check(
    'Lob II with getter calls; the input stays untouched',
    async () => {
      const calls2 = withGetters(
        session({ seed: 9902, mode: 3, plan: plan({ seed: 9902, shots: 2 }) }),
        ['g0', 'g1', 'g2'],
      );
      const full2 = await nodeRecord('lob2', makeWorld(991).imports, calls2);
      const n = Math.floor(calls2.length * 0.6);
      const want = await nodeRecord(
        'lob2',
        makeWorld(991).imports,
        calls2.slice(0, n),
      );
      const before = globalThis.structuredClone(full2);
      const got = trimRecording(lob2, full2, n);
      assert.deepEqual(plain(got), plain(want));
      got.answers.push({ name: 'sin', args: [0], result: 0 });
      got.answers[0].args.push(1);
      got.answers[1].result = 99;
      got.calls[0].args.push(1);
      got.calls.length = 0;
      assert.deepEqual(
        full2,
        before,
        'Changing the trimmed copy must not change the input',
      );
    },
  );

  await check('the trimmed recording replays with check: true', async () => {
    const got = trimRecording(lob, full, middle);
    const out = replay(lob, got);
    assert.equal(out.hashes.length, middle);
    assert.equal(out.hashes.at(-1), full.hashes[middle - 1]);
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
  join(attempt, 'trim-receipt.json'),
  JSON.stringify({ ...evidence, help_used: help, pass, results }, null, 2) +
    '\n',
);
console.log(`Saved files and results in ${attempt}`);
process.exitCode = pass ? 0 : 1;
