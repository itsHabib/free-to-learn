// Cases for the new application in lesson 14: chooseThresholdByKind in detect/kind-budget.mjs.
// node examples/check-kind-budget.mjs PROJECT --help-used "what helped"
// Every run first copies your kind-budget file (and report.md, when there is one) into a
// new folder under PROJECT/attempts/, then runs the file in PROJECT, and saves its results
// beside the copies; node lab.mjs status PROJECT lists each run. Each case checks what your
// function returns against the definition (every kind within the budget, and no smaller
// score that would also do), so this checker holds no chooseThresholdByKind of its own.
// When every case passes it also shows, on the dev split only, what the rule does with your
// own detector.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeCorpus } from '../public/corpus.mjs';
import { makeRandom } from '../public/stats.mjs';

const [folder, flag, help] = process.argv.slice(2);
if (!folder || flag !== '--help-used' || !help || process.argv.length !== 5) {
  console.error(
    'Usage: node examples/check-kind-budget.mjs PROJECT --help-used "what helped"',
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

const files = ['detect/kind-budget.mjs', 'report.md'];
const attempt = join(
  project,
  'attempts',
  `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-kind-budget`,
);
mkdirSync(join(attempt, 'detect'), { recursive: true });
for (const file of files)
  if (existsSync(join(project, file)))
    writeFileSync(join(attempt, file), readFileSync(join(project, file)));
const load = (file) => import(pathToFileURL(join(project, file)).href);
function saveReceipt(fields) {
  writeFileSync(
    join(attempt, 'kind-budget-receipt.json'),
    JSON.stringify(
      {
        course: identity.course,
        unit14_start_route: identity.unit14_start_route ?? 'not recorded',
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
let chooseThresholdByKind;
try {
  ({ chooseThresholdByKind } = await load('detect/kind-budget.mjs'));
} catch (error) {
  const file = 'detect/kind-budget.mjs';
  const reason = String(error?.message ?? error).split('\n')[0];
  saveReceipt({ results: [], dev: null, load_error: { file, reason } });
  console.log(`${file} could not be loaded, so no case ran: ${reason}`);
  console.log('0 cases pass.');
  console.log(saved());
  process.exitCode = 1;
  await new Promise((done) => process.stdout.write('', done));
  process.exit();
}

// Lists of { kind, score }, each with a budget: small ones written out, where some kinds are
// small, some scores tie, and in some the smallest threshold is a score of another kind;
// then generated ones (below).
const copy = (legal) => legal.map((x) => ({ ...x }));
const of = (kind, scores) => scores.map((score) => ({ kind, score }));
const LISTS = [
  {
    budget: 0.25,
    legal: [
      ...of('expert', [9, 8, 2, 1]),
      ...of('skilled', Array(16).fill(0.5)),
    ],
  },
  { budget: 0.5, legal: [...of('a', [1, 5]), ...of('b', [3, 0])] },
  { budget: 0.25, legal: [...of('x', [1, 6, 6, 7]), ...of('y', [6, 2, 3, 4])] },
  {
    budget: 0.2,
    legal: [
      ...of('novice', [3, 1, 4, 1, 5]),
      ...of('expert', [9, 2, 6, 5, 3, 5, 8, 9, 7, 4]),
    ],
  },
  { budget: 0, legal: [...of('a', [1, 2]), ...of('b', [3])] },
  { budget: 0.5, legal: [] },
];

// Generated lists at the course's budget, with kinds large enough that the budget allows a
// few flags in each: [kind, how many scores, how far its scores sit above the novices'].
// Each score is 0.01 times a whole number, drawn from makeRandom(seed).normal() in
// public/stats.mjs, so the same seed always gives the same list.
function generated(seed, kinds) {
  const random = makeRandom(seed);
  const legal = [];
  for (const [kind, n, shift] of kinds)
    for (let i = 0; i < n; i++)
      legal.push({
        kind,
        score: Math.round(100 * (shift + random.normal())) / 100,
      });
  return legal;
}
const LARGE = [
  ['novice', 1500, 0],
  ['skilled', 2500, 0.5],
  ['expert', 1000, 1.5],
];
for (const seed of [11, 38])
  LISTS.push({
    name: `the generated list of seed ${seed} (novice 1500, skilled 2500, expert 1000 scores)`,
    budget: 0.002,
    legal: generated(seed, LARGE),
  });
// One kind too small for the budget to allow it a single flag, holding the highest scores.
LISTS.push({
  name: 'the generated list of seed 11 with a fourth kind, pro, of 100 scores above all the others',
  budget: 0.002,
  legal: generated(11, [...LARGE, ['pro', 100, 8]]),
});

// At threshold t: for each kind, how many of its scores are at or above t, of how many.
function shares(legal, t) {
  const byKind = new Map();
  for (const { kind, score } of legal) {
    const k = byKind.get(kind) ?? { at: 0, n: 0 };
    k.n++;
    if (score >= t) k.at++;
    byKind.set(kind, k);
  }
  return byKind;
}
const over = (legal, t, budget) =>
  [...shares(legal, t)].filter(([, k]) => k.at / k.n > budget);
// "expert scores 9, 8, 2, 1; skilled scores 0.5 (16 times); budget 0.25"
function said(legal, budget, name) {
  if (name) return `on ${name}, budget ${budget}, your function`;
  const kinds = [...new Set(legal.map((x) => x.kind))].map((kind) => {
    const scores = legal.filter((x) => x.kind === kind).map((x) => x.score);
    const same = scores.every((v) => v === scores[0]) && scores.length > 2;
    return `${kind} scores ${same ? `${scores[0]} (${scores.length} times)` : scores.join(', ')}`;
  });
  return `on ${kinds.length ? kinds.join('; ') : 'an empty list'}, budget ${budget}, your function`;
}

const results = [];
function report(name, problem) {
  results.push({ name, pass: !problem, detail: problem ?? '' });
  console.log(
    `${problem ? 'FAIL' : 'PASS'} ${name}${problem ? `\n     ${problem}` : ''}`,
  );
}
function attemptCase(name, run) {
  try {
    report(name, run());
  } catch (error) {
    report(name, `threw: ${error.message}`);
  }
}

attemptCase('returns one of the scores, or Infinity', () => {
  for (const { legal, budget, name } of LISTS) {
    const t = chooseThresholdByKind(copy(legal), budget);
    if (t !== Infinity && !legal.some((x) => x.score === t))
      return `${said(legal, budget, name)} returned ${JSON.stringify(t)}, which is not one of the scores`;
  }
});

attemptCase('at the threshold, every kind is within the budget', () => {
  for (const { legal, budget, name } of LISTS) {
    const t = chooseThresholdByKind(copy(legal), budget);
    const bad = over(legal, t, budget);
    if (bad.length)
      return `${said(legal, budget, name)} returned ${t}; at ${t}, ${bad.map(([kind, k]) => `${k.at} of ${k.n} ${kind} scores`).join(' and ')} are at or above it, more than ${budget} of the kind`;
  }
});

attemptCase('no smaller score keeps every kind within the budget', () => {
  for (const { legal, budget, name } of LISTS) {
    const t = chooseThresholdByKind(copy(legal), budget);
    // A higher threshold never flags more, so only the largest score below t need be tried.
    const below = legal.map((x) => x.score).filter((s) => s < t);
    const next = below.length ? Math.max(...below) : null;
    if (next !== null && !over(legal, next, budget).length)
      return `${said(legal, budget, name)} returned ${t}, but ${next} also keeps every kind within ${budget}, and it is smaller`;
  }
});

attemptCase('does not change the list it is given', () => {
  for (const { legal, budget, name } of LISTS) {
    const given = copy(legal);
    chooseThresholdByKind(given, budget);
    if (JSON.stringify(given) !== JSON.stringify(legal))
      return `${said(legal, budget, name)} changed its list`;
  }
});

const passed = results.filter((r) => r.pass).length;

// The dev split only, with your own detector as it stands: what the rule changes.
let dev = null;
if (passed === results.length) {
  try {
    const settings = JSON.parse(
      readFileSync(join(project, 'detect', 'settings.json'), 'utf8'),
    );
    const { features } = await load('detect/features.mjs');
    const { score } = await load('detect/detector.mjs');
    if (typeof settings.threshold !== 'number')
      throw new Error('detect/settings.json has no threshold yet');
    const scored = makeCorpus({ split: 'dev' }).map((c) => ({
      kind: c.kind,
      label: c.label,
      score: score(
        features({ record: { inputs: c.record.inputs }, rounds: c.rounds }),
        settings,
      ),
    }));
    const legal = scored.filter((x) => x.label === 'legal');
    const cheats = scored.filter((x) => x.label === 'cheat');
    const byKind = chooseThresholdByKind(
      legal.map(({ kind, score: s }) => ({ kind, score: s })),
      settings.budget,
    );
    const line = (flag) =>
      `${legal.filter((x) => flag(x.score)).length} legal and ${cheats.filter((x) => flag(x.score)).length} of ${cheats.length} searcher sessions flagged`;
    // A threshold need not be one of the legal scores: anything above the highest of them
    // flags no legal session at all.
    const highest = Math.max(...legal.map((x) => x.score));
    dev = {
      threshold: settings.threshold,
      byKind: String(byKind),
      highestLegal: highest,
      atThreshold: line((s) => s >= settings.threshold),
      atByKind: line((s) => s >= byKind),
      aboveHighest: line((s) => s > highest),
    };
    console.log(
      `On the dev split, with your detector and budget ${settings.budget}:`,
    );
    console.log(`  your threshold ${settings.threshold}: ${dev.atThreshold}`);
    console.log(`  chooseThresholdByKind ${byKind}: ${dev.atByKind}`);
    console.log(
      `  any threshold above your highest legal score, ${highest}: ${dev.aboveHighest}`,
    );
  } catch (error) {
    console.log(
      `(No dev split comparison: your detector did not run as it stands: ${error.message.split('\n')[0]})`,
    );
  }
}

saveReceipt({ results, dev });
console.log(`${passed} of ${results.length} cases pass.`);
console.log(saved());
process.exitCode = passed === results.length ? 0 : 1;
