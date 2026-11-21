// Acceptance cases for lesson 11's new application; no valueSources is supplied.
// Every invocation copies the submitted files into a new attempt folder first,
// then checks that copy in a separate process with a time limit.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { readProgram } from '../public/program.mjs';
// Plain reads and writes, not fs.copyFileSync: copying file metadata can fail
// with EPERM where the project folder belongs to another user.
const copyFileSync = (from, to) => writeFileSync(to, readFileSync(from));

const CASES = 6;
const FILES = [
  'machine.mjs',
  'recorder.mjs',
  'query.mjs',
  'value-sources.mjs',
  'PROJECT.json',
];
const checkerPath = fileURLToPath(import.meta.url);
const promptPath = fileURLToPath(new URL('../lessons/11.md', import.meta.url));
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
function attemptIdentity(folder) {
  const route = JSON.parse(
    readFileSync(join(folder, 'PROJECT.json'), 'utf8'),
  ).unit11_start_route;
  return {
    ...(['write', 'supplied'].includes(route)
      ? { unit11_start_route: route }
      : {}),
    format: 'ttd2-value-sources-attempt-1',
    application: 'value-sources',
    prompt: {
      file: 'lesson-11.md',
      sha256: digest(join(folder, 'lesson-11.md')),
    },
    checker: {
      file: 'check-value-sources.mjs',
      sha256: digest(join(folder, 'check-value-sources.mjs')),
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
    'Usage: node examples/check-value-sources.mjs PROJECT --help-used "what helped"',
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
      `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-vsources`,
    );
    mkdirSync(attempt, { recursive: true });
    for (const file of FILES)
      copyFileSync(join(project, file), join(attempt, file));
    if (existsSync(join(project, 'report.md')))
      copyFileSync(join(project, 'report.md'), join(attempt, 'report.md'));
    copyFileSync(promptPath, join(attempt, 'lesson-11.md'));
    copyFileSync(checkerPath, join(attempt, 'check-value-sources.mjs'));
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
      readFileSync(join(attempt, 'vsources-receipt.json'), 'utf8'),
    );
  } catch {
    /* A timeout or early exit may not produce a receipt. */
  }
  const complete =
    receipt?.format === evidence.format &&
    receipt.unit11_start_route === evidence.unit11_start_route &&
    receipt.prompt?.sha256 === evidence.prompt.sha256 &&
    receipt.checker?.sha256 === evidence.checker.sha256 &&
    receipt.help_used === help &&
    Array.isArray(receipt.results) &&
    typeof receipt.pass === 'boolean';
  if (child.error || child.signal || !complete) {
    const message =
      child.error?.code === 'ETIMEDOUT'
        ? 'The check did not finish within 120 seconds; building two indexes should take seconds, and each question should only ask the index.'
        : `Check process ended without a complete result: ${child.error?.message ?? child.signal ?? child.status}`;
    writeFileSync(
      join(attempt, 'vsources-receipt.json'),
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
  String(error?.message).includes('valueSources: not written yet');
const check = async (name, run) => {
  try {
    await run();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = notWritten(error)
      ? 'valueSources is not written yet'
      : error.message;
    results.push({ name, pass: false, message });
    console.log(`FAIL ${name}: ${message}`);
  }
};

// Each expected list is kept as its length and the start of a salted hash, so a
// failure says which list differs without printing the answer.
const SALT = 'value-sources-1';
const LISTS = ['stores', 'answers', 'args', 'initial'];
const hashOf = (list) =>
  createHash('sha256')
    .update(SALT + JSON.stringify(list))
    .digest('hex')
    .slice(0, 16);
const NONE = [0, '3f05beeb5e3cab40'];

try {
  const load = (file) => import(pathToFileURL(join(attempt, file)).href);
  const { Machine } = await load('machine.mjs');
  const { buildIndex } = await load('query.mjs');
  const { valueSources } = await load('value-sources.mjs');
  assert.equal(
    typeof valueSources,
    'function',
    'Export valueSources(index, { address, size, position }) from value-sources.mjs',
  );
  let counting = false;
  let steps = 0;
  const step = Machine.prototype.step;
  Machine.prototype.step = function (...args) {
    if (counting) steps++;
    return step.apply(this, args);
  };
  const open = (fixture) => {
    // A unit 11 check fixture holds its recording inside.
    const { recording } = JSON.parse(
      readFileSync(fileURLToPath(new URL(`../${fixture}`, import.meta.url))),
    );
    return {
      fixture,
      index: buildIndex(readProgram(recording.program), recording),
    };
  };
  // Ask one question and compare each list; a question may run no instruction.
  const ask = ({ fixture, index }, address, size, position, expect) => {
    const input = `valueSources(index, { address: ${address}, size: ${size}, position: ${position} }) on ${fixture}`;
    steps = 0;
    counting = true;
    let got;
    try {
      got = valueSources(index, { address, size, position });
    } finally {
      counting = false;
    }
    assert.equal(
      steps,
      0,
      `${input} ran ${steps} instructions; it may run none, because the index answers lastWriter and sources without replaying`,
    );
    for (const name of LISTS) {
      const list = got?.[name];
      assert.ok(
        Array.isArray(list),
        `${input} must return { stores, answers, args, initial }, each an array; ${name} is ${JSON.stringify(list)}`,
      );
      const [length, hash] = expect[name] ?? NONE;
      const shown = JSON.stringify(list).slice(0, 160);
      assert.equal(
        list.length,
        length,
        `${input}: your ${name} ${shown} has ${list.length} entries; ${length} are required`,
      );
      assert.equal(
        hashOf(list),
        hash,
        `${input}: your ${name} ${shown} has the right number of entries, but not the right ones, or not in increasing order without repeats`,
      );
    }
  };

  const lob = open('checks/fixtures/11/lob-mode1.json');

  await check(
    'bad questions are refused, and no question replays',
    async () => {
      for (const bad of [
        { address: 131072, size: 1, position: 1000 },
        { address: 131070, size: 4, position: 1000 },
        { address: 100, size: 0, position: 1000 },
        { address: 1.5, size: 1, position: 1000 },
        { address: 100, size: 1, position: -1 },
        { address: 100, size: 1, position: lob.index.end + 1 },
        { address: 100, size: 1, position: 2.5 },
      ]) {
        steps = 0;
        counting = true;
        let refused = false;
        try {
          valueSources(lob.index, bad);
        } catch (error) {
          if (notWritten(error)) throw error;
          refused = true;
        } finally {
          counting = false;
        }
        assert.ok(refused, `refuse ${JSON.stringify(bad)} with an error`);
        assert.equal(steps, 0, `${JSON.stringify(bad)}: run no instruction`);
      }
    },
  );

  await check(
    "the pointer g: one store, made from game_init's first argument",
    async () => {
      ask(lob, 78112, 4, 75418, {
        stores: [1, 'c9fc084e86491318'],
        args: [1, '27a10f48e5a7a83a'],
      });
    },
  );

  await check('four bytes written by four one-byte stores', async () => {
    ask(lob, 67472, 4, 75418, { stores: [4, 'e2c8d9ec76051ba2'] });
  });

  await check(
    'bytes no store has written, alone and beside written ones',
    async () => {
      ask(lob, 65536, 2, lob.index.end, {
        initial: [2, '687e06a67f22a205'],
      });
      ask(lob, 65822, 4, lob.index.end, {
        stores: [2, '125986aa806b06ae'],
        initial: [2, 'e5a188d5521f68ca'],
      });
    },
  );

  await check(
    "a position on a store's own tick includes it; one before does not",
    async () => {
      ask(lob, 67480, 4, 141172, {
        stores: [144, 'c8377738940e2075'],
        answers: [67, 'fd73b42c43144e55'],
      });
      ask(lob, 67480, 4, 141171, {
        stores: [142, '7ab58161b978b885'],
        answers: [66, '239e34969ba4cf9e'],
      });
    },
  );

  await check(
    'Lob II: a value made from an answer and an argument',
    async () => {
      const lob2 = open('checks/fixtures/11/lob2-mode1.json');
      ask(lob2, 70420, 4, lob2.index.end, {
        stores: [6, 'e157beb130d201c3'],
        answers: [1, 'bc51698fb4716a0d'],
        args: [1, '27a10f48e5a7a83a'],
      });
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
  join(attempt, 'vsources-receipt.json'),
  JSON.stringify({ ...evidence, help_used: help, pass, results }, null, 2) +
    '\n',
);
console.log(`Saved files and results in ${attempt}`);
process.exitCode = pass ? 0 : 1;
