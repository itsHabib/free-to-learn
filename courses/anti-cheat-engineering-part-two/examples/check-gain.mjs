// Cases for the new application in lesson 17: gainBudget in capstone/gain.mjs.
// node examples/check-gain.mjs PROJECT --help-used "what helped"
// Every run first copies your gain file (and report.md, when there is one) into a new folder
// under PROJECT/attempts/, then runs the file in PROJECT, and saves its results beside the
// copies; node lab.mjs status PROJECT lists each run. Each case is a courier's deliveries with
// the answer the contract gives written out by hand, so this checker holds no gainBudget of
// its own. When every case passes it also plays the scoreboard's courier sessions at every
// window of lesson 15's table with your rewind functions, and prints your gainBudget there.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLoader } from '../checks/harness.mjs';
import * as sb from '../checks/scoreboard.mjs';
import { SEEDS, DEFAULTS } from '../labcmds/17.mjs';

const [folder, flag, help] = process.argv.slice(2);
if (!folder || flag !== '--help-used' || !help || process.argv.length !== 5) {
  console.error(
    'Usage: node examples/check-gain.mjs PROJECT --help-used "what helped"',
  );
  process.exit(2);
}
const project = resolve(folder);
let identity = null;
try {
  identity = JSON.parse(readFileSync(join(project, 'PROJECT.json'), 'utf8'));
} catch {
  // reported just below
}
if (identity?.course !== 'anti-cheat-engineering-part-two') {
  console.error(`${folder} is not a project of this course.`);
  process.exit(2);
}

const files = ['capstone/gain.mjs', 'report.md'];
const attempt = join(
  project,
  'attempts',
  `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-gain`,
);
mkdirSync(join(attempt, 'capstone'), { recursive: true });
for (const file of files)
  if (existsSync(join(project, file)))
    writeFileSync(join(attempt, file), readFileSync(join(project, file)));
function saveReceipt(fields) {
  writeFileSync(
    join(attempt, 'gain-receipt.json'),
    JSON.stringify(
      {
        course: identity.course,
        unit17_start_route: identity.unit17_start_route ?? 'not recorded',
        help_used: help,
        ...fields,
        at: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
}
const saved = () =>
  `Saved this attempt in ${relative(process.cwd(), attempt) || '.'}.`;

// A file that cannot be loaded (it throws as it loads, or imports something that is not
// there) is a failed attempt like any other: it is saved with a receipt that status lists.
const loaded = {};
for (const file of ['capstone/gain.mjs']) {
  try {
    loaded[file] = await import(pathToFileURL(join(project, file)).href);
  } catch (error) {
    const reason = String(error?.message ?? error).split('\n')[0];
    saveReceipt({ table: null, results: [], load_error: { file, reason } });
    console.log(`${file} could not be loaded, so no case ran: ${reason}`);
    console.log('0 cases pass.');
    console.log(saved());
    process.exitCode = 1;
    await new Promise((done) => process.stdout.write('', done));
    process.exit();
  }
}
const { gainBudget } = loaded['capstone/gain.mjs'];

// Each case: the deliveries a session of each client, a limit, and the answer.
const CASES = [
  {
    name: 'the faker delivers a quarter more, under the limit',
    deliveries: { honest: 40, naive: 41, slow: 50 },
    limit: 0.3,
    want: { gain: 0.25, pass: true },
  },
  {
    name: 'the faker delivers half as much again, over the limit',
    deliveries: { honest: 40, naive: 30, slow: 60 },
    limit: 0.3,
    want: { gain: 0.5, pass: false },
  },
  {
    name: 'the gain is measured against the honest courier, not the naive faker',
    deliveries: { honest: 50, naive: 40, slow: 55 },
    limit: 0.2,
    want: { gain: 0.1, pass: true },
  },
  {
    name: 'a gain exactly at the limit passes',
    deliveries: { honest: 40, naive: 41, slow: 50 },
    limit: 0.25,
    want: { gain: 0.25, pass: true },
  },
  {
    name: 'the faker delivers less than an honest courier',
    deliveries: { honest: 40, naive: 41, slow: 30 },
    limit: 0,
    want: { gain: -0.25, pass: true },
  },
  {
    name: 'the honest courier delivers nothing',
    deliveries: { honest: 0, naive: 3, slow: 7 },
    limit: 1,
    want: { gain: null, pass: false },
  },
];
const close = (a, b) =>
  a === b ||
  (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);

const results = [];
for (const c of CASES) {
  let problem = null;
  try {
    const courier = { deliveries: { ...c.deliveries } };
    const got = gainBudget(courier, c.limit);
    if (!got || !close(got.gain, c.want.gain) || got.pass !== c.want.pass)
      problem = `deliveries a session ${JSON.stringify(c.deliveries)}, limit ${c.limit}: your result ${JSON.stringify(got)}; the contract gives ${JSON.stringify(c.want)}`;
    else if (
      JSON.stringify(courier.deliveries) !== JSON.stringify(c.deliveries)
    )
      problem = 'your function changed the courier it was given';
  } catch (error) {
    problem = `threw: ${error.message.split('\n')[0]}`;
  }
  results.push({ name: c.name, pass: !problem, detail: problem ?? '' });
  console.log(
    `${problem ? 'FAIL' : 'PASS'} ${c.name}${problem ? `\n     ${problem}` : ''}`,
  );
}
const passed = results.filter((r) => r.pass).length;

// The scoreboard's courier sessions at every window of lesson 15's table.
const LIMIT = 0.2;
const WINDOWS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12];
let table = null;
if (passed === results.length) {
  try {
    const rewind = await sb.loadRewind(makeLoader(project));
    table = [];
    console.log(
      `The scoreboard's courier sessions (runCourier seed ${SEEDS.courier}, ${DEFAULTS.courier} per model), your rewind functions, gain limit ${LIMIT}:`,
    );
    console.log(
      `${'window'.padStart(6)}  ${'honest refused'.padStart(14)}  ${'deliveries h / s'.padStart(16)}  ${'gain'.padStart(7)}  gainBudget`,
    );
    for (const window of WINDOWS) {
      const courier = sb.courierAt({
        seed: SEEDS.courier,
        sessions: DEFAULTS.courier,
        window,
        rewind,
      });
      const { honest, slow } = courier.deliveries;
      const verdict = gainBudget(courier, LIMIT);
      const refused = courier.honest
        ? courier.honestRefused / courier.honest
        : 0;
      table.push({ window, refused, deliveries: courier.deliveries, verdict });
      console.log(
        `${String(window).padStart(6)}  ${`${(100 * refused).toFixed(2)}%`.padStart(14)}  ${`${honest.toFixed(1)} / ${slow.toFixed(1)}`.padStart(16)}  ${(verdict.gain === null ? '-' : verdict.gain.toFixed(3)).padStart(7)}  ${verdict.pass ? 'pass' : 'miss'}`,
      );
    }
    console.log(
      `honest refused: honest presses refused although in range at seen (the scoreboard's budget allows at most ${(100 * sb.BUDGET.honestRefused).toFixed(0)}%); deliveries: mean a session, honest / slow-pong.`,
    );
  } catch (error) {
    table = null;
    console.log(
      `(No table: your rewind functions did not run on the sessions: ${error.message.split('\n')[0]})`,
    );
  }
}

saveReceipt({ results, table });
console.log(`${passed} of ${results.length} cases pass.`);
console.log(saved());
process.exitCode = passed === results.length ? 0 : 1;
