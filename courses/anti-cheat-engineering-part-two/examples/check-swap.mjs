// Cases for the new application in lesson 16: swap and recoverSwaps in trade/swap.mjs.
// node examples/check-swap.mjs PROJECT --help-used "what helped"
// Every run first copies your trade and swap files (and report.md, when there is one) into
// a new folder under PROJECT/attempts/, then runs the file in PROJECT, and saves its results
// beside the copies; node lab.mjs status PROJECT lists each run. Each case checks what the
// world looks like after your functions run, crashing the store after every write of a swap
// and of a recovery, so this checker holds no swap of its own.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStore, Crash } from '../public/store.mjs';

const [folder, flag, help] = process.argv.slice(2);
if (!folder || flag !== '--help-used' || !help || process.argv.length !== 5) {
  console.error(
    'Usage: node examples/check-swap.mjs PROJECT --help-used "what helped"',
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

const files = ['trade/trade.mjs', 'trade/swap.mjs', 'report.md'];
const attempt = join(
  project,
  'attempts',
  `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-swap`,
);
mkdirSync(join(attempt, 'trade'), { recursive: true });
for (const file of files)
  if (existsSync(join(project, file)))
    writeFileSync(join(attempt, file), readFileSync(join(project, file)));
function saveReceipt(fields) {
  writeFileSync(
    join(attempt, 'swap-receipt.json'),
    JSON.stringify(
      {
        course: identity.course,
        unit16_start_route: identity.unit16_start_route ?? 'not recorded',
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
for (const file of ['trade/swap.mjs']) {
  try {
    loaded[file] = await import(pathToFileURL(join(project, file)).href);
  } catch (error) {
    const reason = String(error?.message ?? error).split('\n')[0];
    saveReceipt({ writes: 0, results: [], load_error: { file, reason } });
    console.log(`${file} could not be loaded, so no case ran: ${reason}`);
    console.log('0 cases pass.');
    console.log(saved());
    process.exitCode = 1;
    await new Promise((done) => process.stdout.write('', done));
    process.exit();
  }
}
const { swap, recoverSwaps } = loaded['trade/swap.mjs'];

// Ana swaps her sword for Bo's bow; Cy holds a cap and has nothing to do with it.
const WORLD = {
  'inv:ana': ['sword', 'lamp'],
  'inv:bo': ['bow'],
  'inv:cy': ['cap'],
  'coins:ana': 20,
  'coins:bo': 100,
  'coins:cy': 60,
};
const SWAP = { key: 'swap-1', a: 'ana', b: 'bo', itemA: 'sword', itemB: 'bow' };
const RIVAL = {
  key: 'swap-2',
  a: 'ana',
  b: 'cy',
  itemA: 'sword',
  itemB: 'cap',
};
const copy = (value) => JSON.parse(JSON.stringify(value));

// What a world looks like to a player: each inventory as a sorted list, and the coins.
function belongings(store) {
  const out = {};
  for (const key of store.keys('inv:')) out[key] = [...store.get(key)].sort();
  for (const key of store.keys('coins:')) out[key] = store.get(key);
  return JSON.stringify(out);
}
// The world after the swap happened exactly once.
function swapped(world, { a, b, itemA, itemB }) {
  const after = copy(world);
  after[`inv:${a}`] = after[`inv:${a}`].filter((id) => id !== itemA);
  after[`inv:${b}`] = after[`inv:${b}`].filter((id) => id !== itemB);
  after[`inv:${a}`].push(itemB);
  after[`inv:${b}`].push(itemA);
  return belongings(createStore(after));
}
const BEFORE = belongings(createStore(WORLD));
const AFTER = swapped(WORLD, SWAP);
const ITEMS = Object.entries(WORLD)
  .filter(([key]) => key.startsWith('inv:'))
  .flatMap(([, items]) => items);
function holders(store, item) {
  return store.keys('inv:').flatMap((key) =>
    store
      .get(key)
      .filter((id) => id === item)
      .map(() => key.slice(4)),
  );
}
function itemsOnce(store) {
  for (const item of ITEMS) {
    const h = holders(store, item);
    if (h.length !== 1)
      return `the ${item} is held ${h.length ? `${h.length} times (${h.join(', ')})` : 'by nobody'}`;
  }
  return null;
}
const sameReceipt = (answer, request) =>
  answer?.ok === true &&
  ['key', 'a', 'b', 'itemA', 'itemB'].every(
    (k) => answer.receipt?.[k] === request[k],
  );
const shown = (answer) => JSON.stringify(answer) ?? 'nothing';
const swapText = (r) =>
  `${r.key}: ${r.a} gives ${r.b} the ${r.itemA} for the ${r.itemB}`;

const results = [];
function attemptCase(name, run) {
  let problem;
  try {
    problem = run();
  } catch (error) {
    problem = `threw ${error.name}: ${error.message.split('\n')[0]}`;
  }
  results.push({ name, pass: !problem, detail: problem ?? '' });
  console.log(
    `${problem ? 'FAIL' : 'PASS'} ${name}${problem ? `\n     ${problem}` : ''}`,
  );
}

// The run with no crash: how many writes a swap makes.
let writes = 0;
attemptCase('a swap with no crash', () => {
  const store = createStore(WORLD);
  const answer = swap(store, copy(SWAP));
  writes = store.writes;
  if (!sameReceipt(answer, SWAP))
    return `${swapText(SWAP)} answered ${shown(answer)}, not { ok: true } with the receipt { key, a, b, itemA, itemB }`;
  if (belongings(store) !== AFTER)
    return `after ${swapText(SWAP)} the inventories are ${belongings(store)}, not ${AFTER}`;
  if (writes < 1) return 'the swap wrote nothing';
});

attemptCase('a request sent again gets its receipt and writes nothing', () => {
  const store = createStore(WORLD);
  swap(store, copy(SWAP));
  const n = store.writes;
  const again = swap(store, copy(SWAP));
  if (!sameReceipt(again, SWAP))
    return `the same request sent again answered ${shown(again)}, not the receipt`;
  if (store.writes !== n)
    return `the same request sent again made ${store.writes - n} writes`;
});

attemptCase('refusals write nothing', () => {
  const cases = [
    [{ ...SWAP, b: 'ana', itemB: 'lamp' }, 'self'],
    [{ ...SWAP, itemA: 'cap' }, 'missing'],
    [{ ...SWAP, itemB: 'sword' }, 'missing'],
  ];
  for (const [request, reason] of cases) {
    const store = createStore(WORLD);
    const answer = swap(store, copy(request));
    if (answer?.ok !== false || answer.reason !== reason)
      return `${swapText(request)} answered ${shown(answer)}, not { ok: false, reason: '${reason}' }`;
    if (store.writes)
      return `${swapText(request)} was refused but made ${store.writes} writes`;
  }
  const store = createStore(WORLD);
  swap(store, copy(SWAP));
  const n = store.writes;
  const other = { ...SWAP, itemB: 'lamp' };
  const answer = swap(store, copy(other));
  if (answer?.ok !== false || answer.reason !== 'conflict')
    return `after ${swapText(SWAP)}, the same key with another body (${swapText(other)}) answered ${shown(answer)}, not { ok: false, reason: 'conflict' }`;
  if (store.writes !== n)
    return `the conflicting request made ${store.writes - n} writes`;
});

// A crash after write g of the swap, a restart and recoverSwaps (crashing it after write h of
// its own, then restarting and recovering again, when h is given), then the retry and the
// rival swap of the same sword to Cy.
function crashAt(g, h = null) {
  const store = createStore(WORLD);
  store.crashAfter(g);
  try {
    swap(store, copy(SWAP));
    return `a crash after write ${g}: your swap caught the Crash and went on, but a crashed server cannot answer`;
  } catch (error) {
    if (!(error instanceof Crash)) throw error;
  }
  store.restart();
  const where = `a crash after write ${g} of the swap${h ? ` and after write ${h} of recoverSwaps` : ''}`;
  if (h) {
    // When recovery makes fewer than h writes, no crash comes, and the checks below run on
    // what it left.
    store.crashAfter(h);
    try {
      recoverSwaps(store);
    } catch (error) {
      if (!(error instanceof Crash)) throw error;
    }
    store.restart();
  }
  recoverSwaps(store);
  const broken = itemsOnce(store);
  if (broken) return `after ${where} and recovery, ${broken}`;
  if (![BEFORE, AFTER].includes(belongings(store)))
    return `after ${where} and recovery, the swap is half made: ${belongings(store)}`;
  const retry = swap(store, copy(SWAP));
  if (!sameReceipt(retry, SWAP))
    return `after ${where}, recovery and the retry, the retry answered ${shown(retry)}, not the receipt`;
  if (belongings(store) !== AFTER)
    return `after ${where}, recovery and the retry, the swap has not happened exactly once: ${belongings(store)}`;
  const rival = swap(store, copy(RIVAL));
  if (rival?.ok !== false || rival.reason !== 'missing')
    return `after ${where}, recovery and the retry, ${swapText(RIVAL)} answered ${shown(rival)}, not missing: the sword is now ${holders(store, 'sword').join(', ')}'s`;
  return null;
}

attemptCase(
  'a crash after every write of the swap, then recovery and the retry',
  () => {
    if (!writes)
      return 'the swap with no crash did not run, so there is nothing to crash';
    for (let g = 1; g <= writes; g++) {
      const problem = crashAt(g);
      if (problem) return problem;
    }
  },
);

attemptCase('a crash during recovery, then recovery again', () => {
  if (!writes)
    return 'the swap with no crash did not run, so there is nothing to crash';
  for (let g = 1; g <= writes; g++)
    for (let h = 1; h <= writes; h++) {
      const problem = crashAt(g, h);
      if (problem) return problem;
    }
});

const passed = results.filter((r) => r.pass).length;
saveReceipt({ writes, results });
console.log(
  `${passed} of ${results.length} cases pass${writes ? `; your swap makes ${writes} writes, so ${writes} crash points` : ''}.`,
);
console.log(saved());
process.exitCode = passed === results.length ? 0 : 1;
