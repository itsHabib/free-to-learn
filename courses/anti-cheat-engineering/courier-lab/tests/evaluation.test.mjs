import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, evaluate } from '../evaluation/policy.mjs';
import * as template from '../evaluation/template.mjs';
import { correctPolicies, wrongPolicies } from '../evaluation/controls.mjs';
import { assess, cases } from '../evaluation/fixtures.mjs';
import { CORPUS_VERSION, DEFAULT_SETTINGS, SPLIT_IDS, generateCorpus, loadCorpus,
  casesForSplit, extractSignals, extractDenials } from '../evaluation/corpus.mjs';
import { prepareEvaluation, runEvaluation, hashValue } from '../evaluation/report.mjs';
import { postCheckFeedback, reviewerFeedback } from '../evaluation/feedback.mjs';
import { createRecordedEngine } from '../telemetry/runtime.mjs';

const copy = (value) => JSON.parse(JSON.stringify(value));
const input = (seq, interact = true) => ({ v: 1, seq, move: 'idle', interact });

for (const [name, candidate] of Object.entries(correctPolicies)) {
  test(`correct policy passes every criterion: ${name}`, async () => {
    const result = await assess(candidate);
    assert.equal(result.passed, true, JSON.stringify(result.criteria.filter((item) => !item.passed), null, 2));
    assert.equal(result.criteria.length, cases().length);
  });
}

for (const [name, candidate] of Object.entries(wrongPolicies)) {
  test(`calibration rejects plausible wrong policy: ${name}`, async () => {
    const result = await assess(candidate);
    assert.equal(result.passed, false, `${name} incorrectly passed`);
    const failures = result.criteria.filter((item) => !item.passed);
    assert.ok(failures.length > 0);
    for (const { error } of failures) {
      assert.ok(error.message.length > 0);
      assert.ok(Object.hasOwn(error, 'expected'));
      assert.ok(Object.hasOwn(error, 'actual'));
      assert.ok(Object.hasOwn(error, 'input'));
      assert.match(error.source, /^LEARNER\.md#/);
    }
  });
}

test('checker reports missing exports and thrown/non-JSON results without losing feedback', async () => {
  const absent = await assess({});
  assert.equal(absent.passed, false);
  assert.equal(absent.criteria.length, 2);
  const broken = await assess({ classify() { throw new Error('failed candidate'); }, evaluate() { return { metrics: NaN }; } });
  assert.equal(broken.passed, false);
  assert.deepEqual(broken.criteria[0].error.actual, { threw: 'failed candidate' });
  assert.doesNotThrow(() => JSON.stringify(broken));
});

test('incomplete template and input-mutating policies are not accepted', async () => {
  assert.equal((await assess(template)).passed, false);
  const candidate = { evaluate, classify(signals, settings) {
    const result = classify(signals, settings);
    signals.push({ tick: 1000, reason: 'cooldown', distanceSquared: 0 });
    return result;
  } };
  const result = await assess(candidate);
  assert.equal(result.passed, false);
  assert.match(result.criteria[0].error.message, /Preserve the supplied inputs/);
  assert.ok(result.criteria[0].error.actual.inputAfter);
});

test('reference leaves sorted source data and settings unchanged and returns exact shapes', () => {
  const item = cases().find((fixture) => fixture.method === 'evaluate' && fixture.args[0].length === 8);
  const before = copy(item.args);
  const result = evaluate(...item.args);
  assert.deepEqual(item.args, before);
  assert.deepEqual(Object.keys(result).sort(), ['decisions', 'metrics']);
  assert.deepEqual(Object.keys(result.decisions[0]).sort(), ['flagged', 'id']);
  assert.deepEqual(Object.keys(result.metrics).sort(), ['falsePositiveRate', 'fn', 'fp', 'precision', 'recall', 'tn', 'total', 'tp']);
});

test('classifier never receives case labels or metadata as input', () => {
  const raw = { id: 'label-trap', signals: [], get label() { throw new Error('read label before prediction'); } };
  assert.equal(classify(raw.signals, DEFAULT_SETTINGS), false);
  // A correct evaluate must read labels for scoring; changing them never changes its decisions.
  const a = evaluate([{ id: 'same-id', label: true, signals: [] }], DEFAULT_SETTINGS);
  const b = evaluate([{ id: 'same-id', label: false, signals: [] }], DEFAULT_SETTINGS);
  assert.deepEqual(a.decisions, b.decisions);
  assert.notDeepEqual(a.metrics, b.metrics);
});

test('versioned corpus is deterministic, contains fourteen unique cases and fixes its split membership', async () => {
  const corpus = generateCorpus();
  assert.deepEqual(corpus, generateCorpus());
  assert.equal(corpus.version, CORPUS_VERSION);
  assert.equal(corpus.cases.length, 14);
  assert.equal(new Set(corpus.cases.map((item) => item.id)).size, 14);
  assert.deepEqual(corpus.splits, SPLIT_IDS);
  for (const split of Object.keys(SPLIT_IDS)) {
    const projected = casesForSplit(corpus, split);
    assert.deepEqual(projected.map((item) => item.id), SPLIT_IDS[split]);
    assert.equal(projected.filter((item) => item.label).length, 1);
    assert.equal(projected.filter((item) => !item.label).length, 6);
    for (const item of projected) assert.deepEqual(Object.keys(item).sort(), ['id', 'label', 'signals']);
  }
  assert.deepEqual(await loadCorpus(corpus), corpus);
  assert.deepEqual(await loadCorpus(JSON.stringify(corpus)), corpus);
});

test('loadCorpus reads a local JSON file and refuses split, label, signal and replay alterations', async () => {
  const corpus = generateCorpus();
  const directory = await mkdtemp(join(tmpdir(), 'courier-evaluation-'));
  try {
    const path = join(directory, 'corpus.json');
    await writeFile(path, JSON.stringify(corpus));
    assert.deepEqual(await loadCorpus(path), corpus);
    const changedSplit = copy(corpus);
    changedSplit.splits.evaluation.reverse();
    await assert.rejects(loadCorpus(changedSplit), /stable evaluation IDs/);
    const changedLabel = copy(corpus);
    changedLabel.cases[0].label = true;
    await assert.rejects(loadCorpus(changedLabel), /synthetic label/);
    const changedAutomation = copy(corpus);
    changedAutomation.cases[0].declaredAutomation = true;
    await assert.rejects(loadCorpus(changedAutomation), /declared automation metadata/);
    await assert.rejects(loadCorpus({ ...corpus, version: 'courier-synthetic-evaluation-v1' }), /Unsupported evaluation corpus/);
    const changedSignals = copy(corpus);
    changedSignals.cases[0].signals.push({ tick: 1, reason: 'range', distanceSquared: 1_000_000 });
    await assert.rejects(loadCorpus(changedSignals), /Signals do not match replay/);
    const changedRecord = copy(corpus);
    changedRecord.cases[0].record.final.actors[0].actor.score += 1;
    await assert.rejects(loadCorpus(changedRecord), /refused replay: final/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('corpus covers real delivery, cooldown, anticipatory, stale retry, isolated and repeated denials', () => {
  const corpus = generateCorpus();
  const family = (name) => corpus.cases.find((item) => item.id === `evaluation/${name}`);
  assert.equal(family('honest-delivery').record.final.actors[0].actor.score, 1);
  assert.deepEqual(family('honest-delivery').signals, []);
  const repress = family('pickup-repress');
  assert.equal(repress.record.final.actors[0].actor.score, 1);
  assert.equal(repress.signals.filter((signal) => signal.reason === 'cooldown').length, 6);
  assert.deepEqual(repress.signals.filter((signal) => signal.reason === 'range'), [{ tick: 10, reason: 'range', distanceSquared: 250_000 }]);
  assert.equal(family('anticipatory-presses').signals.filter((signal) => signal.reason === 'range').length, 2);
  const retries = family('delayed-reordered-retries');
  assert.equal(retries.record.final.actors[0].actor.score, 1);
  assert.equal(retries.signals.filter((signal) => signal.reason === 'range').length, 0);
  assert.ok(retries.record.events.some(({ event }) => event.type === 'input' && event.input.seq === 1));
  assert.deepEqual(family('isolated-distant-errors').signals.map((signal) => signal.tick), [4, 30, 56]);
  assert.equal(family('repeated-distant-invalid').signals.length, 4);
  assert.deepEqual(family('repeated-distant-invalid').signals.map((signal) => signal.tick), [4, 10, 16, 22]);
  for (const item of corpus.cases) {
    assert.equal(item.record.startIndex, 0);
    assert.deepEqual(extractSignals(item.record), item.signals);
  }
});

test('indistinguishable legal twins share a violation label and keep automation as separate metadata', () => {
  const corpus = generateCorpus();
  for (const split of Object.keys(SPLIT_IDS)) {
    const honest = corpus.cases.find((item) => item.id === `${split}/honest-delivery`);
    const automated = corpus.cases.find((item) => item.id === `${split}/valid-automation`);
    assert.deepEqual(honest.record, automated.record);
    assert.deepEqual(honest.signals, automated.signals);
    assert.equal(honest.label, false);
    assert.equal(automated.label, false);
    assert.equal(honest.declaredAutomation, false);
    assert.equal(automated.declaredAutomation, true);
    assert.equal(classify(honest.signals, DEFAULT_SETTINGS), classify(automated.signals, DEFAULT_SETTINGS));
    const result = evaluate(casesForSplit(corpus, split), DEFAULT_SETTINGS);
    assert.deepEqual(result.metrics, { total: 7, tp: 1, fp: 0, tn: 6, fn: 0, precision: 1, recall: 1, falsePositiveRate: 0 });
  }
});

test('the required window comparison exposes a real difference between the fixed splits', () => {
  const corpus = generateCorpus();
  const repeated = (split) => corpus.cases.find((item) => item.id === `${split}/repeated-distant-invalid`).signals;
  const short = { ...DEFAULT_SETTINGS, windowTicks: 8 };
  assert.equal(classify(repeated('exploration'), short), true);
  assert.equal(classify(repeated('evaluation'), short), false);
  assert.equal(classify(repeated('exploration'), DEFAULT_SETTINGS), true);
  assert.equal(classify(repeated('evaluation'), DEFAULT_SETTINGS), true);
  assert.equal(evaluate(casesForSplit(corpus, 'exploration'), short).metrics.recall, 1);
  assert.equal(evaluate(casesForSplit(corpus, 'evaluation'), short).metrics.recall, 0);
});

test('extractor derives distance after authoritative movement and emits a decision only on its tick', () => {
  const recorder = createRecordedEngine(0);
  const actor = recorder.join();
  recorder.admit(actor.id, { v: 1, seq: 1, move: 'E', interact: true });
  recorder.advance(3);
  assert.deepEqual(extractDenials(recorder.window()), [{ tick: 1, actorId: 'actor-1', reason: 'range', distanceSquared: 562_500 }]);
  assert.throws(() => extractSignals(recorder.window(), { actorId: 'actor-9' }), /Unknown signal actor/);
  const malformed = copy(recorder.window());
  malformed.complete = false;
  assert.throws(() => extractDenials(malformed), /refused replay: incomplete/);
});

test('extractor starts at the retained checkpoint without inventing earlier denials', () => {
  const recorder = createRecordedEngine(0, { capacity: 4 });
  const actor = recorder.join();
  for (let seq = 1; seq <= 3; seq += 1) {
    recorder.admit(actor.id, input(seq));
    recorder.advance(1);
  }
  const record = recorder.window();
  assert.ok(record.startIndex > 0);
  assert.deepEqual(extractSignals(record).map((signal) => signal.tick), [2, 3]);
  assert.equal(classify(extractSignals(record), DEFAULT_SETTINGS), false);
});

test('extractor preserves actor identities separately and same-tick order', () => {
  const recorder = createRecordedEngine(0);
  const a = recorder.join();
  const b = recorder.join();
  recorder.admit(a.id, input(1));
  recorder.admit(b.id, input(1));
  recorder.advance(1);
  assert.deepEqual(extractDenials(recorder.window()).map(({ actorId, tick }) => [actorId, tick]), [['actor-1', 1], ['actor-2', 1]]);
  assert.equal(extractSignals(recorder.window(), { actorId: b.id }).length, 1);
});

test('evaluation report pins settings, exact source, corpus and stable split IDs before running', async () => {
  const source = await readFile(new URL('../evaluation/policy.mjs', import.meta.url), 'utf8');
  const corpus = generateCorpus();
  const plan = await prepareEvaluation({ settings: DEFAULT_SETTINGS, source, corpus });
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.settings));
  for (const key of ['settingsSha256', 'sourceSha256', 'corpusSha256']) assert.match(plan[key], /^[0-9a-f]{64}$/);
  assert.equal(plan.settingsSha256, hashValue(DEFAULT_SETTINGS));
  const report = await runEvaluation({ evaluate }, { plan, source, corpus });
  assert.deepEqual(report.plan, plan);
  assert.equal(report.exploration.positiveLabels, 1);
  assert.equal(report.evaluation.negativeLabels, 6);
  assert.equal(report.evaluation.result.metrics.total, 7);
  assert.equal(report.evaluation.result.metrics.fn, 0);
  for (const pair of report.indistinguishablePair.splits) {
    assert.deepEqual(pair.caseIds, [`${pair.split}/honest-delivery`, `${pair.split}/valid-automation`]);
    assert.deepEqual(pair.declaredAutomation, [false, true]);
    assert.equal(pair.identicalSignals, true);
    assert.equal(pair.sameDecision, true);
    assert.deepEqual(pair.decisions.map((item) => item.flagged), [false, false]);
  }
  assert.equal(report.noPositiveNoPrediction.metrics.precision, null);
  assert.equal(report.noPositiveNoPrediction.metrics.recall, null);
  assert.match(report.limitations, /do not estimate human/);
  await assert.rejects(runEvaluation({ evaluate }, { plan, source: `${source}\n`, corpus }), /plan changed/);
  await assert.rejects(runEvaluation({ evaluate }, { plan: { ...plan, settings: { ...DEFAULT_SETTINGS, threshold: 2 } }, source, corpus }), /plan changed/);
  await assert.rejects(prepareEvaluation({ settings: { ...DEFAULT_SETTINGS, threshold: 0 }, source, corpus }), /positive integer/);
});

test('automation metadata is never supplied to evaluation and its diagnostic cannot treat missing decisions as agreement', async () => {
  const plan = await prepareEvaluation({ settings: DEFAULT_SETTINGS, source: 'metadata separation' });
  const candidate = { evaluate(cases, settings) {
    for (const item of cases) assert.deepEqual(Object.keys(item).sort(), ['id', 'label', 'signals']);
    return evaluate(cases, settings);
  } };
  const report = await runEvaluation(candidate, { plan, source: 'metadata separation' });
  assert.equal(report.indistinguishablePair.splits.length, 2);
  const missing = await runEvaluation({ evaluate() { return { decisions: [], metrics: {} }; } }, { plan, source: 'metadata separation' });
  assert.equal(missing.indistinguishablePair.splits[0].sameDecision, false);
});

test('post-check feedback has source-linked answers and fresh prompts while keeping reviewer answers separate', async () => {
  const learner = postCheckFeedback();
  const reviewer = reviewerFeedback();
  assert.equal(learner.module, 'evaluation');
  assert.equal(learner.schema, 1);
  assert.equal(learner.predictions.length, 5);
  assert.equal(Object.hasOwn(learner, 'transfer'), false);
  assert.equal(Object.hasOwn(learner, 'freshVariantAnswers'), false);
  assert.deepEqual(reviewer.freshVariantAnswers.map((item) => item.id), learner.predictions.map((item) => item.id));
  const guide = await readFile(new URL('../evaluation/LEARNER.md', import.meta.url), 'utf8');
  const anchors = new Set([...guide.matchAll(/^## (.+)$/gm)].map((match) => `LEARNER.md#${match[1].toLowerCase().replaceAll(' ', '-')}`));
  for (const item of learner.predictions) {
    assert.ok(anchors.has(item.source));
    assert.ok(item.answer && item.reason && item.freshVariant.question);
    assert.deepEqual(Object.keys(item.freshVariant), ['question']);
  }
  assert.equal(reviewer.transfer.rubric.length, 5);
  assert.match(reviewer.transfer.referenceAnswer, /400²/);
  learner.predictions[0].answer = 'altered returned copy';
  assert.notEqual(postCheckFeedback().predictions[0].answer, learner.predictions[0].answer);
});

test('every fixture feedback pointer names a real learner section', async () => {
  const guide = await readFile(new URL('../evaluation/LEARNER.md', import.meta.url), 'utf8');
  const anchors = new Set([...guide.matchAll(/^## (.+)$/gm)].map((match) => match[1].toLowerCase().replaceAll(' ', '-')));
  for (const fixture of cases()) assert.ok(anchors.has(fixture.section), fixture.section);
});

test('reports snapshot a reused mutable candidate result and evaluation has fresh timing', async()=>{
 const shared={};
 const candidate={evaluate(cases,settings){Object.assign(shared,evaluate(cases,settings));return shared;}};
 const plan=await prepareEvaluation({settings:DEFAULT_SETTINGS,source:'reuse object'});
 const report=await runEvaluation(candidate,{plan,source:'reuse object'});
 assert.equal(report.exploration.result.metrics.total,7);
 assert.equal(report.evaluation.result.metrics.total,7);
 assert.equal(report.noPositiveNoPrediction.metrics.total,1);
 const corpus=generateCorpus();
 for(const family of ['isolated-distant-errors','repeated-distant-invalid']) {
  const cases=corpus.cases.filter(item=>item.family===family);
  assert.notDeepEqual(cases[0].signals,cases[1].signals);
 }
});
