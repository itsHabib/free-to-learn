import assert from 'node:assert/strict';
import test from 'node:test';
import { fixedRule, formatRace, race, trainChooser } from './lib/bakeoff.mjs';
import { checkPolicy } from './lib/policy-check.mjs';
import * as policy from './reference/policy.mjs';
import { run } from './reference/runtime.mjs';

const observation = (remainingRows, nulls, compiled = false) => ({
  remainingRows, compiled, previous: { rows: 256, nulls, guardFailures: 0 },
});

test('fixed rule distinguishes no history, cost of a fresh compile, and a cached predicate', () => {
  assert.equal(fixedRule({ remainingRows: 4096, compiled: false, previous: { rows: 0, nulls: 0 } }), 'interpret');
  assert.equal(fixedRule(observation(511, 0)), 'interpret');
  assert.equal(fixedRule(observation(511, 0, true)), 'compile');
  assert.equal(fixedRule(observation(512, 8)), 'compile');
  assert.equal(fixedRule(observation(512, 9)), 'interpret');
});

test('checker accepts equivalent policy code and rejects misleading signals and hardwired leaves', () => {
  checkPolicy(policy);
  checkPolicy({ feature: ({ previous: p }) => p.nulls / (p.rows || 1),
    chooseLearned: (score, model) => model[score > model.cutoff ? 'high' : 'low'] });
  assert.throws(() => checkPolicy({ ...policy, feature: ({ previous: p }) => p.guardFailures / (p.rows || 1) }), /null count/);
  assert.throws(() => checkPolicy({ ...policy, chooseLearned: score => score <= 0.25 ? 'compile' : 'interpret' }), /Training can reverse/);
});

test('a fitted chooser actually calls the learner model at decision time', () => {
  const calls = [];
  const choose = trainChooser({ run, ...policy, chooseLearned: (score, model) => {
    calls.push(model);
    return policy.chooseLearned(score, model);
  } });
  assert.ok(new Set(calls).size > 1);
  calls.length = 0;
  const { matches, trace } = run([['load'], ['const', 30], ['gt']], [40, null, 29, 79, 31], { choose, batchSize: 2 });
  assert.deepEqual(matches, [0, 3, 4]);
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls).size, 1);
  assert.equal(trace.filter(event => event.kind === 'decision').length, 3);
});

test('shift changes bailout position while preserving each case’s results and matched count', () => {
  const report = race({ run, ...policy, repeats: 2, testSeed: 0, shift: true });
  const [first, last] = report.cases;
  assert.equal(first.matches, last.matches);
  assert.equal(first.traces.rule.compiledRows, 0);
  assert.equal(last.traces.rule.compiledRows, 15 * 255);
  for (const data of report.cases) {
    assert.equal(data.samples.rule.length, 2);
    assert.equal(data.samples.model.length, 2);
    assert.ok(data.samples.model.every(time => Number.isFinite(time) && time >= 0));
  }
  assert.match(formatRace(report), /One held-out pass including one fit/);
  assert.throws(() => race({ run, ...policy, testSeed: 271 }), /belongs to training/);
});

test('identical cardinality with an incorrect ordered ID invalidates the measurement', () => {
  function wrongRun(...args) {
    const result = run(...args);
    result.matches[0] = -1;
    return result;
  }
  assert.throws(() => race({ run: wrongRun, ...policy }), /Expected .*Timing discarded/);
});

test('stationary workloads exercise a cold 80-row query and a cached 80-row tail',()=>{
  const states=new Set();
  const record=(program,values,{choose,batchSize})=>run(program,values,{batchSize,choose:observation=>{
    if(observation.remainingRows===80) states.add(observation.compiled);
    return choose(observation);
  }});
  const report = race({run:record,...policy,repeats:2,testSeed:9001});
  assert.match(formatRace(report),/last batch 80 rows, cold -> interpret/);
  assert.match(formatRace(report),/last batch 80 rows, cached -> compile/);
  assert.deepEqual(states,new Set([false,true]));
});
