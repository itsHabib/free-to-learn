// Cases for the new application in lesson 15: judgeUnmoved in courier/moved.mjs.
// node examples/check-moved.mjs PROJECT --help-used "what helped"
// Every run first copies your rewind and moved files (and report.md, when there is one)
// into a new folder under PROJECT/attempts/, then runs the files in PROJECT, and saves its
// results beside the copies; node lab.mjs status PROJECT lists each run. Each case is a
// small ring with the verdict the rule gives on it written out by hand, so this checker
// holds no judgeUnmoved of its own. When every case passes it also runs lesson 15's sweep
// sessions at a few windows with your judgeInteract and with your judgeUnmoved.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createHistory,
  recordPosition,
  runCourier,
  RANGE,
} from '../public/courier.mjs';

const [folder, flag, help] = process.argv.slice(2);
if (!folder || flag !== '--help-used' || !help || process.argv.length !== 5) {
  console.error(
    'Usage: node examples/check-moved.mjs PROJECT --help-used "what helped"',
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

const files = ['courier/rewind.mjs', 'courier/moved.mjs', 'report.md'];
const attempt = join(
  project,
  'attempts',
  `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-moved`,
);
mkdirSync(join(attempt, 'courier'), { recursive: true });
for (const file of files)
  if (existsSync(join(project, file)))
    writeFileSync(join(attempt, file), readFileSync(join(project, file)));
function saveReceipt(fields) {
  writeFileSync(
    join(attempt, 'moved-receipt.json'),
    JSON.stringify(
      {
        course: identity.course,
        unit15_start_route: identity.unit15_start_route ?? 'not recorded',
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
for (const file of ['courier/rewind.mjs', 'courier/moved.mjs']) {
  try {
    loaded[file] = await import(pathToFileURL(join(project, file)).href);
  } catch (error) {
    const reason = String(error?.message ?? error).split('\n')[0];
    saveReceipt({ sweep: null, results: [], load_error: { file, reason } });
    console.log(`${file} could not be loaded, so no case ran: ${reason}`);
    console.log('0 cases pass.');
    console.log(saved());
    process.exitCode = 1;
    await new Promise((done) => process.stdout.write('', done));
    process.exit();
  }
}
const rewind = loaded['courier/rewind.mjs'];
const { judgeUnmoved } = loaded['courier/moved.mjs'];

// Each case: where the courier stood at the end of each tick the ring holds ({ tick: [x, y] }),
// the judge's arguments, and the verdict the rule gives. The core is at (2000, 1000), the
// range 250 mm, now tick 100.
const TARGET = { x: 2000, y: 1000 };
const CASES = [
  {
    name: 'a press judged at now, in range',
    stood: { 99: [1750, 1000], 100: [2000, 1000] },
    args: { seen: 100, window: 5, rtt: 4 },
    want: { accept: true, at: 100, reason: 'ok' },
  },
  {
    name: 'rewound three ticks; the courier has not moved since',
    stood: { 97: [2000, 1000], 98: [2000, 1000], 99: [2000, 1000] },
    args: { seen: 97, window: 5, rtt: 4 },
    now: [2000, 1000],
    want: { accept: true, at: 97, reason: 'ok' },
  },
  {
    name: 'rewound three ticks; the courier has moved exactly one step since',
    stood: { 97: [2000, 1000], 98: [2250, 1000], 99: [2250, 1000] },
    args: { seen: 97, window: 5, rtt: 4 },
    now: [2250, 1000],
    want: { accept: true, at: 97, reason: 'ok' },
  },
  {
    name: 'rewound three ticks; the courier has moved two steps since',
    stood: { 97: [2000, 1000], 98: [2250, 1000], 99: [2500, 1000] },
    args: { seen: 97, window: 5, rtt: 4 },
    now: [2500, 1000],
    want: { accept: false, at: 97, reason: 'moved' },
  },
  {
    name: 'rewound four ticks; the courier walked two steps away and back',
    stood: {
      96: [2000, 1000],
      97: [2250, 1000],
      98: [2500, 1000],
      99: [2250, 1000],
    },
    args: { seen: 96, window: 6, rtt: 4 },
    now: [2000, 1000],
    want: { accept: true, at: 96, reason: 'ok' },
  },
  {
    name: 'rewound three ticks; the courier has moved two steps north since',
    stood: { 97: [2000, 1000], 98: [2000, 750], 99: [2000, 500] },
    args: { seen: 97, window: 5, rtt: 4 },
    now: [2000, 500],
    want: { accept: false, at: 97, reason: 'moved' },
  },
  {
    name: 'rewound to a tick out of range; it has moved far since',
    stood: { 97: [2500, 1000], 98: [2250, 1000], 99: [2000, 1000] },
    args: { seen: 97, window: 5, rtt: 4 },
    now: [1750, 1000],
    want: { accept: false, at: 97, reason: 'range' },
  },
  {
    name: 'the ring no longer holds the rewound tick, so the press is judged at now',
    stood: { 99: [1750, 1000] },
    args: { seen: 97, window: 5, rtt: 4 },
    now: [2000, 1000],
    want: { accept: true, at: 100, reason: 'ok' },
  },
  {
    name: 'a press in the cooldown, where the courier has moved two steps',
    stood: { 97: [2000, 1000], 98: [2250, 1000], 99: [2500, 1000] },
    args: { seen: 97, window: 5, rtt: 4, readyAt: 102 },
    now: [2500, 1000],
    want: { accept: false, at: 100, reason: 'cooldown' },
  },
  {
    name: 'a claim to have seen a tick after now',
    stood: { 99: [2000, 1000], 100: [2000, 1000] },
    args: { seen: 101, window: 5, rtt: 4 },
    want: { accept: false, at: 100, reason: 'future' },
  },
];

function argsOf(c) {
  const history = createHistory();
  const stood = { ...c.stood, ...(c.now ? { 100: c.now } : {}) };
  for (const [tick, [x, y]] of Object.entries(stood))
    recordPosition(history, Number(tick), x, y);
  return {
    seen: c.args.seen,
    now: 100,
    window: c.args.window,
    rtt: c.args.rtt,
    history,
    target: { ...TARGET },
    range: RANGE,
    readyAt: c.args.readyAt ?? 0,
    positionAt: rewind.positionAt,
  };
}
const where = (c) =>
  Object.entries({ ...c.stood, ...(c.now ? { 100: c.now } : {}) })
    .map(([tick, [x, y]]) => `${tick} (${x}, ${y})`)
    .join(', ');

const results = [];
for (const c of CASES) {
  let problem = null;
  try {
    const got = judgeUnmoved(argsOf(c));
    const same =
      got &&
      got.accept === c.want.accept &&
      got.at === c.want.at &&
      got.reason === c.want.reason;
    if (!same)
      problem = `seen ${c.args.seen}, now 100, window ${c.args.window}, rtt ${c.args.rtt}${c.args.readyAt ? `, readyAt ${c.args.readyAt}` : ''}; the courier stood at tick ${where(c)}; the core at (2000, 1000). Your result: ${JSON.stringify(got)}; the rule gives ${JSON.stringify(c.want)}`;
  } catch (error) {
    problem = `threw: ${error.message.split('\n')[0]}`;
  }
  results.push({ name: c.name, pass: !problem, detail: problem ?? '' });
  console.log(
    `${problem ? 'FAIL' : 'PASS'} ${c.name}${problem ? `\n     ${problem}` : ''}`,
  );
}
const passed = results.filter((r) => r.pass).length;

// Lesson 15's sweep sessions, at a few windows, with each judge.
let sweep = null;
if (passed === results.length) {
  try {
    const row = (window, judge) => {
      const run = runCourier({
        seed: 1,
        sessions: 100,
        window,
        judge,
        measureRtt: rewind.measureRtt,
        positionAt: rewind.positionAt,
      });
      return rewind.tally(run.outcomes);
    };
    const pct = (x) => `${(100 * x).toFixed(2)}%`;
    sweep = [];
    console.log(
      "Lesson 15's sweep sessions (seed 1, 100 sessions per model), judgeInteract against judgeUnmoved:",
    );
    console.log(
      `${'window'.padStart(6)}  ${'honest refused'.padStart(19)}  ${'slow-pong lies accepted'.padStart(25)}  ${'naive lies accepted'.padStart(21)}`,
    );
    for (const window of [0, 1, 2, 3, 7, 8]) {
      const a = row(window, rewind.judgeInteract);
      const b = row(window, judgeUnmoved);
      sweep.push({ window, judgeInteract: a, judgeUnmoved: b });
      console.log(
        `${String(window).padStart(6)}  ${`${pct(a.legitRate)} / ${pct(b.legitRate)}`.padStart(19)}  ${`${a.slowCheats} / ${b.slowCheats}`.padStart(25)}  ${`${a.naiveCheats} / ${b.naiveCheats}`.padStart(21)}`,
      );
    }
    console.log(
      'Each cell: judgeInteract / judgeUnmoved. honest refused: honest presses refused although in range at seen, of all honest presses; lies accepted: presses accepted while the courier was out of range at now.',
    );
  } catch (error) {
    sweep = null;
    console.log(
      `(No sweep comparison: your functions did not run on the sessions: ${error.message.split('\n')[0]})`,
    );
  }
}

saveReceipt({ results, sweep });
console.log(`${passed} of ${results.length} cases pass.`);
console.log(saved());
process.exitCode = passed === results.length ? 0 : 1;
