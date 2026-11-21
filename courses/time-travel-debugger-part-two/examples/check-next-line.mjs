// Acceptance cases for lesson 12's new application; no nextLine is supplied.
// Every invocation copies the submitted files into a new attempt folder first,
// then checks that copy in a separate process with a time limit.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { loadRecording, trace } from '../checks/trace.mjs';
// Plain reads and writes, not fs.copyFileSync: copying file metadata can fail
// with EPERM where the project folder belongs to another user.
const copyFileSync = (from, to) => writeFileSync(to, readFileSync(from));

const CASES = 6;
// Moving forward n instructions takes n; the rest is room for one restore and
// a short replay from a snapshot.
const SLACK = 2000;
const FILES = [
  'machine.mjs',
  'recorder.mjs',
  'debugger.mjs',
  'names.mjs',
  'next-line.mjs',
  'PROJECT.json',
];
const checkerPath = fileURLToPath(import.meta.url);
const promptPath = fileURLToPath(new URL('../lessons/12.md', import.meta.url));
const linesPath = fileURLToPath(new URL('../lines/lob.json', import.meta.url));
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
    format: 'ttd2-next-line-attempt-1',
    application: 'next-line',
    prompt: {
      file: 'lesson-12.md',
      sha256: digest(join(folder, 'lesson-12.md')),
    },
    checker: {
      file: 'check-next-line.mjs',
      sha256: digest(join(folder, 'check-next-line.mjs')),
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
    'Usage: node examples/check-next-line.mjs PROJECT --help-used "what helped"',
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
      `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-nline`,
    );
    mkdirSync(attempt, { recursive: true });
    for (const file of FILES)
      copyFileSync(join(project, file), join(attempt, file));
    if (existsSync(join(project, 'report.md')))
      copyFileSync(join(project, 'report.md'), join(attempt, 'report.md'));
    copyFileSync(promptPath, join(attempt, 'lesson-12.md'));
    copyFileSync(checkerPath, join(attempt, 'check-next-line.mjs'));
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
      readFileSync(join(attempt, 'nline-receipt.json'), 'utf8'),
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
        ? 'The check did not finish within 120 seconds; each step should run forward about as far as it moves, not replay the run.'
        : `Check process ended without a complete result: ${child.error?.message ?? child.signal ?? child.status}`;
    writeFileSync(
      join(attempt, 'nline-receipt.json'),
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
  String(error?.message).includes('nextLine: not written yet');
const check = async (name, run) => {
  try {
    await run();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = notWritten(error)
      ? 'nextLine is not written yet'
      : error.message;
    results.push({ name, pass: false, message });
    console.log(`FAIL ${name}: ${message}`);
  }
};

try {
  const load = (file) => import(pathToFileURL(join(attempt, file)).href);
  const { Machine } = await load('machine.mjs');
  const { Debugger } = await load('debugger.mjs');
  const { nextLine } = await load('next-line.mjs');
  assert.equal(
    typeof nextLine,
    'function',
    'Export nextLine(debugger, program, lines) from next-line.mjs',
  );
  const rows = JSON.parse(readFileSync(linesPath, 'utf8')).rows;
  const { recording, program } = loadRecording(
    'checks/fixtures/10/lob-m1.json',
  );

  // One pass over the recording on the submitted Machine, before any counting:
  // the frames after every instruction and the instruction run at every tick.
  const T = trace(Machine, program, recording);
  // The line of every instruction of every function: the last row at or before
  // its offset, 0 for a line-0 row or before the first row.
  const lineOf = new Map();
  for (const f of program.functions)
    lineOf.set(
      f.index,
      f.offsets.map((offset) => {
        let line = 0;
        for (const row of rows) {
          if (row.offset > offset) break;
          line = row.line;
        }
        return line;
      }),
    );
  // At position p: the frames in progress, and the line of what runs next.
  const depth = (p) => T.depth[p];
  const line = (p) => (p < T.end ? lineOf.get(T.func[p + 1])[T.at[p + 1]] : 0);
  // The first later position that has fewer frames, or the same number and a
  // line of its own that differs from the start's. null between calls.
  const expected = (p) => {
    if (depth(p) === 0) return null;
    for (let q = p + 1; q <= T.end; q++) {
      if (depth(q) < depth(p)) return q;
      if (depth(q) === depth(p) && line(q) !== 0 && line(q) !== line(p))
        return q;
    }
    return T.end;
  };
  // The most frames between two positions.
  const deepest = (p, q) => {
    let most = 0;
    for (let k = p + 1; k < q; k++) most = Math.max(most, depth(k));
    return most;
  };
  // The first position from `from` that `test(p, q)` accepts.
  const pick = (from, to, test) => {
    for (let p = from; p < to; p++) {
      if (depth(p) === 0) continue;
      const q = expected(p);
      if (test(p, q)) return p;
    }
    throw Error(
      'the check itself found no position to ask about (report this)',
    );
  };

  let counting = false;
  let steps = 0;
  const step = Machine.prototype.step;
  Machine.prototype.step = function (...args) {
    if (counting) steps++;
    return step.apply(this, args);
  };
  const d = new Debugger(program, recording);
  const describe = (p) =>
    `position ${p} (${depth(p)} frames, next: function ${T.func[p + 1]}, instruction ${T.at[p + 1]}, line ${line(p)})`;
  // Ask from `here` and compare with the scan of the pass above.
  const ask = (here) => {
    const want = expected(here);
    d.seek(here);
    steps = 0;
    counting = true;
    let got;
    try {
      got = nextLine(d, program, rows);
    } finally {
      counting = false;
    }
    const input = `nextLine at ${describe(here)}`;
    assert.equal(
      got,
      want,
      `${input} returned ${got}; the answer is ${describe(want)}`,
    );
    assert.equal(
      d.tick,
      want,
      `${input}: the debugger must stand at ${want}, not ${d.tick}`,
    );
    const budget = want - here + SLACK;
    assert.ok(
      steps <= budget,
      `${input} ran ${steps} instructions; it moves ${want - here}, so at most ${budget}`,
    );
    return got;
  };

  const game = T.callStart[60];
  const later = T.callStart[61];

  await check(
    'refused between calls and at the end, without moving or running anything',
    async () => {
      for (const here of [T.callStart[60], T.end]) {
        d.seek(here);
        steps = 0;
        counting = true;
        let refused = false;
        try {
          nextLine(d, program, rows);
        } catch (error) {
          if (notWritten(error)) throw error;
          refused = true;
        } finally {
          counting = false;
        }
        assert.ok(
          refused,
          `nextLine at position ${here}, between calls, must throw an error`,
        );
        assert.equal(d.tick, here, `position ${here}: do not move`);
        assert.equal(
          steps,
          0,
          `position ${here}: refuse before running anything`,
        );
      }
    },
  );

  await check('the next line of the same function', async () => {
    ask(
      pick(
        game,
        later,
        (p, q) =>
          depth(q) === depth(p) && deepest(p, q) <= depth(p) && q - p > 2,
      ),
    );
  });

  await check('a line that calls a function is stepped over', async () => {
    ask(
      pick(
        game,
        later,
        (p, q) => depth(q) === depth(p) && deepest(p, q) > depth(p),
      ),
    );
  });

  await check(
    'the last line of a function returns to the line that called it',
    async () => {
      ask(pick(game, later, (p, q) => depth(p) >= 2 && depth(q) < depth(p)));
    },
  );

  await check(
    'line-0 instructions, and a loop whose body is one line',
    async () => {
      // In game_init: a start on a line-0 instruction of its own frame, and the
      // start in its own frame that runs farthest before the line changes.
      const init = T.callStart[1];
      ask(pick(0, init, (p) => depth(p) === 1 && line(p) === 0));
      let far = null;
      for (let p = 1; p < init; p += 97)
        if (depth(p) === 1 && (!far || expected(p) - p > expected(far) - far))
          far = p;
      ask(far);
    },
  );

  await check('twenty lines in a row, through calls and returns', async () => {
    let here = pick(game, later, (p) => depth(p) === 2);
    for (let k = 0; k < 20 && depth(here) > 0; k++) here = ask(here);
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
  join(attempt, 'nline-receipt.json'),
  JSON.stringify({ ...evidence, help_used: help, pass, results }, null, 2) +
    '\n',
);
console.log(`Saved files and results in ${attempt}`);
process.exitCode = pass ? 0 : 1;
