// Unit 14: meet the limit, then detect. API.md, "Unit 14", is the contract these checks test.
// Your features are compared with the check's own computation of API.md's definitions on
// fixed sessions; chooseThreshold, count and precisionAt on crafted inputs; and your frozen
// detector on the dev split, on held-out-sized sessions of the check's own and on the two
// recordings. The check's held-out sessions come from seeds no lab command uses, so
// `node lab.mjs check` never reads the split that `node lab.mjs heldout` measures.
// Every session is generated inside the check from its seed (public/corpus.mjs), so a
// failure can be reproduced with the call it names.
// Your features are always called with a session's play alone, { record: { inputs }, rounds }:
// never its id, label, kind or seed. The counts the checks judge are made from those calls;
// your evaluate, which needs the labels to count, must make the same decisions.
import { makeCorpus, playCorpusSession, KINDS, DEFAULT_COUNTS } from '../public/corpus.mjs';
import { median, quantile, mean, sd, correlation, makeRandom } from '../public/stats.mjs';
import { fail, show, readJson, NOT_WRITTEN } from './harness.mjs';

export const title = 'Meet the limit, then detect';

const BUDGET = 0.002;           // one false flag in 500 legal sessions (API.md, detect/settings.json)
// At most this many of the check's 2,000 held-out legal sessions flagged. A threshold set as
// API.md says (the second-highest of 1,000 dev legal scores) leaves each fresh legal session
// a Beta(2, 999) chance of reaching it, so its false flags here are BetaBinomial(2000, 2, 999):
// 4 on average, more than 15 about once in 100 (more than 6, the old cap, about one time in 5).
const HELDOUT_FALSE_FLAGS = 15;
const HELDOUT_RECALL = 0.9;     // at least this share of its 200 held-out searcher sessions flagged
const HELDOUT_SEEDS = 24_000_000; // the check's held-out sessions: seed 24,000,000 + 100,000 × the kind's place + n
const DELAY_RECALL = 0.2;       // at least this share of the 60 sessions in recordings/delay.json flagged
const FEATURES = ['shots', 'hitRate', 'missMedian', 'fireMedian', 'fireSpread', 'inputsMedian', 'cadenceCV', 'missLag1'];
const COUNT_FIELDS = ['total', 'tp', 'fp', 'tn', 'fn', 'recall', 'falsePositiveRate', 'precision'];
const RATES = new Set(['recall', 'falsePositiveRate', 'precision']);

// Equal within a tolerance (absolute below 1, relative above), or both null.
const close = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && (a === b || Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)));
const sameValue = (a, b, tol) => (b === null ? a === null : close(a, b, tol));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ratio = (k, n) => (n ? k / n : null);
const grouped = (n) => Number(n).toLocaleString('en-US');

// What your features are given: a fresh copy of the session's play, its record.inputs and
// rounds, and nothing else (API.md, features). Every call to your features goes through this.
const playOf = (c) => ({ record: { inputs: structuredClone(c.record.inputs) }, rounds: structuredClone(c.rounds) });
const PLAY = '{ record: { inputs }, rounds }';

// Calls your function. An error it throws is passed on with what it was given, so the failure
// says which input broke it (and the line in your file, as for any error). A starter's
// "not written yet" passes through unchanged.
function call(what, f) {
  try {
    return f();
  } catch (error) {
    if (String(error?.message ?? '').includes(NOT_WRITTEN)) throw error;
    if (error instanceof Error) { error.message = `${what}: ${error.message}`; throw error; }
    throw new Error(`${what}: it threw ${show(error, 80)}`);
  }
}

// ------------------------------------------------------------------ the features, by API.md

// The latest round whose start is at or before the tick.
function roundAt(rounds, tick) {
  let found = null;
  for (const r of rounds) if (r.start <= tick && (found === null || r.start >= found.start)) found = r;
  return found ? found.round : null;
}

// API.md's eight features of one case, and a note on how each was reached (for messages).
function expectedFeatures({ record, rounds }) {
  const shotRounds = rounds.filter((r) => r.shot !== null);
  const shots = shotRounds.length;
  const hits = shotRounds.filter((r) => r.result === 'hit').length;
  const fireTimes = shotRounds.map((r) => r.shot.tick - r.start);
  const misses = shotRounds.map((r) => Math.abs(r.miss));
  const inputs = shotRounds.map((r) => r.inputs);

  const gaps = [];
  let previous = null;
  for (const input of record.inputs) {
    const round = roundAt(rounds, input.tick);
    if (previous && previous.round === round) gaps.push(input.tick - previous.tick);
    previous = { round, tick: input.tick };
  }
  const gapMean = mean(gaps);
  const cadenceCV = gaps.length < 5 || gapMean === 0 ? null : sd(gaps) / gapMean;

  const byNumber = new Map(rounds.map((r) => [r.round, r]));
  const xs = [], ys = [];
  for (const a of rounds) {
    const b = byNumber.get(a.round + 1);
    if (a.shot && b && b.shot) { xs.push(a.miss); ys.push(b.miss); }
  }
  const missLag1 = xs.length < 4 ? null : correlation(xs, ys);
  const q75 = quantile(fireTimes, 0.75), q25 = quantile(fireTimes, 0.25);

  return {
    values: {
      shots,
      hitRate: shots ? hits / shots : null,
      missMedian: median(misses),
      fireMedian: median(fireTimes),
      fireSpread: shots ? q75 - q25 : null,
      inputsMedian: median(inputs),
      cadenceCV,
      missLag1,
    },
    notes: {
      shots: `${shots} of the ${rounds.length} rounds have a shot`,
      hitRate: `${plural(hits, 'hit')} in ${plural(shots, 'shot round')}`,
      missMedian: shots ? `abs(miss) over the shot rounds: ${show(misses, 120)}` : 'no shot rounds',
      fireMedian: shots ? `fire times, shot.tick - start: ${show(fireTimes, 120)}` : 'no shot rounds',
      fireSpread: shots ? `upper quartile ${q75} - lower quartile ${q25} of the fire times ${show(fireTimes, 100)}` : 'no shot rounds',
      inputsMedian: shots ? `inputs of the shot rounds: ${show(inputs, 120)}` : 'no shot rounds',
      cadenceCV: gaps.length < 5 ? `${plural(gaps.length, 'same-round gap')}, fewer than 5` : gapMean === 0 ? `${gaps.length} same-round gaps, all 0 ticks: a mean of 0` : `${gaps.length} same-round gaps with mean ${gapMean}`,
      missLag1: xs.length < 4 ? `${plural(xs.length, 'pair')} of consecutive shot rounds, fewer than 4` : `${xs.length} pairs of consecutive shot rounds`,
    },
  };
}

const HINT = {
  shots: 'the number of rounds whose shot is not null',
  hitRate: 'hits over shot rounds (rounds without a shot do not count); null with no shots',
  missMedian: 'the median of abs(miss) over shot rounds; null with no shots',
  fireMedian: 'the median of shot.tick - start over shot rounds, in ticks from the start of the round',
  fireSpread: 'the upper quartile minus the lower quartile of the fire times, with quantile from public/stats.mjs (it interpolates); null with no shots',
  inputsMedian: 'the median of the rounds\' inputs over shot rounds',
  cadenceCV: 'the population sd over the mean of the gaps between consecutive admitted inputs in the same round, pooled over the session (an input belongs to the latest round whose start is at or before its tick, so an input at a round\'s start tick belongs to that round); null with fewer than 5 gaps or a mean of 0',
  missLag1: 'correlation (public/stats.mjs) of the miss in round r with the miss in round r + 1, over consecutive rounds that both had a shot; null with fewer than 4 such pairs',
};

// The sessions: five of each kind, plus seven cut or changed copies that reach every null and
// boundary in API.md's definitions. Seeds are the checks' own: no lab command uses them.
const SEEDS = {
  novice: [14000000, 14000001, 14000002, 14000003, 14000004],
  skilled: [14001000, 14001001, 14001002, 14001003, 14001004],
  expert: [14002000, 14002001, 14002002, 14002003, 14002004],
  highLatency: [14003000, 14003001, 14003002, 14003003, 14003004],
  jitter: [14004000, 14004001, 14004002, 14004003, 14004004],
  reconnects: [14005000, 14005005, 14005008, 14005010, 14005021], // all but the first have a round with no shot
  searcher: [14006000, 14006001, 14006002, 14006003, 14006004],
};

// The session as it stood when its round k ended: its first k rounds, and the inputs applied
// before round k + 1 started.
function firstRounds(c, k) {
  const end = c.rounds[k]?.start ?? c.record.end;
  return { ...c, record: { ...c.record, inputs: c.record.inputs.filter((i) => i.tick < end), end }, rounds: c.rounds.slice(0, k) };
}

const CHANGED = [
  { kind: 'reconnects', seed: 14005041, tag: 'round1', how: 'cut to its first round, which ended with no shot, and that round\'s inputs', make: (c) => firstRounds(c, 1) },
  { kind: 'skilled', seed: 14001001, tag: 'rounds1-4', how: 'cut to its first 4 rounds (3 pairs of consecutive shot rounds) and the inputs applied before round 5 started', make: (c) => firstRounds(c, 4) },
  { kind: 'skilled', seed: 14001001, tag: 'rounds1-5', how: 'cut to its first 5 rounds (4 pairs of consecutive shot rounds) and the inputs applied before round 6 started', make: (c) => firstRounds(c, 5) },
  { kind: 'expert', seed: 14002000, tag: 'round1', how: 'cut to its first round (5 inputs, so 4 gaps) and that round\'s inputs', make: (c) => firstRounds(c, 1) },
  { kind: 'reconnects', seed: 14005004, tag: 'round1', how: 'cut to its first round (6 inputs, so 5 gaps) and that round\'s inputs', make: (c) => firstRounds(c, 1) },
  {
    kind: 'novice', seed: 14000000, tag: 'burst', how: 'cut to its first round, with all 23 of that round\'s inputs applied together at the tick it fired (as when the network holds them back), so every gap is 0',
    make: (c) => { const one = firstRounds(c, 1); const t = one.rounds[0].shot.tick; return { ...one, record: { ...one.record, inputs: one.record.inputs.map((i) => ({ ...i, tick: t })) } }; },
  },
  {
    kind: 'skilled', seed: 14001000, tag: 'start-tick', how: 'with the first input of round 2 moved to tick 113, the tick round 2 started',
    make: (c) => { const start = c.rounds[1].start; const k = c.record.inputs.findIndex((i) => i.tick >= start); return { ...c, record: { ...c.record, inputs: c.record.inputs.map((i, j) => (j === k ? { ...i, tick: start } : i)) } }; },
  },
];

function featureCases() {
  const played = new Map();
  const play = (kind, seed) => {
    const key = `${kind} ${seed}`;
    if (!played.has(key)) played.set(key, playCorpusSession(kind, seed));
    return played.get(key);
  };
  const out = [];
  for (const [kind, seeds] of Object.entries(SEEDS)) {
    for (const seed of seeds) {
      const { record, rounds } = play(kind, seed);
      out.push({ id: `check-${kind}-${seed}`, input: `c = playCorpusSession('${kind}', ${seed}) from public/corpus.mjs`, c: { record, rounds } });
    }
  }
  for (const x of CHANGED) {
    const { record, rounds } = x.make(structuredClone(play(x.kind, x.seed)));
    const id = `check-${x.kind}-${x.seed}-${x.tag}`;
    out.push({ id, input: `c = playCorpusSession('${x.kind}', ${x.seed}) from public/corpus.mjs, ${x.how}`, c: { record, rounds } });
  }
  return out;
}

// ------------------------------------------------------------------ chooseThreshold, by API.md

// The smallest t among the scores such that count(score >= t) / n <= budget.
function expectedThreshold(scores, budget) {
  const n = scores.length;
  for (const t of [...new Set(scores)].sort((a, b) => a - b)) if (scores.filter((s) => s >= t).length / n <= budget) return t;
  return Infinity;
}

function explainThreshold(scores, budget, t) {
  const n = scores.length, allowed = budget * n;
  const atOrAbove = (x) => scores.filter((s) => s >= x).length;
  const top = Math.max(...scores);
  if (t === Infinity) return `no score qualifies: even the highest, ${top}, has ${atOrAbove(top)} scores at or above it, more than ${budget} × ${n} = ${allowed}`;
  const below = scores.filter((s) => s < t);
  const next = below.length ? Math.max(...below) : null;
  return `${atOrAbove(t)} of the ${n} scores are at or above ${t}, within ${budget} × ${n} = ${allowed}${next === null ? '' : `; the next lower score, ${next}, would make ${atOrAbove(next)}`}`;
}

function realisticScores() {
  // 997 scores from a seeded normal (the highest 5.986), then 9.5 and two of 9.25, shuffled.
  const random = makeRandom(1414);
  const scores = Array.from({ length: 997 }, () => Math.round(random.normal() * 2000) / 1000);
  scores.push(9.5, 9.25, 9.25);
  for (let i = scores.length - 1; i > 0; i--) { const j = Math.floor(random.next() * (i + 1)); [scores[i], scores[j]] = [scores[j], scores[i]]; }
  return scores;
}

const THRESHOLDS = [
  { scores: [5, 1, 9, 3, 7, 2, 8, 4, 6, 10], budget: 0.2, about: 'unsorted scores' },
  { scores: [1, 2, 3, 4, 5, 5, 5, 6], budget: 0.25, about: 'a tie at the cut: three scores of 5' },
  { scores: [3, 1, 3, 2, 3], budget: 0.4, about: 'a tie at the top, so no score qualifies' },
  { scores: [0.5, 0.25, 0.75], budget: 0, about: 'budget 0, so no score qualifies' },
  { scores: [4, -2, 7, 0], budget: 1, about: 'budget 1, so every score qualifies' },
  { scores: [2.5, 2.5, 2.5, 2.5], budget: 0.5, about: 'all scores equal' },
  { scores: [2.5, 2.5, 2.5, 2.5], budget: 1, about: 'all scores equal, budget 1' },
  { scores: [100, 20, 90, 40, 10, 60, 80, 30, 70, 50], budget: 0.15, about: '0.15 × 10 = 1.5, so at most 1 score' },
  { scores: [0.1, 0.4, 0.2, 0.3], budget: 0.5, about: '0.5 × 4 = 2, so exactly 2 scores may be at or above' },
  { scores: [7], budget: BUDGET, about: 'one score and a budget of 1 in 500' },
  { scores: realisticScores(), budget: BUDGET, about: '1,000 scores with a budget of 1 in 500: the highest are 9.5, 9.25 and 9.25, and the next is 5.986', long: true },
];

// ------------------------------------------------------------------ count and precisionAt, by API.md

function expectedCount(decisions) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const d of decisions) {
    if (d.label === 'cheat') { if (d.flagged) tp++; else fn++; } else if (d.flagged) fp++; else tn++;
  }
  return { total: decisions.length, tp, fp, tn, fn, recall: ratio(tp, tp + fn), falsePositiveRate: ratio(fp, fp + tn), precision: ratio(tp, tp + fp) };
}

// The first field where your count differs from the required one, or null.
function countDifference(got, want) {
  if (!got || typeof got !== 'object') return `count returned ${show(got, 80)}, not an object`;
  for (const k of COUNT_FIELDS) {
    const ok = RATES.has(k) ? sameValue(got[k], want[k], 1e-12) : got[k] === want[k];
    if (!ok) return `${k}: yours is ${show(got[k], 60)}, required ${show(want[k], 60)}`;
  }
  return null;
}

const decisionList = (pattern) => [...pattern].map((ch) => ({ label: 'CN'.includes(ch) ? 'cheat' : 'legal', flagged: 'CL'.includes(ch) }));
// C a flagged cheat, N a cheat not flagged, L a flagged legal session, O a legal session not flagged.
const describe = (pattern) => [...pattern].map((ch) => ({ C: 'flagged cheat', N: 'cheat not flagged', L: 'flagged legal', O: 'legal not flagged' })[ch]).join(', ');

function bigDecisions() {
  const out = [];
  for (let i = 0; i < 2200; i++) {
    const cheat = i % 11 === 0; // 200 cheats among 2,200 sessions
    out.push({ label: cheat ? 'cheat' : 'legal', flagged: cheat ? i < 2090 : i % 700 === 1 });
  }
  return out;
}

const COUNTS = [
  { decisions: decisionList('COCLONOCLO'), input: `count of 10 decisions: ${describe('COCLONOCLO')}` },
  { decisions: decisionList('OOOOO'), input: 'count of 5 legal sessions, none flagged: no cheats and nothing flagged' },
  { decisions: decisionList('CCCC'), input: 'count of 4 cheats, all flagged: no legal sessions' },
  { decisions: decisionList('LLL'), input: 'count of 3 legal sessions, all flagged: no cheats' },
  { decisions: [], input: 'count of an empty list of decisions' },
  { decisions: bigDecisions(), input: 'count of 2,200 decisions: 200 cheats (sessions 0, 11, 22, ...; the 190 before session 2,090 flagged) and 2,000 legal sessions (sessions 1, 701 and 1,401 flagged)' },
];

const PRECISIONS = [
  { args: [0.01, 0.95, 0.0015], about: 'cheaters 1 in 100' },
  { args: [0.01, 1, 0.0005], about: 'cheaters 1 in 100, every cheat flagged' },
  { args: [0.5, 0.5, 0.5], about: 'half cheaters' },
  { args: [0, 0.9, 0.01], about: 'no cheaters, some false flags: precision 0' },
  { args: [1, 0.8, 0.3], about: 'only cheaters: precision 1' },
  { args: [0.01, 0, 0], about: 'nothing flagged: a denominator of 0' },
  { args: [0, 0.9, 0], about: 'no cheaters and no false flags: a denominator of 0' },
];
const expectedPrecision = (b, r, f) => { const d = b * r + (1 - b) * f; return d === 0 ? null : (b * r) / d; };

// ------------------------------------------------------------------ your detector on labelled sessions

// Your features of each case's play alone, and your score of those; your evaluate's
// decisions should be exactly these.
function scoreAll(cases, features, score, settings) {
  return cases.map((c) => {
    const f = call(`your features threw on case ${c.id}, given ${PLAY} only`, () => features(playOf(c)));
    return call(`your score threw on case ${c.id}`, () => score(f, settings));
  });
}

// The check's decisions, one per case: your score of its play against your threshold.
const decide = (cases, scores, threshold) => expectedCount(cases.map((c, i) => ({ label: c.label, flagged: scores[i] >= threshold })));

// What evaluate must agree with, for the checks that compare it with those decisions.
const AGREE = 'evaluate makes the decisions your features and score make from each session\'s play';
const AGREE_WHY = `the check called your features with each session's ${PLAY} only, scored that with your score and flagged it at or above your threshold. Your evaluate is given the whole cases, because it needs their labels to count, and must make the same decision for every session. If it does not, your features or evaluate reads something other than record.inputs and rounds, such as the case's label, id or kind (API.md, features)`;

// The play of one session handed to evaluate twice, as itself and as a searcher's session (id,
// label and kind changed; record and rounds the same), first with the threshold at the score of
// that play, then just above it. A decision made from the play alone is the same for both
// copies: flagged at the score (>=, not >), not flagged above it.
function labelBlind(evaluate, c, s, settings) {
  const disguised = { ...structuredClone(c), id: c.id.replace(c.kind, 'searcher'), label: 'cheat', kind: 'searcher' };
  const above = s + 1e-6 * Math.max(1, Math.abs(s));
  for (const [threshold, flagged] of [[s, true], [above, false]]) {
    const want = expectedCount([{ label: 'legal', flagged }, { label: 'cheat', flagged }]);
    const got = call(`your evaluate threw on case ${c.id}`, () => evaluate([structuredClone(c), structuredClone(disguised)], { ...structuredClone(settings), threshold }));
    const d = countDifference(got, want);
    if (!d) continue;
    const split = got && typeof got === 'object' && got.tp !== got.fp; // one copy flagged, the other not
    fail({
      checked: 'evaluate decides each session from its play alone, and flags a score equal to the threshold',
      input: `evaluate([case ${c.id} (playCorpusSession('${c.kind}', ${c.id.split('-').at(-1)})), the same record and rounds as { id: '${disguised.id}', label: 'cheat', kind: 'searcher' }], your settings with threshold ${threshold === s ? `${s}, the score your features and score give that play` : `${above}, just above ${s}, the score your features and score give that play`})`,
      observed: `evaluate returned ${show(got)}`,
      expected: `${show(want)}: both copies ${flagged ? 'flagged' : 'not flagged'}. ${split
        ? 'The two copies have the same play and got different decisions, so your features or evaluate reads the case\'s id, label or kind: API.md\'s features use only record.inputs and rounds'
        : flagged ? 'A session whose score equals the threshold is flagged (>=, not >)'
          : `Their play scores ${s}, below this threshold, so neither is flagged. Your evaluate must flag a case only when your score of features(c) reaches settings.threshold, and your features must give the whole case the same values as its record.inputs and rounds alone: reading its id, label or kind changes them`}`,
      diff: d,
    });
  }
}

// The check's own held-out sessions: as many of each kind as the held-out split has, played
// from seeds no lab command uses.
function checkHeldout() {
  const out = [];
  KINDS.forEach((kind, place) => {
    for (let n = 0; n < DEFAULT_COUNTS.heldout[kind]; n++) {
      const seed = HELDOUT_SEEDS + 100_000 * place + n;
      const { record, rounds } = playCorpusSession(kind, seed);
      out.push({ id: `check-${kind}-${seed}`, label: kind === 'searcher' ? 'cheat' : 'legal', kind, record, rounds });
    }
  });
  return out;
}

function settingsWithThreshold(json, need) {
  const settings = json('detect/settings.json');
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) fail({ checked: 'detect/settings.json holds an object', observed: `it holds ${show(settings, 80)}`, expected: 'a JSON object with your score\'s settings, "budget": 0.002 and "threshold"' });
  if (typeof settings.threshold !== 'number' || !Number.isFinite(settings.threshold)) {
    fail({ checked: `detect/settings.json has a finite threshold${need ? ` (${need})` : ''}`, input: 'detect/settings.json', observed: `threshold is ${show(settings.threshold, 60)}`, expected: 'a finite number: the threshold your chooseThreshold gives on the dev split\'s legal scores (node lab.mjs tune project --write stores it)' });
  }
  return settings;
}

const scoreText = (s) => (typeof s === 'number' && Number.isFinite(s) ? s.toFixed(3) : show(s, 30));
const listScores = (cases, scores, k = 8) => cases.slice(0, k).map((c, i) => `${c.id} (${scoreText(scores[i])})`).join(', ');

function evaluateResult(r, what, n) {
  if (!r || typeof r !== 'object') fail({ checked: 'evaluate returns the counts', input: what, observed: `evaluate returned ${show(r, 80)}`, expected: '{ total, tp, fp, tn, fn, recall, falsePositiveRate, precision }, as count returns' });
  const sum = r.tp + r.fp + r.tn + r.fn;
  if (r.total !== n || sum !== n) {
    fail({
      checked: 'evaluate makes one decision per session',
      input: what,
      observed: `total ${show(r.total, 30)}; tp + fp + tn + fn = ${show(r.tp, 20)} + ${show(r.fp, 20)} + ${show(r.tn, 20)} + ${show(r.fn, 20)} = ${show(sum, 30)}`,
      expected: `${n} for both: one decision per case (per session, never per round or per shot), counted with count`,
    });
  }
}

export const cases = [
  {
    id: '14.features', title: 'features follow API.md on sessions of every kind', timeLimitMs: 30000,
    requirement: `features(c), given ${PLAY} only, returns the eight features of API.md, to within 1e-9, with null exactly where a feature is undefined.`,
    async run({ fn }) {
      const features = await fn('detect/features.mjs', 'features');
      const list = featureCases(); // measured: about 0.3 s
      const wrong = [];
      for (const { id, input, c } of list) {
        const want = expectedFeatures(c);
        const got = call(`your features threw on case ${id} (${input}), given ${PLAY} only`, () => features(playOf(c)));
        if (!got || typeof got !== 'object') {
          fail({ checked: 'features returns an object of the eight features', input: `case ${id}: ${input}`, observed: `features returned ${show(got, 80)}`, expected: '{ shots, hitRate, missMedian, fireMedian, fireSpread, inputsMedian, cadenceCV, missLag1 }' });
        }
        for (const name of FEATURES) if (!sameValue(got[name], want.values[name], 1e-9)) wrong.push({ id, input, name, got: got[name], want: want.values[name], note: want.notes[name] });
      }
      if (!wrong.length) return;
      const tally = {};
      for (const w of wrong) tally[w.name] = (tally[w.name] ?? 0) + 1;
      const w = wrong[0];
      fail({
        checked: `features(c).${w.name} follows API.md`,
        input: `case ${w.id}: ${w.input}, then features(${PLAY} of c).${w.name}`,
        observed: `${w.name} ${show(w.got, 80)}`,
        expected: `${show(w.want, 80)} (${w.note}). ${w.name} is ${HINT[w.name]}`,
        diff: `features that differ: ${Object.entries(tally).map(([name, k]) => `${name} in ${k} of the ${list.length} cases`).join(', ')}`,
      });
    },
  },
  {
    id: '14.threshold', title: 'chooseThreshold picks the smallest score that meets the budget',
    requirement: 'chooseThreshold(scores, budget) returns the smallest t among the scores such that count(score >= t) / n <= budget, or Infinity when no score qualifies.',
    async run({ fn }) {
      const chooseThreshold = await fn('detect/detector.mjs', 'chooseThreshold');
      for (const { scores, budget, about, long } of THRESHOLDS) {
        const want = expectedThreshold(scores, budget);
        const input = long ? `chooseThreshold(scores, ${budget}) on ${about}` : `chooseThreshold(${show(scores)}, ${budget}): ${about}`;
        const got = call(`your chooseThreshold threw on ${input}`, () => chooseThreshold([...scores], budget));
        if (Object.is(got, want)) continue;
        const atOrAbove = typeof got === 'number' ? scores.filter((s) => s >= got).length : null;
        fail({
          checked: 'chooseThreshold returns the smallest score that meets the budget',
          input,
          observed: `returned ${show(got, 60)}${atOrAbove === null ? '' : `: ${atOrAbove} of the ${scores.length} scores are at or above it${scores.includes(got) || got === Infinity ? '' : ', and it is not one of the scores'}`}`,
          expected: `${show(want)}: ${explainThreshold(scores, budget, want)}`,
        });
      }
    },
  },
  {
    id: '14.counting', title: 'count and precisionAt count sessions and give null for 0 over 0',
    requirement: 'count(decisions) gives total, tp, fp, tn, fn and the three rates with null for a denominator of 0; precisionAt(b, r, f) is b r / (b r + (1 - b) f), or null when that denominator is 0.',
    async run({ fn }) {
      const count = await fn('detect/detector.mjs', 'count');
      for (const { decisions, input } of COUNTS) {
        const want = expectedCount(decisions);
        const got = call(`your count threw on the ${input}`, () => count(decisions.map((d) => ({ ...d }))));
        const diff = countDifference(got, want);
        if (diff) fail({ checked: 'count gives the per-session counts and rates of API.md', input, observed: `count returned ${show(got)}`, expected: `${show(want)}: a flagged cheat is a true positive (tp), a flagged legal session a false positive (fp); recall = tp / (tp + fn), falsePositiveRate = fp / (fp + tn), precision = tp / (tp + fp), each null when its denominator is 0`, diff });
      }
      const precisionAt = await fn('detect/detector.mjs', 'precisionAt');
      for (const { args, about } of PRECISIONS) {
        const want = expectedPrecision(...args);
        const input = `precisionAt(${args.join(', ')}): ${about}`;
        const got = call(`your precisionAt threw on ${input}`, () => precisionAt(...args));
        if (!sameValue(got, want, 1e-12)) {
          const [b, r, f] = args;
          fail({ checked: 'precisionAt gives the precision at a base rate', input, observed: `returned ${show(got, 60)}`, expected: want === null ? `null: b × r + (1 - b) × f = ${b} × ${r} + ${1 - b} × ${f} = 0` : `${want}: b × r / (b × r + (1 - b) × f) = ${b * r} / (${b * r} + ${(1 - b) * f})` });
        }
      }
    },
  },
  {
    id: '14.frozen', title: 'the frozen settings meet the budget on the dev split', timeLimitMs: 90000,
    requirement: 'detect/settings.json holds "budget": 0.002 and a finite threshold, and at that threshold your score (a number, the same for the same inputs) flags at most 0.002 × n of the dev split\'s n legal sessions.',
    async run({ fn, json }) {
      const settings = settingsWithThreshold(json);
      if (settings.budget !== BUDGET) fail({ checked: 'detect/settings.json holds "budget": 0.002', input: 'detect/settings.json', observed: `budget is ${show(settings.budget, 60)}`, expected: '0.002: one false flag in 500 legal sessions' });
      const features = await fn('detect/features.mjs', 'features');
      const score = await fn('detect/detector.mjs', 'score');
      const legal = makeCorpus({ split: 'dev' }).filter((c) => c.label === 'legal'); // measured: about 5 s
      const pristine = structuredClone(settings);
      const scores = scoreAll(legal, features, score, settings);
      const again = scoreAll(legal, features, score, structuredClone(pristine));
      legal.forEach((c, i) => {
        const s = scores[i];
        const input = `score(features(${PLAY} of c), your settings) for case ${c.id} of makeCorpus({ split: 'dev' })`;
        if (typeof s !== 'number' || Number.isNaN(s)) fail({ checked: 'score returns a number', input, observed: `returned ${show(s, 60)}`, expected: 'a number (not NaN): higher is more suspicious' });
        if (!Object.is(again[i], s)) fail({ checked: 'score gives the same number for the same inputs', input: `${input}, run over the dev split twice`, observed: `${s} the first time, ${show(again[i], 60)} the second`, expected: 'the same number both times: the score may use only the features and your settings' });
      });
      const allowed = BUDGET * legal.length;
      const flagged = legal.map((c, i) => ({ c, s: scores[i] })).filter((x) => x.s >= settings.threshold).sort((a, b) => b.s - a.s);
      if (flagged.length > allowed) {
        fail({
          checked: 'at your threshold, your score flags at most 0.002 × n of the dev legal sessions',
          input: `your features and score on the ${legal.length} legal sessions of makeCorpus({ split: 'dev' }), threshold ${settings.threshold} from detect/settings.json`,
          observed: `${flagged.length} score at or above it: ${listScores(flagged.map((x) => x.c), flagged.map((x) => x.s))}${flagged.length > 8 ? ', ...' : ''}`,
          expected: `at most ${allowed} (0.002 × ${legal.length}): the threshold your chooseThreshold gives on these scores (node lab.mjs tune project --write stores it)`,
        });
      }
    },
  },
  {
    id: '14.heldout', title: 'the frozen detector on held-out sessions of the check\'s own', timeLimitMs: 90000,
    requirement: `On 2,200 held-out sessions of the check's own (seeds no lab command uses), your frozen features and score, given each session's ${PLAY} only, flag at most ${HELDOUT_FALSE_FLAGS} of the 2,000 legal sessions and at least ${HELDOUT_RECALL * 100}% of the 200 searcher sessions; evaluate, given the whole cases, makes one decision per session and exactly those decisions.`,
    async run({ fn, json }) {
      const settings = settingsWithThreshold(json, 'the frozen settings');
      const features = await fn('detect/features.mjs', 'features');
      const score = await fn('detect/detector.mjs', 'score');
      const evaluate = await fn('detect/detector.mjs', 'evaluate');
      const heldout = checkHeldout(); // measured: about 10 s
      const what = `evaluate(the check's held-out sessions, your settings): ${heldout.length} sessions, as many of each kind as the held-out split, from playCorpusSession(kind, seed) with seed ${HELDOUT_SEEDS.toLocaleString('en-US')} + 100,000 × the kind's place in KINDS + n; threshold ${settings.threshold}`;
      // The check's own decisions, from your score of each session's play; the counts judged below.
      const scores = scoreAll(heldout, features, score, structuredClone(settings));
      const decided = decide(heldout, scores, settings.threshold);
      const r = call('your evaluate threw on the check\'s held-out sessions', () => evaluate(heldout.map((c) => structuredClone(c)), structuredClone(settings)));
      evaluateResult(r, what, heldout.length);
      const diff = countDifference(r, decided);
      if (diff) fail({ checked: AGREE, input: what, observed: `evaluate returned ${show(r)}`, expected: `${show(decided)}: ${AGREE_WHY}`, diff });

      // One legal session's play, as itself and disguised as a searcher's: the same decision.
      const k = heldout.findIndex((c, i) => c.label === 'legal' && Number.isFinite(scores[i]));
      if (k >= 0) labelBlind(evaluate, heldout[k], scores[k], settings);

      // Only counts from here on: these sessions are for measuring, so no session is named.
      const legal = decided.fp + decided.tn;
      const cheats = decided.tp + decided.fn;
      const again = 'Any change to your detector after this result is a re-tune: freeze again (node lab.mjs freeze project), and your receipt keeps this result and shows the later freeze';
      if (decided.fp > HELDOUT_FALSE_FLAGS) {
        fail({
          checked: `false flags among the check's ${grouped(legal)} held-out legal sessions, at your frozen threshold (at most ${HELDOUT_FALSE_FLAGS} allowed)`,
          input: what,
          observed: `${decided.fp} of the ${grouped(legal)} legal sessions flagged`,
          expected: `at most ${HELDOUT_FALSE_FLAGS}. Your threshold must come from the dev split alone: the one chooseThreshold gives on the dev legal scores at budget 0.002 (node lab.mjs tune project shows it, with your highest legal and lowest searcher scores there). Fitted that way, it flags more than ${HELDOUT_FALSE_FLAGS} of these sessions only about once in 100, by chance. Do not move it to fit these sessions. ${again}`,
        });
      }
      if (!(decided.recall >= HELDOUT_RECALL)) {
        fail({
          checked: `searcher sessions flagged among the check's ${cheats} held-out ones, at your frozen threshold (at least ${HELDOUT_RECALL * 100}% required)`,
          input: what,
          observed: `${decided.tp} of the ${cheats} flagged (recall ${decided.recall})`,
          expected: `at least ${Math.ceil(HELDOUT_RECALL * cheats)} of ${cheats} (recall ${HELDOUT_RECALL}). A score that sets the searcher apart does it on the dev split too: node lab.mjs tune project shows your recall and lowest searcher scores there, and node lab.mjs features project the searcher beside the legal kinds, feature by feature. Fit any new threshold on the dev split alone. ${again}`,
        });
      }
    },
  },
  {
    id: '14.recordings', title: 'the frozen detector on the recorded adapted searchers', timeLimitMs: 30000,
    requirement: `On each recording set (60 sessions each), evaluate makes one decision per session, the decisions your features and score make from each session's ${PLAY}; at least ${DELAY_RECALL * 100}% of the sessions in recordings/delay.json are flagged.`,
    async run({ fn, json }) {
      const settings = settingsWithThreshold(json, 'the frozen settings');
      const features = await fn('detect/features.mjs', 'features');
      const score = await fn('detect/detector.mjs', 'score');
      const evaluate = await fn('detect/detector.mjs', 'evaluate');
      const results = {};
      for (const name of ['delay', 'delay-misses']) {
        const sessions = readJson(`recordings/${name}.json`);
        const what = `evaluate(recordings/${name}.json, your settings): ${sessions.length} recorded sessions, all cheats, threshold ${settings.threshold}`;
        const scores = scoreAll(sessions, features, score, structuredClone(settings));
        const decided = decide(sessions, scores, settings.threshold);
        const r = call(`your evaluate threw on recordings/${name}.json`, () => evaluate(sessions.map((c) => structuredClone(c)), structuredClone(settings)));
        evaluateResult(r, what, sessions.length);
        const diff = countDifference(r, decided);
        if (diff) fail({ checked: AGREE, input: what, observed: `evaluate returned ${show(r)}`, expected: `${show(decided)}: ${AGREE_WHY}`, diff });
        results[name] = { decided, what, n: sessions.length };
      }
      const { decided, what, n } = results.delay;
      const need = Math.ceil(DELAY_RECALL * n);
      if (decided.tp < need) {
        fail({
          checked: `recordings/delay.json sessions flagged by your frozen detector (at least ${need} of ${n} required)`,
          input: what,
          observed: `${decided.tp} of ${n} flagged (recall ${(decided.tp / n).toFixed(3)})`,
          expected: `at least ${need} of ${n} (${DELAY_RECALL * 100}%). These sessions aim like the searcher but time their inputs like an expert, so a score built on timing misses them. Hit rate alone does not set them apart either: over a session's 12 rounds the best experts hit about as often as the searcher, and your threshold has to stay above those experts. Look at how close the shots land, the good ones above all, not only at whether they hit. You may design on these sets (node lab.mjs recordings project), but a change to your detector means fitting the threshold on the dev split again and freezing again; your receipt shows the later freeze`,
        });
      }
    },
  },
];
