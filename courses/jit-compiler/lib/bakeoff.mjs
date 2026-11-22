// Both contestants filter the same values with the same runtime. Training
// evaluates candidate models against actual elapsed query time on this machine.
const program = [['load'], ['const', 30], ['gt']];
const batchSize = 256;
const trainingSeeds = [113, 271];
const trainingRepeats = 3;
const clock = () => performance.now();

export function fixedRule({ remainingRows, compiled, previous }) {
  if (previous.rows === 0) return 'interpret';
  if (!compiled && remainingRows < 512) return 'interpret';
  return previous.nulls / previous.rows <= 1 / 32 ? 'compile' : 'interpret';
}

function random(seed) {
  // A reproducible stream. Zero is a valid seed for this generator.
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function workload(name, values) {
  const expected = [];
  for (const [index, value] of values.entries()) {
    if (value !== null && value > 30) expected.push(index);
  }
  return { name, values, expected };
}

function workloads(seed, shift = false) {
  const next = random(seed);
  const value = () => Math.floor(next() * 141) - 40;
  if (shift) {
    // Same numbers and one null per batch. Swap its position with the last row.
    const first = Array.from({ length: 4096 }, (_, i) => i % batchSize === 0 ? null : value());
    const last = first.slice();
    for (let start = 0; start < last.length; start += batchSize) {
      const end = start + batchSize - 1;
      [last[start], last[end]] = [last[end], last[start]];
    }
    return [workload('null first', first), workload('null last', last)];
  }
  const rows = (length, p) => Array.from({ length }, () => next() < p ? null : value());
  return [workload('short clean', rows(80, 0)), workload('long clean', rows(8272, 0)),
    workload('rare nulls', rows(4096, 0.006)), workload('many nulls', rows(4096, 0.20))];
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function assertMatches(actual, expected, name) {
  if (actual.length !== expected.length) {
    throw Error(`${name} returned ${actual.length} row IDs. Direct filtering expects ${expected.length}. Timing discarded.`);
  }
  const index = actual.findIndex((id, i) => id !== expected[i]);
  if (index >= 0) throw Error(`${name} returned row ${actual[index]} at output ${index}. Expected ${expected[index]}. Timing discarded.`);
}

function measure(run, data, choose) {
  const start = clock();
  const { matches, trace } = run(program, data.values, { batchSize, choose });
  const ms = clock() - start;
  assertMatches(matches, data.expected, data.name);
  return { ms, trace };
}

function candidates() {
  const all = ['compile', 'interpret'].map(action => ({ cutoff: 0, low: action, high: action }));
  for (const cutoff of [0, 1 / 128, 1 / 32, 1 / 8]) {
    all.push({ cutoff, low: 'compile', high: 'interpret' }, { cutoff, low: 'interpret', high: 'compile' });
  }
  return all;
}

function chooser(model, feature, chooseLearned) {
  return observation => {
    const score = feature(observation);
    if (!Number.isFinite(score)) throw Error('feature must return a finite number for every batch, including the first.');
    return chooseLearned(score, model);
  };
}

function validateTestSeed(testSeed) {
  if (!Number.isInteger(testSeed) || testSeed < 0 || testSeed > 0xffffffff) throw Error('Use an unsigned 32-bit test seed.');
  if (trainingSeeds.includes(testSeed)) throw Error(`Seed ${testSeed} belongs to training. Pick a different seed for the held-out run.`);
}

function fit({ run, feature, chooseLearned }) {
  const start = clock();
  const data = trainingSeeds.flatMap(seed => workloads(seed));
  const entries = candidates().map(model => ({ model, choose: chooser(model, feature, chooseLearned), scores: [] }));
  // Exercise both engine tiers before collecting training samples. Every timed
  // query still starts with its own empty predicate cache.
  measure(run, data[1], () => 'interpret');
  measure(run, data[1], () => 'compile');
  for (let round = 0; round < trainingRepeats; round++) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[(i + round * 3) % entries.length];
      const ms = data.reduce((sum, stream) => sum + measure(run, stream, entry.choose).ms, 0);
      entry.scores.push(ms);
    }
  }
  const ranked = entries.map(entry => ({ ...entry, score: median(entry.scores) })).sort((a, b) => a.score - b.score);
  const { model, choose, score } = ranked[0];
  return { model, choose, score, ms: clock() - start, candidates: entries.length };
}

export function trainChooser(options) {
  return fit(options).choose;
}

function summarize(trace) {
  const decisions = trace.filter(event => event.kind === 'decision');
  const batches = trace.filter(event => event.kind === 'batch');
  const last = decisions.at(-1);
  const lastCached = trace.some(e => e.kind === 'compile' && e.at < last.start);
  const tail = {rows:last.end-last.start, cached:lastCached, action:last.action};
  return { tail, batches: decisions.length, compileChoices: decisions.filter(event => event.action === 'compile').length,
    builds: trace.filter(event => event.kind === 'compile').length,
    exits: trace.filter(event => event.kind === 'guard-failure').length,
    compiledRows: batches.reduce((sum, batch) => sum + batch.compiledRows, 0) };
}

function evaluate(run, data, model, repeats) {
  const choices = { rule: fixedRule, model };
  const samples = { rule: [], model: [] };
  const traces = {};
  for (let round = 0; round < repeats; round++) {
    const order = round % 2 ? ['model', 'rule'] : ['rule', 'model'];
    for (const label of order) {
      const { ms, trace } = measure(run, data, choices[label]);
      samples[label].push(ms);
      if (round === 0) traces[label] = summarize(trace);
    }
  }
  return { name: data.name, rows: data.values.length, matches: data.expected.length, samples, traces };
}

export function race({ run, feature, chooseLearned, repeats = 6, testSeed = 901, shift = false }) {
  validateTestSeed(testSeed);
  if (!Number.isSafeInteger(repeats) || repeats < 2 || repeats % 2) throw Error('Use a positive, even number of rounds (at least two) to alternate the first runner.');
  const { choose, ...training } = fit({ run, feature, chooseLearned });
  // Warm both deployed policies on training data before held-out timing.
  const warmup = workloads(trainingSeeds[0])[1];
  measure(run, warmup, fixedRule);
  measure(run, warmup, choose);
  const cases = workloads(testSeed, shift).map(data => evaluate(run, data, choose, repeats));
  return { trainingSeeds: [...trainingSeeds], training, trainingRepeats, testSeed, shift, batchSize, repeats, cases };
}

function describe(trace) {
  return `compile choices ${trace.compileChoices}/${trace.batches}, builds ${trace.builds}, exits ${trace.exits}, Wasm rows ${trace.compiledRows}; last batch ${trace.tail.rows} rows, ${trace.tail.cached ? 'cached' : 'cold'} -> ${trace.tail.action}`;
}

export function formatRace(report) {
  const { model, ms, candidates, score } = report.training;
  const display = ms => ms.toFixed(3) + ' ms';
  const lines = [
    `${process.version} ${process.platform}/${process.arch} | batch size ${report.batchSize} | query value > 30`,
    `Trained ${candidates} candidate policies on seeds ${report.trainingSeeds.join(', ')}. Fitting took ${display(ms)}.`,
    `Lowest median training-query total (${report.trainingRepeats} rounds): ${display(score)}.`,
    `Fitted choice: score <= ${model.cutoff} chooses ${model.low}; above it chooses ${model.high}.`,
    `Held-out seed ${report.testSeed} | ${report.shift ? 'position shift' : 'stationary inputs'} | ${report.repeats} paired rounds, alternating first runner.`,
  ];
  for (const data of report.cases) {
    lines.push('', `${data.name}: ${data.rows} inputs, ${data.matches} matching IDs verified for every run.`);
    for (const label of ['rule', 'model']) {
      const samples = data.samples[label];
      lines.push(`  ${label.padEnd(5)} median ${display(median(samples))} (range ${display(Math.min(...samples))} to ${display(Math.max(...samples))}); ${describe(data.traces[label])}`);
    }
  }
  const totals = label => Array.from({ length: report.repeats }, (_, i) => report.cases.reduce((sum, data) => sum + data.samples[label][i], 0));
  const rule = totals('rule');
  const fitted = totals('model');
  lines.push('', `Median total for one held-out pass: rule ${display(median(rule))}, model ${display(median(fitted))}.`,
    `Paired rule time minus model time, median ${display(median(rule.map((time, i) => time - fitted[i])))}. Positive favors the model.`,
    `One held-out pass including one fit: model ${display(ms + median(fitted))}, rule ${display(median(rule))}.`,
    'Query timers include policy calls, WebAssembly build/instantiation, guards, trace creation and result collection. Data generation and ID verification are outside query timers.');
  return lines.join('\n');
}
