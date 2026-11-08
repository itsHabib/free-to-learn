import { isDeepStrictEqual } from 'node:util';
import { fork } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, addActor } from './state.mjs';
import { correctPolicies, wrongPolicies, wrongAdapters } from './controls.mjs';

const request = { requestId: 'first', stationId: 'alpha' };
const firstReceipt = { ...request, energyAdded: 3, creditsSpent: 2, energy: 7, credits: 4 };
const actor = (state) => state.actors[0];
const base = () => addActor(initialState(), 'actor-1');
const copy = (value) => structuredClone(value);
const reply = (state, reason, receipt = null) => ({ state, reason, receipt });

export function cases() {
  const success = base();
  Object.assign(actor(success), { energy: 7, credits: 4, receipts: [copy(firstReceipt)] });
  const result = [{ name: 'successful resource transaction', state: base(), request, expected: reply(success, 'repaired', copy(firstReceipt)), section: 'one-resource-transaction' }];
  const denied = (name, edit, reason, section) => {
    const state = base();
    edit(state);
    result.push({ name, state, request, expected: reply(copy(state), reason), section });
  };
  const boundary = base();
  actor(boundary).x = 400;
  const boundaryNext = copy(success);
  actor(boundaryNext).x = 400;
  result.push({ name: 'inclusive range edge', state: boundary, request, expected: reply(boundaryNext, 'repaired', copy(firstReceipt)), section: 'one-resource-transaction' });
  denied('diagonal range', (state) => Object.assign(actor(state), { x: 300, y: 300 }), 'range', 'one-resource-transaction');
  denied('failed request changes nothing', (state) => { actor(state).x = 401; }, 'range', 'failed-requests');
  denied('full energy', (state) => { actor(state).energy = 10; }, 'full', 'one-resource-transaction');
  denied('insufficient funds', (state) => { actor(state).credits = 1; }, 'funds', 'one-resource-transaction');
  const unknown = base();
  result.push({ name: 'unknown station', state: unknown, request: { ...request, stationId: 'missing' }, expected: reply(copy(unknown), 'station'), section: 'one-resource-transaction' });
  const partial = base();
  actor(partial).energy = 9;
  const partialNext = copy(partial);
  const partialReceipt = { ...request, energyAdded: 1, creditsSpent: 2, energy: 10, credits: 4 };
  Object.assign(actor(partialNext), { energy: 10, credits: 4, receipts: [copy(partialReceipt)] });
  result.push({ name: 'partial top-up', state: partial, request, expected: reply(partialNext, 'repaired', partialReceipt), section: 'one-resource-transaction' });
  const retried = copy(success);
  actor(retried).x = 900;
  result.push({ name: 'retry after movement returns original receipt', state: retried, request, expected: reply(copy(retried), 'duplicate', copy(firstReceipt)), section: 'request-identity' });
  result.push({ name: 'station conflict', state: copy(success), request: { ...request, stationId: 'beta' }, expected: reply(copy(success), 'conflict'), section: 'request-identity' });
  const bounded = copy(success);
  bounded.config.receiptLimit = 1;
  result.push({ name: 'history bound refuses a new ID', state: bounded, request: { requestId: 'new', stationId: 'alpha' }, expected: reply(copy(bounded), 'history-full'), section: 'bounded-receipts' });
  const scoped = addActor(success, 'actor-2');
  scoped.config.receiptLimit = 1;
  const scopedNext = copy(scoped);
  Object.assign(scopedNext.actors[1], { energy: 7, credits: 4, receipts: [copy(firstReceipt)] });
  result.push({ name: 'same ID and receipt capacity are scoped to each actor', state: scoped, actorId: 'actor-2', request, expected: reply(scopedNext, 'repaired', copy(firstReceipt)), section: 'request-identity' });
  const multiple = copy(bounded);
  Object.assign(actor(multiple), { x: 999, energy: 10, credits: 0 });
  result.push({ name: 'history takes precedence over range full and funds', state: multiple, request: { ...request, requestId: 'new' }, expected: reply(copy(multiple), 'history-full'), section: 'one-resource-transaction' });
  result.push({ name: 'unknown station takes precedence over full history', state: multiple, request: { requestId: 'new', stationId: 'missing' }, expected: reply(copy(multiple), 'station'), section: 'one-resource-transaction' });
  denied('range takes precedence over full energy', (state) => Object.assign(actor(state), { x: 999, energy: 10 }), 'range', 'one-resource-transaction');
  denied('full energy takes precedence over funds', (state) => Object.assign(actor(state), { energy: 10, credits: 0 }), 'full', 'one-resource-transaction');
  return result;
}

function details(error) {
  return { name: error?.name ?? 'Error', message: String(error?.message ?? error), expected: error?.expected ?? null, actual: error?.actual ?? null };
}

function objectReferences(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return seen;
  seen.add(value);
  for (const child of Object.values(value)) objectReferences(child, seen);
  return seen;
}

export const SCENARIO_TIMEOUT_MS = 1000;
export const SCENARIO_BUDGET_MS = 8000;
export class ScenarioRunnerError extends Error {
  constructor(message) { super(message); this.name = 'ScenarioRunnerError'; }
}

/** One fresh process and module graph per variant, including imported helpers. */
export function runScenario(scenarioPath, { variant = 'reference', policyPath = '', timeout = SCENARIO_TIMEOUT_MS, deadline } = {}) {
  if (typeof scenarioPath !== 'string' || !isAbsolute(scenarioPath)) throw new TypeError('Use an absolute captured scenarioPath, not an imported function.');
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > SCENARIO_BUDGET_MS) throw new RangeError('Invalid scenario timeout.');
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'NODE_PATH']) delete env[key];
    const child = fork(fileURLToPath(new URL('./scenario-worker.mjs', import.meta.url)), [scenarioPath, variant, policyPath], {
      env, execArgv: [], detached: false, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let result;
    let problem;
    let outputBytes = 0;
    let output = '';
    let messages = 0;
    const stop = (message) => { problem ??= message; child.kill('SIGKILL'); };
    const wait = deadline === undefined ? timeout : Math.max(0, Math.min(timeout, deadline - Date.now()));
    const timer = setTimeout(() => stop('Scenario timed out.'), wait);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (Buffer.byteLength(output) < 4096) output = Buffer.concat([Buffer.from(output), chunk]).subarray(0, 4096).toString('utf8');
      if (outputBytes > 65536) stop('Scenario exceeded its output bound.');
    });
    child.on('message', (message) => {
      messages += 1;
      if (messages !== 1 || message?.type !== 'capstone-result') return stop('Invalid scenario result channel.');
      result = message.result;
    });
    child.once('error', (error) => { problem = error.message; });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (problem || code !== 0 || !result) return resolve({ status: 'runner-failure', error: { message: problem ?? `Worker exited without a result (${code ?? signal}).` }, trace: [], outputBytes, output, exit: { code, signal } });
      resolve({ ...result, outputBytes, output, exit: { code, signal } });
    });
  });
}

export function assessPolicy(candidate) {
  const criteria = [];
  if (typeof candidate?.repair !== 'function') return { passed: false, criteria: [{ name: 'export repair', passed: false, error: { message: 'Export repair(state, actorId, request).', expected: 'function', actual: typeof candidate?.repair, source: 'LEARNER.md#policy-contract' } }] };
  for (const item of cases()) {
    const state = copy(item.state);
    const input = copy(item.request);
    let actual;
    try { actual = candidate.repair(state, item.actorId ?? 'actor-1', input); }
    catch (error) { actual = { threw: details(error) }; }
    const passed = isDeepStrictEqual(actual, item.expected);
    criteria.push({ name: item.name, passed, ...(!passed ? { error: { message: `Check ${item.name}.`, expected: item.expected, actual, source: `LEARNER.md#${item.section}` } } : {}) });
    const unchanged = isDeepStrictEqual(state, item.state) && isDeepStrictEqual(input, item.request);
    criteria.push({ name: `${item.name}: source unchanged`, passed: unchanged, ...(!unchanged ? { error: { message: 'Return fresh state without changing the input.', expected: { unchanged: true }, actual: { unchanged }, source: 'LEARNER.md#policy-contract' } } : {}) });
    const sourceObjects = objectReferences(state);
    const fresh = Boolean(actual?.state) && [...objectReferences(actual.state)].every((value) => !sourceObjects.has(value));
    criteria.push({ name: `${item.name}: fresh state`, passed: fresh, ...(!fresh ? { error: { message: 'Detach the returned state, including nested state objects, from the input.', expected: { fresh: true }, actual: { fresh }, source: 'LEARNER.md#policy-contract' } } : {}) });
  }
  return { passed: criteria.every((criterion) => criterion.passed), criteria };
}

export async function assess(candidate, { timeout = SCENARIO_TIMEOUT_MS, budget = SCENARIO_BUDGET_MS } = {}) {
  const { criteria } = assessPolicy(candidate);
  if (typeof candidate?.scenarioPath !== 'string' || !isAbsolute(candidate.scenarioPath) || typeof candidate?.policyPath !== 'string' || !isAbsolute(candidate.policyPath)) {
    criteria.push({ name: 'captured policy and independent HTTP scenario', passed: false, error: { message: 'The owner runner must supply absolute captured policyPath and scenarioPath.', expected: 'two captured source paths', actual: { policyPath: typeof candidate?.policyPath, scenarioPath: typeof candidate?.scenarioPath }, source: 'LEARNER.md#independent-http-tests' } });
    return { passed: false, criteria };
  }
  const variants = [
    { name: 'submitted policy with captured scenario', variant: 'submitted', expected: 'passed' },
    ...correctPolicies.map((policy) => ({ name: policy.name, variant: policy.name, expected: 'passed' })),
    ...wrongPolicies.filter((policy) => !policy.policyOnly).map((policy) => ({ name: policy.name, variant: policy.name, expected: 'assertion-failure' })),
    ...wrongAdapters.map((adapter) => ({ name: adapter.name, variant: adapter.name, expected: 'assertion-failure' })),
  ];
  const deadline = Date.now() + Math.min(budget, SCENARIO_BUDGET_MS);
  const scenarios = [];
  for (const variant of variants) {
    const remaining = deadline - Date.now();
    const result = remaining > 0
      ? await runScenario(candidate.scenarioPath, { variant: variant.variant, policyPath: candidate.policyPath, timeout, deadline })
      : { status: 'runner-failure', error: { message: 'Whole scenario budget exhausted.' }, trace: [] };
    const diagnostic = { name: variant.name, variant: variant.variant, status: result.status,
      output: result.output ?? '', outputBytes: result.outputBytes ?? 0,
      outputTruncated: (result.outputBytes ?? 0) > 4096 };
    scenarios.push(diagnostic);
    if (result.status === 'runner-failure') {
      const error = new ScenarioRunnerError(`${variant.name}: ${result.error.message}`);
      error.input = { scenarios, completedCriteria: criteria,
        incompleteCriterion: `HTTP scenario: ${variant.name}` };
      throw error;
    }
    const passed = result.status === variant.expected;
    criteria.push({ name: `HTTP scenario: ${variant.name}`, passed, ...(!passed ? { error: { message: variant.expected === 'passed' ? `The scenario must read state, submit a repair and allow correct behavior. ${result.error?.message ?? ''}` : 'Expose this defect through real HTTP state assertions; crashes and fabricated errors do not count.', expected: variant.expected, actual: { status: result.status, error: result.error ?? null, activity: result.activity ?? null, output: result.output ?? '' }, source: 'LEARNER.md#independent-http-tests' } } : {}) });
  }
  return { passed: criteria.every((criterion) => criterion.passed), criteria, evidence: { scenarios } };
}
